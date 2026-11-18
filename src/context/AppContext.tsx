'use client';

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { store, saveSnapshot, type Op } from '../lib/db';
import type { DB, Session, Settings } from '../lib/types';
import { can as canRole, settingsOf, type Perm } from '../lib/logic';
import { makeRange, type Range, type RangeKey } from '../lib/format';

export type Tone = 'good' | 'bad' | 'warn' | 'info';

interface Ctx {
  db: DB;
  version: number;
  settings: Settings;
  ready: boolean;
  syncError: string | null;
  saving: boolean;
  me: Session | null;
  signIn: (s: Session, remember: boolean) => void;
  signOut: () => void;
  can: (p: Perm) => boolean;
  page: string;
  tab: string;
  params: URLSearchParams;
  go: (path: string) => void;
  goto: (path: string) => void;
  denied: (need?: string) => boolean;
  range: Range;
  setRange: (k: RangeKey, from?: string, to?: string) => void;
  commit: (ops: Op[], okMsg?: string) => Promise<boolean>;
  toast: (msg: string, tone?: Tone) => void;
  toastState: { msg: string; tone: Tone; n: number } | null;
  modals: React.ReactNode[];
  openModal: (el: React.ReactNode) => void;
  closeModal: () => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}

export interface ConfirmOpts {
  title: string;
  body?: React.ReactNode;
  ok?: string;
  danger?: boolean;
}

const AppCtx = createContext<Ctx | null>(null);
const SESSION_KEY = 'mts-session';

function readHash(): { page: string; tab: string; params: URLSearchParams } {
  if (typeof window === 'undefined') return { page: 'home', tab: '', params: new URLSearchParams() };
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, q] = raw.split('?');
  const [page, tab] = (path || 'home').split('/');
  return { page: page || 'home', tab: tab || '', params: new URLSearchParams(q || '') };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const version = useSyncExternalStore(
    (fn) => store.subscribe(fn),
    () => store.version,
    () => 0
  );
  const db = store.data;
  const settings = useMemo(() => settingsOf(db), [db.settings]); // eslint-disable-line react-hooks/exhaustive-deps


  /* ---- session ---- */
  const [me, setMe] = useState<Session | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      if (raw) setMe(JSON.parse(raw));
    } catch {
      /* no saved session */
    }
  }, []);
  // A user who is switched off or removed is signed out on every counter at once.
  useEffect(() => {
    if (!me || !store.ready) return;
    const u = db.users.find((x) => x.id === me.userId);
    if (db.users.length && (!u || !u.active)) {
      setMe(null);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } else if (u && (u.role !== me.role || u.name !== me.name)) {
      const next = { ...me, role: u.role, name: u.name };
      setMe(next);
    }
  }, [version, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback((s: Session, remember: boolean) => {
    setMe(s);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    if (remember) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
    window.location.hash = s.role === 'cashier' ? '#/pos' : '#/home';
  }, []);
  const signOut = useCallback(() => {
    setMe(null);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    window.location.hash = '';
  }, []);
  const can = useCallback((p: Perm) => canRole(me?.role, p), [me]);

  /* ---- navigation (hash routes: #/page/tab?x=y) ---- */
  const [route, setRoute] = useState(readHash);
  useEffect(() => {
    const on = () => setRoute(readHash());
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((path: string) => {
    window.location.hash = '#/' + path.replace(/^#?\/?/, '');
  }, []);

  /* ---- period ---- */
  const [range, setRangeState] = useState<Range>(() => makeRange('today'));
  const setRange = useCallback((k: RangeKey, from?: string, to?: string) => setRangeState(makeRange(k, from, to)), []);

  /* ---- toast ---- */
  const [toastState, setToast] = useState<Ctx['toastState']>(null);
  const tRef = useRef<any>(null);
  const toast = useCallback((msg: string, tone: Tone = 'good') => {
    setToast((t) => ({ msg, tone, n: (t?.n || 0) + 1 }));
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setToast(null), tone === 'bad' ? 6000 : 3200);
  }, []);

  /* ---- modals ---- */
  const [modals, setModals] = useState<React.ReactNode[]>([]);
  const openModal = useCallback((el: React.ReactNode) => setModals((m) => [...m, el]), []);
  // Moving to another screen closes any open dialog. A layout effect runs before the new screen's
  // own effects, so a dialog the new screen opens itself (e.g. ?new=1) is kept.
  useLayoutEffect(() => {
    setModals([]);
  }, [route.page, route.tab]);
  const closeModal = useCallback(() => setModals((m) => m.slice(0, -1)), []);
  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        const done = (v: boolean) => {
          setModals((m) => m.slice(0, -1));
          resolve(v);
        };
        setModals((m) => [...m, <ConfirmBox key={'c' + Date.now()} o={o} done={done} />]);
      }),
    []
  );

  /* ---- writes ---- */
  const commit = useCallback(
    async (ops: Op[], okMsg?: string) => {
      try {
        // The screen is updated at once; a slow connection only delays the cloud copy.
        const slow = new Promise<'slow'>((r) => setTimeout(() => r('slow'), 4000));
        const res = await Promise.race([store.commit(ops).then(() => 'ok' as const), slow]);
        if (res === 'slow') toast('Saved on this counter — it will reach the cloud when the internet is back.', 'warn');
        else if (okMsg) toast(okMsg, 'good');
        return true;
      } catch (e: any) {
        toast(e?.message || 'Could not save.', 'bad');
        return false;
      }
    },
    [toast]
  );

  // One automatic snapshot a day in this browser, as a second safety net besides the backup file.
  useEffect(() => {
    if (!store.ready || !me || me.role !== 'owner' || !db.products.length) return;
    const k = 'mts-snap-day';
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(k) === today) return;
    localStorage.setItem(k, today);
    saveSnapshot(db);
  }, [me, store.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: Ctx = {
    db, version, settings, ready: store.ready, syncError: store.error, saving: store.pending > 0,
    me, signIn, signOut, can,
    page: route.page, tab: route.tab, params: route.params, go, goto: go,
    denied: (need?: string) => !!need && !canRole(me?.role, need as Perm),
    range, setRange, commit, toast, toastState, modals, openModal, closeModal, confirm,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

function ConfirmBox({ o, done }: { o: ConfirmOpts; done: (v: boolean) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [done]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div className="modal sm" role="alertdialog" aria-modal="true">
        <div className="modal-h">
          <h2>{o.title}</h2>
        </div>
        {o.body && <div className="modal-b">{o.body}</div>}
        <div className="modal-f">
          <span className="spacer" />
          <button className="btn" onClick={() => done(false)}>
            Cancel
          </button>
          <button className={`btn ${o.danger ? 'bad' : 'pri'}`} autoFocus onClick={() => done(true)}>
            {o.ok || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
