'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Save, Plus, Download, Upload, Trash2, ShieldCheck, KeyRound, Check, X, HardDrive, Cloud, RotateCcw, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, DataTable, Field, NumInput, Tag, Modal, Kpi, type Col } from '../Shared';
import type { AuditEntry, Role, Settings, User, DB } from '../../lib/types';
import { COLLS } from '../../lib/types';
import { auditOp, ROLE_LABEL, can as roleCan, type Perm } from '../../lib/logic';
import { dFull, hashPin, initials, uid, ymd, relDay } from '../../lib/format';
import { store, CLOUD, listSnapshots, readSnapshot } from '../../lib/db';
import type { Op } from '../../lib/db';

export function SettingsPage() {
  const t = useTab();
  if (t === 'users') return <Users />;
  if (t === 'lists') return <Lists />;
  if (t === 'backup') return <Backup />;
  if (t === 'audit') return <Audit />;
  if (t === 'me') return <MyPin />;
  return <Shop />;
}

function Shop() {
  const { settings, commit, me } = useApp();
  const [f, setF] = useState<Settings>(settings);
  useEffect(() => setF(settings), [settings]);
  const set = (k: keyof Settings, v: any) => setF((x) => ({ ...x, [k]: v }));
  const save = () => commit([{ t: 'put', c: 'settings', d: f }, auditOp(me!.name, 'Shop settings changed', f.shopName, 'info')], 'Settings saved');
  return (
    <Page title="Shop & receipt" urdu="دکان و رسید" sub="Printed on every bill and invoice." actions={<button className="btn pri" onClick={save}><Save size={15} /> Save</button>}>
      <div className="grid c2u">
        <Panel title="Shop details">
          <div className="formgrid">
            <Field label="Shop name" full><input value={f.shopName} onChange={(e) => set('shopName', e.target.value)} /></Field>
            <Field label="Tagline" full><input value={f.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
            <Field label="Address" full><input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label="Primary contact"><input value={f.contactName || ''} onChange={(e) => set('contactName', e.target.value)} /></Field>
            <Field label="Phone"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Secondary contact"><input value={f.secondaryContactName || ''} onChange={(e) => set('secondaryContactName', e.target.value)} /></Field>
            <Field label="Secondary phone"><input value={f.secondaryPhone || ''} onChange={(e) => set('secondaryPhone', e.target.value)} /></Field>
            <Field label="WhatsApp"><input value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
            <Field label="WhatsApp link" full><input type="url" value={f.whatsappUrl || ''} onChange={(e) => set('whatsappUrl', e.target.value)} /></Field>
            <Field label="NTN / STRN (optional)"><input value={f.ntn || ''} onChange={(e) => set('ntn', e.target.value)} /></Field>
            <Field label="Receipt footer" full><textarea rows={2} value={f.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} /></Field>
          </div>
        </Panel>
        <Panel title="Rules">
          <div className="formgrid">
            <Field label="Counters" hint="One per line. Each computer picks its counter at sign-in." full>
              <textarea rows={3} value={f.counters.join('\n')} onChange={(e) => set('counters', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
            </Field>
            <Field label="Cashier discount limit (%)" hint="Above this, a manager or owner must make the bill."><NumInput value={f.cashierDiscountLimit} onChange={(n) => set('cashierDiscountLimit', n)} min={0} /></Field>
            <Field label="Alert me on discounts over (%)"><NumInput value={f.bigDiscountAlert} onChange={(n) => set('bigDiscountAlert', n)} min={0} /></Field>
            <Field label="Khata overdue after (days)"><NumInput value={f.overdueDays} onChange={(n) => set('overdueDays', n)} min={1} /></Field>
          </div>
        </Panel>
      </div>
    </Page>
  );
}

const PERM_ROWS: [string, Perm][] = [
  ['Billing & returns', 'pos'], ['Stock IN / OUT', 'stock'], ['Khata payments', 'khata'], ['Add / edit products', 'products.edit'], ['Change prices', 'prices'],
  ['See cost price', 'cost.view'], ['Discount over the limit', 'bigDiscount'], ['Purchases & suppliers', 'purchases'], ['Expenses', 'expenses'], ['Cash & bank', 'cashbook'],
  ['Reports', 'reports'], ['See profit', 'profit'], ['Cancel a bill', 'void'], ['Settings & users', 'settings'], ['Backup & restore', 'backup'],
];

function Users() {
  const { db, openModal } = useApp();
  const cols: Col<User>[] = [
    { key: 'name', label: 'Name', render: (u) => <span className="uname"><span className={`ini r-${u.role}`}>{initials(u.name)}</span><b>{u.name}</b></span> },
    { key: 'username', label: 'Username', render: (u) => <span className="mono">{u.username}</span> },
    { key: 'role', label: 'Role', render: (u) => <Tag tone={u.role === 'owner' ? 'violet' : u.role === 'manager' ? 'info' : 'mute'}>{ROLE_LABEL[u.role]}</Tag> },
    { key: 'phone', label: 'Phone', get: (u) => u.phone || '' },
    { key: 'active', label: 'Status', render: (u) => (u.active ? <Tag tone="good">Active</Tag> : <Tag tone="bad">Switched off</Tag>) },
    { key: 'last', label: 'Last bill', get: (u) => db.sales.filter((s) => s.userId === u.id).reduce((a, s) => (s.date > a ? s.date : a), ''), render: (u) => { const d = db.sales.filter((s) => s.userId === u.id).reduce((a, s) => (s.date > a ? s.date : a), ''); return d ? relDay(d) : <span className="muted">—</span>; } },
  ];
  return (
    <Page title="Users & roles" urdu="صارفین" sub="Everyone who signs in. Each person has their own PIN, so every bill shows who made it." actions={<button className="btn pri" onClick={() => openModal(<UserForm />)}><UserPlus size={15} /> Add user</button>}>
      <div className="panel"><div className="panel-b"><DataTable rows={db.users} cols={cols} search={false} onRow={(u) => openModal(<UserForm user={u} />)} /></div></div>
      <Panel title="What each role can do" cls="mt">
        <table className="tbl perms">
          <thead><tr><th /><th>Owner</th><th>Manager</th><th>Cashier</th></tr></thead>
          <tbody>
            {PERM_ROWS.map(([l, p]) => (
              <tr key={p}><td>{l}</td>{(['owner', 'manager', 'cashier'] as Role[]).map((r) => <td key={r}>{roleCan(r, p) ? <span className="yes"><Check size={14} /></span> : <span className="no"><X size={14} /></span>}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}

function UserForm({ user }: { user?: User }) {
  const { db, commit, closeModal, me } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [role, setRole] = useState<Role>(user?.role || 'cashier');
  const [phone, setPhone] = useState(user?.phone || '');
  const [active, setActive] = useState(user?.active ?? true);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const owners = db.users.filter((u) => u.role === 'owner' && u.active);
  const save = async () => {
    const un = username.trim().toLowerCase();
    if (!name.trim()) return setErr('Enter the name.');
    if (!/^[a-z0-9._-]{3,}$/.test(un)) return setErr('Username: at least 3 letters/numbers, no spaces.');
    if (db.users.some((u) => u.id !== user?.id && u.username === un)) return setErr('That username is taken.');
    if (!user && !/^\d{4,6}$/.test(pin)) return setErr('Set a PIN of 4–6 digits.');
    if (pin && !/^\d{4,6}$/.test(pin)) return setErr('PIN must be 4–6 digits.');
    if (user?.role === 'owner' && (role !== 'owner' || !active) && owners.length <= 1) return setErr('There must always be at least one active owner.');
    if (user?.id === me!.userId && !active) return setErr('You cannot switch yourself off.');
    const d: User = { id: user?.id || uid('u'), name: name.trim(), username: un, role, phone, active, createdAt: user?.createdAt || new Date().toISOString(), pinHash: pin ? await hashPin(un, pin) : user!.pinHash };
    if (user && un !== user.username && !pin) return setErr('Changing the username needs a new PIN too.');
    if (await commit([{ t: 'put', c: 'users', d }, auditOp(me!.name, user ? 'User edited' : 'User added', `${d.name} (${ROLE_LABEL[role]})${pin && user ? ' — PIN reset' : ''}${!active ? ' — switched off' : ''}`, 'warn')], 'User saved')) closeModal();
  };
  return (
    <Modal size="sm" title={user ? `Edit ${user.name}` : 'Add user'} foot={<><span className="spacer" /><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" onClick={save}><Save size={15} /> Save</button></>}>
      <div className="formgrid">
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Username"><input value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="Role" full>
          <span className="seg full">
            {(['cashier', 'manager', 'owner'] as Role[]).map((r) => <button key={r} aria-pressed={role === r} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>)}
          </span>
        </Field>
        <Field label={user ? 'New PIN (leave empty to keep)' : 'PIN (4–6 digits)'}><input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {user && <label className="chk full"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active — can sign in</label>}
      </div>
      {err && <div className="note bad" style={{ marginTop: 12 }}>{err}</div>}
    </Modal>
  );
}

function ListEditor({ title, items, onSave }: { title: string; items: string[]; onSave: (x: string[]) => void }) {
  const [v, setV] = useState('');
  return (
    <Panel title={title} sub={`${items.length}`}>
      <div className="chiplist">
        {items.map((c) => (
          <span key={c} className="chip">{c}<button onClick={() => onSave(items.filter((x) => x !== c))} aria-label={`Remove ${c}`}><X size={12} /></button></span>
        ))}
      </div>
      <div className="toolrow" style={{ marginTop: 10 }}>
        <input className="search plain" value={v} onChange={(e) => setV(e.target.value)} placeholder="Add…" onKeyDown={(e) => { if (e.key === 'Enter' && v.trim() && !items.includes(v.trim())) (onSave([...items, v.trim()]), setV('')); }} />
        <button className="btn" onClick={() => { if (v.trim() && !items.includes(v.trim())) (onSave([...items, v.trim()]), setV('')); }}><Plus size={14} /> Add</button>
      </div>
    </Panel>
  );
}

function Lists() {
  const { settings, commit } = useApp();
  const save = (k: keyof Settings) => (x: string[]) => commit([{ t: 'put', c: 'settings', d: { ...settings, [k]: x } }], 'Saved');
  return (
    <Page title="Lists" urdu="فہرستیں" sub="The choices shown in drop-downs. Product categories are managed in Products → Categories.">
      <div className="grid c2">
        <ListEditor title="Expense categories" items={settings.expenseCategories} onSave={save('expenseCategories')} />
        <ListEditor title="Units" items={settings.units} onSave={save('units')} />
      </div>
    </Page>
  );
}

function Backup() {
  const { db, settings, commit, me, confirm, toast, signOut } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [snaps, setSnaps] = useState<{ day: string; at: string; size: number }[]>([]);
  useEffect(() => {
    listSnapshots().then(setSnaps);
  }, []);
  const size = JSON.stringify(db).length;
  const counts = COLLS.filter((c) => !['settings', 'held'].includes(c)).map((c) => [c, (db[c] as any[]).length] as const);

  const doBackup = async () => {
    const at = new Date().toISOString();
    const data = { app: 'mobile-tools-shop', version: 1, at, by: me!.name, data: db };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.shopName.replace(/[^a-z0-9]+/gi, '-')}-backup-${ymd()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    await commit([{ t: 'put', c: 'settings', d: { ...settings, lastBackupAt: at } }, auditOp(me!.name, 'Backup downloaded', `${(size / 1024).toFixed(0)} KB`, 'good')], 'Backup downloaded — keep it on a USB or Google Drive');
  };

  const restoreData = async (data: DB, from: string) => {
    if (!data || !Array.isArray((data as any).users) || !(data as any).users.length) return toast('That file is not a backup of this system.', 'bad');
    const ok = await confirm({
      title: 'Restore this backup?',
      danger: true,
      ok: 'Replace everything',
      body: <p>Everything in the system now — on <b>both counters</b> — will be replaced by the backup from <b>{from}</b> ({(data as any).sales?.length || 0} bills, {(data as any).products?.length || 0} products). This cannot be undone, so download a backup of the current data first.</p>,
    });
    if (!ok) return;
    try {
      const clean: any = {};
      COLLS.forEach((c) => (clean[c] = (data as any)[c] || []));
      clean.audit = [...clean.audit, { id: uid('a'), date: new Date().toISOString(), userName: me!.name, action: 'Backup restored', detail: from, tone: 'bad' }];
      await store.replaceAll(clean);
      toast('Backup restored', 'good');
      if (!clean.users.some((u: User) => u.id === me!.userId)) signOut();
    } catch (e: any) {
      toast(e?.message || 'Restore failed', 'bad');
    }
  };

  const onFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      await restoreData(j.data || j, `${f.name}${j.at ? ' (' + dFull(j.at) + ')' : ''}`);
    } catch {
      toast('Could not read that file.', 'bad');
    }
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'Start fresh?',
      danger: true,
      ok: 'Delete all business data',
      body: <p>Deletes <b>all products, customers, suppliers, bills, purchases, payments, expenses and stock history</b>. Users, shop settings and categories are kept. Use this to remove the sample data before going live. Download a backup first if you might need it.</p>,
    });
    if (!ok) return;
    const ops: Op[] = [];
    (['products', 'parties', 'sales', 'returns', 'purchases', 'payments', 'moves', 'expenses', 'cashtx', 'closes', 'held', 'audit'] as const).forEach((c) => (db[c] as any[]).forEach((d) => ops.push({ t: 'del', c, id: d.id })));
    ops.push({ t: 'put', c: 'settings', d: { ...settings, opening: { Cash: 0, Bank: 0, JazzCash: 0, Easypaisa: 0 } } });
    ops.push(auditOp(me!.name, 'Business data cleared', 'Started fresh', 'bad'));
    await commit(ops, 'All business data deleted — ready to go live');
  };

  return (
    <Page title="Backup & restore" urdu="بیک اپ" sub="Keep a copy of everything outside this computer. A backup file holds every product, bill, khata entry and setting.">
      <div className="kpis">
        <Kpi label="Last backup file" value={settings.lastBackupAt ? relDay(settings.lastBackupAt) : 'never'} tone={!settings.lastBackupAt ? 'bad' : undefined} color={settings.lastBackupAt ? 'var(--good)' : 'var(--bad)'} foot={settings.lastBackupAt && <span className="vs">{dFull(settings.lastBackupAt)}</span>} />
        <Kpi label="Where data lives" value={CLOUD ? 'Cloud (Firebase)' : 'This browser'} color={CLOUD ? 'var(--good)' : 'var(--warn)'} foot={<span className="vs">{CLOUD ? 'shared live by all counters' : 'connect Firebase to share counters'}</span>} />
        <Kpi label="Data size" value={`${(size / 1024).toFixed(0)} KB`} color="var(--s7)" />
      </div>
      <div className="grid c2">
        <Panel title="Download a backup">
          <p>Do this at the end of every day. Save the file to a USB stick, Google Drive or email it to yourself.</p>
          <div className="chiplist">{counts.map(([c, n]) => <span key={c} className="chip">{c}: <b>{n}</b></span>)}</div>
          <button className="btn pri big" style={{ marginTop: 14 }} onClick={doBackup}><Download size={16} /> Download backup file</button>
        </Panel>
        <Panel title="Restore from a file">
          <p>Puts the shop back exactly as it was when the backup was taken. Everything entered after that is replaced.</p>
          <button className="btn big" onClick={() => fileRef.current?.click()}><Upload size={16} /> Choose backup file…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </Panel>
      </div>
      <Panel title="Automatic daily copies on this computer" sub={CLOUD ? 'in addition to the cloud' : 'kept for 14 days'} cls="mt">
        <p className="muted small">The first time the owner signs in each day, a copy is saved inside this browser. It protects against mistakes, not against losing the computer — that is what the backup file is for.</p>
        {snaps.length ? (
          <div className="mini">
            {snaps.map((s) => (
              <div key={s.day} className="mini-r">
                <span><b>{new Date(s.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</b><small>{dFull(s.at)} · {(s.size / 1024).toFixed(0)} KB</small></span>
                <button className="btn sm" onClick={async () => { const d = await readSnapshot(s.day); if (d) restoreData(d, 'daily copy of ' + s.day); }}><RotateCcw size={13} /> Restore</button>
              </div>
            ))}
          </div>
        ) : <p className="muted">No copies yet.</p>}
      </Panel>
      <Panel title="Start fresh" cls="mt">
        <p>Remove the sample data (or everything) and keep your users and settings.</p>
        <button className="btn bad" onClick={wipe}><Trash2 size={15} /> Delete all business data</button>
      </Panel>
      <div className="note calm mt">
        {CLOUD ? <Cloud size={16} /> : <HardDrive size={16} />}
        <span>{CLOUD ? 'Your data is stored in Google Firebase and is shared live between both counters. Firebase keeps its own copies; the backup file is your personal copy.' : 'Your data is stored only in this browser on this computer. To run two counters on the same records, connect a Firebase project (see README) — until then, download a backup every day.'}</span>
      </div>
    </Page>
  );
}

function Audit() {
  const { db } = useApp();
  const rows = [...db.audit].sort((a, b) => (a.date < b.date ? 1 : -1));
  const cols: Col<AuditEntry>[] = [
    { key: 'date', label: 'When', get: (a) => a.date, render: (a) => dFull(a.date) },
    { key: 'userName', label: 'Who', render: (a) => <b>{a.userName}</b> },
    { key: 'action', label: 'What', render: (a) => <Tag tone={a.tone === 'bad' ? 'bad' : a.tone === 'good' ? 'good' : a.tone === 'warn' ? 'warn' : 'info'}>{a.action}</Tag> },
    { key: 'detail', label: 'Details', render: (a) => <span className="wrap">{a.detail}</span> },
  ];
  return (
    <Page search exportable title="Audit trail" urdu="آڈٹ" sub="Price changes, cancelled bills, returns, stock corrections, user changes — who did it and when. Entries cannot be edited.">
      <div className="panel"><div className="panel-b"><DataTable rows={rows} cols={cols} csvName="activity-log" pageSize={50} /></div></div>
    </Page>
  );
}

function MyPin() {
  const { db, me, commit } = useApp();
  const u = db.users.find((x) => x.id === me!.userId);
  const [old, setOld] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    if (!u) return;
    if ((await hashPin(u.username, old)) !== u.pinHash) return setErr('Current PIN is wrong.');
    if (!/^\d{4,6}$/.test(p1)) return setErr('New PIN must be 4–6 digits.');
    if (p1 !== p2) return setErr('The new PINs do not match.');
    if (await commit([{ t: 'put', c: 'users', d: { ...u, pinHash: await hashPin(u.username, p1) } }, auditOp(me!.name, 'PIN changed', 'own PIN', 'info')], 'PIN changed')) {
      setOld(''); setP1(''); setP2(''); setErr('');
    }
  };
  const pinIn = (v: string, s: (x: string) => void) => <input type="password" inputMode="numeric" value={v} onChange={(e) => s(e.target.value.replace(/\D/g, '').slice(0, 6))} />;
  return (
    <Page title="My PIN" urdu="میرا پن" sub={`${me!.name} · ${ROLE_LABEL[me!.role]}`}>
      <Panel title="Change PIN" cls="narrow">
        <div className="formgrid">
          <Field label="Current PIN" full>{pinIn(old, setOld)}</Field>
          <Field label="New PIN">{pinIn(p1, setP1)}</Field>
          <Field label="New PIN again">{pinIn(p2, setP2)}</Field>
        </div>
        {err && <div className="note bad" style={{ marginTop: 12 }}>{err}</div>}
        <button className="btn pri" style={{ marginTop: 14 }} onClick={save}><KeyRound size={15} /> Change PIN</button>
      </Panel>
      <p className="muted small"><ShieldCheck size={13} /> PINs are stored scrambled (hashed), never as plain numbers.</p>
    </Page>
  );
}
