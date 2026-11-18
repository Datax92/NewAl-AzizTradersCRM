'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, PiggyBank, HandCoins, Save, Banknote, Landmark, Smartphone, Lock, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, DataTable, Money, Kpi, Modal, Field, NumInput, Seg, Tag, Empty, type Col } from '../Shared';
import type { Account, CashTx, DayClose } from '../../lib/types';
import { ACCOUNTS, accountRows, accountBalances, counterCash, auditOp, type AccountRow } from '../../lib/logic';
import { dFull, dShort, inRange, rs, round2, uid, ymd } from '../../lib/format';

export function CashPage() {
  const t = useTab();
  return t === 'book' ? <Book /> : t === 'closing' ? <Closing /> : <Accounts />;
}

export const ACC_ICON: Record<Account, React.ReactNode> = { Cash: <Banknote size={20} />, Bank: <Landmark size={20} />, JazzCash: <Smartphone size={20} />, Easypaisa: <Smartphone size={20} /> };
const ACC_CLS: Record<Account, string> = { Cash: 'm-cash', Bank: 'm-bank', JazzCash: 'm-jazz', Easypaisa: 'm-easy' };

function Accounts() {
  const { db, range, openModal, can, go, params } = useApp();
  useEffect(() => {
    if (params.get('transfer')) openModal(<CashTxForm kind="transfer" />);
  }, [params.get('transfer')]); // eslint-disable-line react-hooks/exhaustive-deps
  const bal = useMemo(() => accountBalances(db), [db]);
  const rows = useMemo(() => accountRows(db).filter((r) => inRange(r.date, range)), [db, range]);
  const total = ACCOUNTS.reduce((a, k) => a + bal[k], 0);
  const flow = (k: Account) => ({ in: rows.filter((r) => r.account === k && r.amount > 0).reduce((a, r) => a + r.amount, 0), out: rows.filter((r) => r.account === k && r.amount < 0).reduce((a, r) => a - r.amount, 0) });
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.kind, (m.get(r.kind) || 0) + r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const totIn = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const totOut = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  return (
    <Page
      title="Bank & Cash" urdu="بینک و نقد"
      sub="How much money the shop holds in each place right now, and what came in and went out in the period."
      period
      actions={
        <>
          <button className="btn pri" onClick={() => openModal(<CashTxForm kind="transfer" />)}><ArrowLeftRight size={15} /> Transfer</button>
          <button className="btn" onClick={() => openModal(<CashTxForm kind="capital" />)}><PiggyBank size={15} /> Owner put in</button>
          <button className="btn" onClick={() => openModal(<CashTxForm kind="drawing" />)}><HandCoins size={15} /> Owner took out</button>
          {can('settings') && <button className="btn gh" onClick={() => openModal(<OpeningForm />)}><Pencil size={15} /> Opening balances</button>}
        </>
      }
    >
      <div className="accs">
        {ACCOUNTS.map((k) => {
          const f = flow(k);
          return (
            <button key={k} className={`acc ${ACC_CLS[k]}`} onClick={() => go('cash/book?acc=' + k)}>
              <span className="acc-ic">{ACC_ICON[k]}</span>
              <span className="acc-n">{k === 'Cash' ? 'Cash in hand' : k}</span>
              <b className={bal[k] < 0 ? 'bad' : ''}>{rs(bal[k])}</b>
              <span className="acc-f">
                <span className="good">+{rs(f.in)}</span>
                <span className="bad">−{rs(f.out)}</span>
                <small>{range.label.toLowerCase()}</small>
              </span>
            </button>
          );
        })}
        <div className="acc total">
          <span className="acc-n">All money</span>
          <b>{rs(total)}</b>
          <span className="acc-f">
            <span className={totIn - totOut >= 0 ? 'good' : 'bad'}>{totIn - totOut >= 0 ? '+' : '−'}{rs(Math.abs(totIn - totOut))}</span>
            <small>net {range.label.toLowerCase()}</small>
          </span>
        </div>
      </div>
      <div className="grid c2">
        <Panel title="Money in and out by type" sub={range.label}>
          {kinds.length ? (
            <div className="calcbox flat">
              {kinds.map(([k, v]) => (
                <div key={k} className="row">{k} <b className={v >= 0 ? 'good' : 'bad'}>{v >= 0 ? '+' : '−'}{rs(Math.abs(v))}</b></div>
              ))}
              <div className="row tot">Net change <b className={totIn - totOut >= 0 ? 'good' : 'bad'}>{rs(totIn - totOut)}</b></div>
            </div>
          ) : <Empty title="No money moved in this period" />}
        </Panel>
        <Panel title="Recent transfers & owner entries" tight>
          <div className="mini">
            {[...db.cashtx].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8).map((t) => (
              <div key={t.id} className="mini-r">
                <span>
                  <b>{t.kind === 'transfer' ? `${t.from} → ${t.to}` : t.kind === 'capital' ? `Owner put in → ${t.to}` : `Owner took out ← ${t.from}`}</b>
                  <small>{dFull(t.date)} · {t.note || t.userName}</small>
                </span>
                <span className="mini-v"><b className={t.kind === 'capital' ? 'good' : t.kind === 'drawing' ? 'bad' : ''}>{rs(t.amount)}</b></span>
              </div>
            ))}
            {!db.cashtx.length && <Empty title="None yet" />}
          </div>
        </Panel>
      </div>
    </Page>
  );
}

function CashTxForm({ kind }: { kind: CashTx['kind'] }) {
  const { commit, closeModal, me } = useApp();
  const [from, setFrom] = useState<Account>('Cash');
  const [to, setTo] = useState<Account>(kind === 'transfer' ? 'Bank' : 'Cash');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const title = kind === 'transfer' ? 'Move money between accounts' : kind === 'capital' ? 'Owner puts money in' : 'Owner takes money out';
  const save = async () => {
    if (amount <= 0) return setErr('Enter the amount.');
    if (kind === 'transfer' && from === to) return setErr('Choose two different accounts.');
    const d: CashTx = { id: uid('ct'), date: new Date().toISOString(), kind, from: kind !== 'capital' ? from : undefined, to: kind !== 'drawing' ? to : undefined, amount: round2(amount), note: note || undefined, userName: me!.name };
    if (await commit([{ t: 'put', c: 'cashtx', d }, auditOp(me!.name, title, `${rs(amount)}${d.from ? ' from ' + d.from : ''}${d.to ? ' to ' + d.to : ''}`, 'info')], 'Saved')) closeModal();
  };
  return (
    <Modal size="sm" title={title} sub={kind === 'transfer' ? 'e.g. cash deposited in the bank. Not income or expense.' : kind === 'capital' ? 'Your own money added to the business. Not counted as sales.' : 'Money taken home. Not a shop expense, so it does not reduce profit.'} foot={<><span className="spacer" /><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" onClick={save}><Save size={15} /> Save</button></>}>
      <div className="formgrid">
        {kind !== 'capital' && <Field label="From"><select value={from} onChange={(e) => setFrom(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>}
        {kind !== 'drawing' && <Field label="To"><select value={to} onChange={(e) => setTo(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>}
        <Field label="Amount" error={err}><NumInput value={amount} onChange={setAmount} min={0} autoFocus placeholder="0" /></Field>
        <Field label="Note" full><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. deposited in Meezan Bank" /></Field>
      </div>
    </Modal>
  );
}

function OpeningForm() {
  const { settings, commit, closeModal, me } = useApp();
  const [v, setV] = useState<Record<Account, number>>({ ...settings.opening });
  const save = async () => {
    if (await commit([{ t: 'put', c: 'settings', d: { ...settings, opening: v } }, auditOp(me!.name, 'Opening balances changed', ACCOUNTS.map((a) => `${a} ${rs(v[a])}`).join(', '), 'warn')], 'Opening balances saved')) closeModal();
  };
  return (
    <Modal size="sm" title="Opening balances" sub="What each account held on the day you started using this system." foot={<><span className="spacer" /><button className="btn" onClick={closeModal}>Cancel</button><button className="btn pri" onClick={save}><Save size={15} /> Save</button></>}>
      <div className="formgrid">
        {ACCOUNTS.map((a) => (
          <Field key={a} label={a}><NumInput value={v[a]} onChange={(n) => setV((x) => ({ ...x, [a]: n }))} /></Field>
        ))}
      </div>
    </Modal>
  );
}

function Book() {
  const { db, range, params } = useApp();
  const [acc, setAcc] = useState<Account>((params.get('acc') as Account) || 'Cash');
  const opening = useMemo(() => accountBalances(db, range.from)[acc], [db, range, acc]);
  const rows = useMemo(() => {
    let b = opening;
    return accountRows(db)
      .filter((r) => r.account === acc && inRange(r.date, range))
      .map((r) => ((b = round2(b + r.amount)), { ...r, bal: b }))
      .reverse();
  }, [db, range, acc, opening]);
  const inS = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const outS = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  const cols: Col<AccountRow & { bal: number }>[] = [
    { key: 'date', label: 'Date & time', get: (r) => r.date, render: (r) => dFull(r.date) },
    { key: 'kind', label: 'Type', render: (r) => <Tag tone={r.amount >= 0 ? 'good' : 'bad'}>{r.kind}</Tag> },
    { key: 'ref', label: 'Reference', render: (r) => <b>{r.ref}</b> },
    { key: 'detail', label: 'Details', get: (r) => r.detail },
    { key: 'counter', label: 'Counter', get: (r) => r.counter || '' },
    { key: 'in', label: 'In', r: true, get: (r) => Math.max(0, r.amount), render: (r) => (r.amount > 0 ? <span className="good">+{rs(r.amount)}</span> : ''), total: () => <span className="good">+{rs(inS)}</span> },
    { key: 'out', label: 'Out', r: true, get: (r) => Math.max(0, -r.amount), render: (r) => (r.amount < 0 ? <span className="bad">−{rs(-r.amount)}</span> : ''), total: () => <span className="bad">−{rs(outS)}</span> },
    { key: 'bal', label: 'Balance', r: true, get: (r) => r.bal, render: (r) => <Money v={r.bal} cls="strong" tone={r.bal < 0 ? 'bad' : undefined} /> },
  ];
  return (
    <Page search exportable title="Account statement" urdu="کھاتہ" sub="Every entry in one account with the balance after it — newest first." period actions={<Seg value={acc} onChange={setAcc} options={ACCOUNTS.map((a) => ({ v: a, label: a }))} />}>
      <div className="kpis">
        <Kpi label={`Opening (${dShort(range.from)})`} value={opening} color="var(--ink-3)" />
        <Kpi label="Money in" value={inS} tone="good" color="var(--good)" />
        <Kpi label="Money out" value={-outS} tone="bad" color="var(--bad)" />
        <Kpi label="Closing" value={opening + inS - outS} tone={opening + inS - outS < 0 ? 'bad' : undefined} color="var(--s1)" />
      </div>
      <div className="panel"><div className="panel-b"><DataTable rows={rows} cols={cols} csvName={`cashbook-${acc}`} /></div></div>
    </Page>
  );
}

const NOTES = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

function Closing() {
  const { db, me, settings, commit, can } = useApp();
  const [day, setDay] = useState(ymd());
  const [counter, setCounter] = useState(me!.counter);
  const [float, setFloat] = useState(0);
  const [notes, setNotes] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const cc = useMemo(() => counterCash(db, day, counter), [db, day, counter]);
  const expected = round2(float + cc.net);
  const counted = NOTES.reduce((a, n) => a + n * (notes[n] || 0), 0);
  const diff = round2(counted - expected);
  const done = db.closes.find((c) => c.date === day && c.counter === counter);
  const save = async () => {
    const d: DayClose = { id: uid('dc'), date: day, counter, expected, counted, diff, note: [float ? `float ${rs(float)}` : '', note].filter(Boolean).join(' · ') || undefined, userName: me!.name, closedAt: new Date().toISOString() };
    await commit([{ t: 'put', c: 'closes', d }, auditOp(me!.name, 'Day closed', `${counter} ${day}: expected ${rs(expected)}, counted ${rs(counted)}, ${diff === 0 ? 'matched' : diff > 0 ? 'over ' + rs(diff) : 'short ' + rs(-diff)}`, diff < 0 ? 'bad' : diff > 0 ? 'warn' : 'good')], diff === 0 ? 'Day closed — cash matches' : `Day closed — cash ${diff > 0 ? 'over' : 'short'} by ${rs(Math.abs(diff))}`);
  };
  const history = [...db.closes].sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1));
  return (
    <Page title="Day closing" urdu="دن کا اختتام" sub="At the end of the day, count the cash in the drawer. The system tells you what should be there and whether it is short or over.">
      <div className="toolrow">
        <input type="date" className="fldsel" value={day} max={ymd()} onChange={(e) => setDay(e.target.value)} />
        <Seg value={counter} onChange={setCounter} options={settings.counters.map((c) => ({ v: c, label: c }))} />
        {done && <Tag tone={done.diff === 0 ? 'good' : done.diff < 0 ? 'bad' : 'warn'}>Already closed by {done.userName}: {done.diff === 0 ? 'matched' : done.diff < 0 ? `short ${rs(-done.diff)}` : `over ${rs(done.diff)}`}</Tag>}
      </div>
      <div className="grid c2">
        <Panel title="What the drawer should hold" sub={`${counter} · ${dShort(day + 'T00:00:00')}`}>
          <div className="calcbox flat">
            <div className="row">Cash kept in drawer at opening (float)<span className="spacer" /><span className="qtybox sm wide"><NumInput value={float} onChange={setFloat} min={0} placeholder="0" /></span></div>
            {Object.entries(cc.rows.reduce((m: Record<string, number>, r) => ((m[r.kind] = (m[r.kind] || 0) + r.amount), m), {})).map(([k, v]) => (
              <div key={k} className="row">{k}<b className={v >= 0 ? 'good' : 'bad'}>{v >= 0 ? '+' : '−'}{rs(Math.abs(v))}</b></div>
            ))}
            {!cc.rows.length && <div className="row muted">No cash taken at this counter on this day.</div>}
            <div className="row tot">Should be in the drawer <b>{rs(expected)}</b></div>
          </div>
          <p className="muted small">Only cash is counted here. JazzCash, Easypaisa, bank and khata sales are not in the drawer.</p>
        </Panel>
        <Panel title="Count the cash">
          <div className="notes">
            {NOTES.map((n) => (
              <label key={n} className="note-r">
                <span className="nt">{n >= 10 ? `Rs ${n}` : `Rs ${n} coin`}</span>
                <span>×</span>
                <NumInput value={notes[n] || 0} onChange={(v) => setNotes((x) => ({ ...x, [n]: Math.max(0, Math.floor(v)) }))} min={0} placeholder="0" />
                <b>{notes[n] ? rs(n * notes[n]) : ''}</b>
              </label>
            ))}
          </div>
          <div className={`closebox ${counted === 0 ? '' : diff === 0 ? 'good' : diff < 0 ? 'bad' : 'warn'}`}>
            <div><small>Counted</small><b>{rs(counted)}</b></div>
            <div><small>Should be</small><b>{rs(expected)}</b></div>
            <div><small>{diff === 0 ? 'Matches' : diff < 0 ? 'Short' : 'Over'}</small><b>{diff === 0 ? '✓' : rs(Math.abs(diff))}</b></div>
          </div>
          <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain any difference" /></Field>
          <button className="btn pri big" style={{ marginTop: 12, width: '100%' }} onClick={save} disabled={!counted && !cc.rows.length}><Lock size={15} /> Close {counter} for the day</button>
        </Panel>
      </div>
      {can('cashbook') && history.length > 0 && (
        <Panel title="Closing history" cls="mt">
          <DataTable
            rows={history}
            search={false}
            cols={[
              { key: 'date', label: 'Day', render: (c: DayClose) => dShort(c.date + 'T00:00:00') },
              { key: 'counter', label: 'Counter' },
              { key: 'expected', label: 'Should be', r: true, render: (c: DayClose) => rs(c.expected) },
              { key: 'counted', label: 'Counted', r: true, render: (c: DayClose) => rs(c.counted) },
              { key: 'diff', label: 'Difference', r: true, render: (c: DayClose) => (c.diff === 0 ? <Tag tone="good">Matched</Tag> : <Money v={c.diff} tone="pl" sign />) },
              { key: 'userName', label: 'Closed by' },
              { key: 'note', label: 'Note', get: (c: DayClose) => c.note || '' },
            ]}
          />
        </Panel>
      )}
    </Page>
  );
}
