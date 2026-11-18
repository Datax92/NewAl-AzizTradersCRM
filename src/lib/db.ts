/* The shop's data store.

   Two back-ends behind one interface:
   • cloud  — Firestore. Both counters (and the owner's phone) read and write the same
              database and see each other's bills within a second (live listeners).
              Chosen automatically when NEXT_PUBLIC_FIREBASE_* keys are set.
   • local  — IndexedDB in this browser. Every open tab stays in step through a
              BroadcastChannel, so two windows behave like two counters. Used for
              trials, demos and a single-computer shop.

   Screens never talk to a back-end directly: they call commit() with a list of
   operations. Operations are applied to memory at once (the screen updates
   instantly), then written. Stock is changed with an increment, so two counters
   selling the same item at the same moment can never overwrite each other. */

import { shopDetailsUpgrade } from './shop-details';
import type { Coll, DB } from './types';
import { COLLS } from './types';

export type Op =
  | { t: 'put'; c: Coll; d: any }
  | { t: 'del'; c: Coll; id: string }
  | { t: 'inc'; c: Coll; id: string; field: string; by: number };

type Listener = () => void;

function emptyDB(): DB {
  const db: any = {};
  COLLS.forEach((c) => (db[c] = []));
  return db as DB;
}

/* ------------------------------ firebase config ------------------------------ */

export const FIREBASE = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};
export const CLOUD = Boolean(FIREBASE.apiKey && FIREBASE.projectId);

// This client preview uses isolated browser data; set to false for a real shop.
export const DEMO_MODE = !CLOUD && process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

/* ------------------------------ in-memory state ------------------------------ */

class Store {
  data: DB = emptyDB();
  version = 0;
  mode: 'local' | 'cloud' = CLOUD ? 'cloud' : 'local';
  ready = false;
  error: string | null = null;
  pending = 0; // writes not yet confirmed
  private listeners = new Set<Listener>();
  private backend: Backend | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  async init() {
    if (this.backend) return;
    this.backend = CLOUD ? await makeCloud(this) : await makeLocal(this);
    if (DEMO_MODE && !this.data.users.length) {
      const { buildDemo, DEMO_ACCOUNTS } = await import('./seed');
      const { hashPin } = await import('./format');
      const admin = DEMO_ACCOUNTS[0];
      const { db } = await buildDemo(admin.name);
      db.users.unshift({ id: 'u-demo-admin', name: admin.name, username: admin.username,
        role: admin.role, pinHash: await hashPin(admin.username, admin.pin),
        active: true, createdAt: new Date().toISOString() });
      const ops: Op[] = [];
      COLLS.forEach((c) => (db[c] as any[]).forEach((d) => ops.push({ t: 'put', c, d })));
      await this.commit(ops);
    }
    const settings = this.data.settings[0];
    if (DEMO_MODE && settings) {
      const patch = shopDetailsUpgrade({ ...settings });
      if (Object.keys(patch).length) {
        await this.commit([{ t: 'put', c: 'settings', d: { ...settings, ...patch } }]);
      }
    }
    this.ready = true;
    this.emit();
  }

  /** Apply to memory (instant), then persist. Throws if the write is refused. */
  async commit(ops: Op[]) {
    if (!ops.length) return;
    applyOps(this.data, ops);
    this.emit();
    if (!this.backend) return;
    this.pending++;
    this.emit();
    try {
      await this.backend.write(ops);
      this.error = null;
    } catch (e: any) {
      this.error = writeMessage(e);
      throw new Error(this.error);
    } finally {
      this.pending--;
      this.emit();
    }
  }

  /** Replace every record (restore from backup). */
  async replaceAll(next: DB) {
    const ops: Op[] = [];
    COLLS.forEach((c) => {
      (this.data[c] as any[]).forEach((d) => ops.push({ t: 'del', c, id: d.id }));
    });
    COLLS.forEach((c) => {
      ((next as any)[c] || []).forEach((d: any) => ops.push({ t: 'put', c, d }));
    });
    // Deletes of records that are put back are harmless: applyOps processes in order.
    await this.commit(ops);
  }
}

function writeMessage(e: any): string {
  const code = String(e?.code || '');
  if (code === 'permission-denied') return 'Not saved — this device is not allowed to write to the cloud database. Sign in with the shop account again.';
  if (code === 'unavailable') return 'Saved on this device — it will reach the cloud when the internet is back.';
  if (e?.name === 'QuotaExceededError') return 'Not saved — this browser is out of storage space. Take a backup and move to the cloud database.';
  return 'Could not save — please try again.';
}

export function applyOps(db: DB, ops: Op[]) {
  for (const op of ops) {
    const list = db[op.c] as any[];
    if (op.t === 'put') {
      const i = list.findIndex((x) => x.id === op.d.id);
      if (i >= 0) list[i] = { ...list[i], ...op.d };
      else list.push(op.d);
    } else if (op.t === 'del') {
      const i = list.findIndex((x) => x.id === op.id);
      if (i >= 0) list.splice(i, 1);
    } else {
      const x = list.find((r) => r.id === op.id);
      if (x) x[op.field] = Math.round(((Number(x[op.field]) || 0) + op.by) * 1000) / 1000;
    }
  }
  // Mutations above keep array identity; give each touched list a new identity so memos refresh.
  const touched = new Set(ops.map((o) => o.c));
  touched.forEach((c) => ((db as any)[c] = (db[c] as any[]).slice()));
}

export const store = new Store();

/* ------------------------------ back-ends ------------------------------ */

interface Backend {
  write(ops: Op[]): Promise<void>;
}

/* ---- local: IndexedDB + BroadcastChannel ---- */

const IDB_NAME = 'mobile-tools-shop';
const IDB_STORE = 'docs';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'k' });
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'day' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function makeLocal(s: Store): Promise<Backend> {
  const db = await idb();
  const all: any[] = await new Promise((res, rej) => {
    const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const data = emptyDB();
  all.forEach((row) => {
    if ((data as any)[row.c]) (data as any)[row.c].push(row.d);
  });
  s.data = data;

  const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mts-sync') : null;
  if (chan) {
    chan.onmessage = (ev) => {
      if (ev.data?.ops) {
        applyOps(s.data, ev.data.ops);
        s.emit();
      }
    };
  }

  return {
    write(ops) {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const os = tx.objectStore(IDB_STORE);
        for (const op of ops) {
          if (op.t === 'del') os.delete(`${op.c}/${op.id}`);
          else {
            const id = op.t === 'put' ? op.d.id : op.id;
            const rec = (s.data[op.c] as any[]).find((x) => x.id === id);
            if (rec) os.put({ k: `${op.c}/${id}`, c: op.c, d: JSON.parse(JSON.stringify(rec)) });
          }
        }
        tx.oncomplete = () => {
          chan?.postMessage({ ops });
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
  };
}

/* ---- daily snapshots kept in this browser (last 14 days) ---- */

export async function saveSnapshot(data: DB) {
  try {
    const db = await idb();
    const day = new Date().toISOString().slice(0, 10);
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('snapshots', 'readwrite');
      const os = tx.objectStore('snapshots');
      os.put({ day, at: new Date().toISOString(), data: JSON.parse(JSON.stringify(data)) });
      const keys = os.getAllKeys();
      keys.onsuccess = () => {
        const list = (keys.result as string[]).sort();
        list.slice(0, Math.max(0, list.length - 14)).forEach((k) => os.delete(k));
      };
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* snapshots are a convenience; the backup file is the real safety net */
  }
}

export async function listSnapshots(): Promise<{ day: string; at: string; size: number }[]> {
  try {
    const db = await idb();
    const all: any[] = await new Promise((res, rej) => {
      const r = db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return all
      .map((x) => ({ day: x.day, at: x.at, size: JSON.stringify(x.data).length }))
      .sort((a, b) => (a.day < b.day ? 1 : -1));
  } catch {
    return [];
  }
}

export async function readSnapshot(day: string): Promise<DB | null> {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction('snapshots', 'readonly').objectStore('snapshots').get(day);
    r.onsuccess = () => res(r.result?.data || null);
    r.onerror = () => rej(r.error);
  });
}

/* ---- cloud: Firestore ---- */

let fbAuth: any = null;

export async function cloudAuth() {
  if (fbAuth) return fbAuth;
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps().length ? getApp() : initializeApp(FIREBASE);
  fbAuth = getAuth(app);
  return fbAuth;
}

function clean(v: any): any {
  if (v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const o: any = {};
    Object.entries(v).forEach(([k, x]) => {
      if (x !== undefined) o[k] = clean(x);
    });
    return o;
  }
  return v;
}

async function makeCloud(s: Store): Promise<Backend> {
  const { getApps, getApp, initializeApp } = await import('firebase/app');
  const fs = await import('firebase/firestore');
  const app = getApps().length ? getApp() : initializeApp(FIREBASE);
  // Keeps a copy on the device, so a short internet drop does not stop billing.
  let db: any;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }

  await new Promise<void>((resolve) => {
    const seen = new Set<string>();
    COLLS.forEach((c) => {
      fs.onSnapshot(
        fs.collection(db, c),
        (snap: any) => {
          const docs: any[] = [];
          snap.forEach((d: any) => docs.push({ ...d.data(), id: d.id }));
          (s.data as any)[c] = docs;
          s.error = null;
          seen.add(c);
          if (seen.size === COLLS.length) resolve();
          if (s.ready) s.emit();
        },
        (err: any) => {
          s.error =
            err?.code === 'permission-denied'
              ? 'The cloud database refused this device. Check the Firestore rules and the shop account.'
              : 'Cannot reach the cloud database. Check the internet connection.';
          seen.add(c);
          if (seen.size === COLLS.length) resolve();
          s.emit();
        }
      );
    });
  });

  return {
    async write(ops) {
      for (let i = 0; i < ops.length; i += 450) {
        const batch = fs.writeBatch(db);
        ops.slice(i, i + 450).forEach((op) => {
          if (op.t === 'put') batch.set(fs.doc(db, op.c, op.d.id), clean(op.d), { merge: true });
          else if (op.t === 'del') batch.delete(fs.doc(db, op.c, op.id));
          else batch.update(fs.doc(db, op.c, op.id), { [op.field]: fs.increment(op.by) });
        });
        await batch.commit();
      }
    },
  };
}
