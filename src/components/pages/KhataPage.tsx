'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, HandCoins, MessageCircle, Printer, Pencil, Phone, ShoppingCart, BookOpen, Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Kpi, Money, Tag, Empty, Seg } from '../Shared';
import { PartyForm, PaymentForm } from '../Forms';
import { PurchaseForm } from './PurchasesPage';
import { Printable, printNow } from '../Print';
import { ReceiptModal } from '../Receipt';
import type { Party } from '../../lib/types';
import { shopContactText, balances, ledger, type LedgerRow } from '../../lib/logic';
import { dShort, rs, relDay, waLink, initials } from '../../lib/format';

export function KhataPage() {
  const t = useTab();
  return <Accounts key={t} type={t === 'suppliers' ? 'supplier' : 'customer'} />;
}

type Sort = 'balance' | 'name' | 'age';

function Accounts({ type }: { type: 'customer' | 'supplier' }) {
  const { db, params, openModal, settings } = useApp();
  const isC = type === 'customer';
  const bal = useMemo(() => balances(db), [db]);
  const parties = db.parties.filter((p) => p.type === type);
  const [sel, setSel] = useState<string | undefined>(params.get('id') || undefined);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('balance');
  const [only, setOnly] = useState(false);
  useEffect(() => {
    if (params.get('id')) setSel(params.get('id')!);
    if (params.get('pay')) openModal(<PaymentForm />);
    if (params.get('newc')) openModal(<PartyForm type={type} onSaved={(p) => setSel(p.id)} />);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = parties
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone || '').includes(q))
    .filter((p) => !only || (bal.get(p.id)?.balance || 0) > 0.5)
    .sort((a, b) => {
      const A = bal.get(a.id)!, B = bal.get(b.id)!;
      return sort === 'name' ? a.name.localeCompare(b.name) : sort === 'age' ? B.ageDays - A.ageDays : B.balance - A.balance;
    });
  const totalDue = parties.reduce((a, p) => a + Math.max(0, bal.get(p.id)?.balance || 0), 0);
  const withDues = parties.filter((p) => (bal.get(p.id)?.balance || 0) > 0.5).length;
  const overdue = parties.filter((p) => (bal.get(p.id)?.balance || 0) > 0.5 && (bal.get(p.id)?.ageDays || 0) >= settings.overdueDays).length;
  const over = parties.filter((p) => bal.get(p.id)?.overLimit).length;
  const cur = parties.find((p) => p.id === sel) || list[0];

  return (
    <Page
      title={isC ? 'Customer khata' : 'Supplier khata'}
      sub={isC ? 'Who owes the shop money. Credit bills add to the balance; payments and returns reduce it.' : 'What the shop owes each supplier. Goods received add to it; payments reduce it.'}
      actions={
        <>
          <button className="btn" onClick={() => openModal(<PartyForm type={type} onSaved={(p) => setSel(p.id)} />)}><Plus size={15} /> New {type}</button>
          <button className={'btn pri'} onClick={() => openModal(<PaymentForm party={cur} />)} disabled={!cur}><HandCoins size={15} /> {isC ? 'Receive payment' : 'Pay supplier'}</button>
        </>
      }
    >
      <div className="kpis">
        <Kpi label={isC ? 'Customers owe us' : 'We owe suppliers'} value={totalDue} tone={totalDue > 0 ? (isC ? 'warn' : 'bad') : undefined} color={isC ? 'var(--m-khata)' : 'var(--bad)'} />
        <Kpi label={isC ? 'Customers with dues' : 'Suppliers to pay'} value={withDues} money={false} color="var(--s1)" foot={<span className="vs">of {parties.length}</span>} />
        <Kpi label={`Older than ${settings.overdueDays} days`} value={overdue} money={false} tone={overdue ? 'bad' : undefined} color="var(--bad)" />
        {isC && <Kpi label="Over credit limit" value={over} money={false} tone={over ? 'bad' : undefined} color="var(--bad)" />}
      </div>
      <div className="khata">
        <aside className="kh-list">
          <div className="kh-tools">
            <input className="search" placeholder="Name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="kh-sort">
              <Seg value={sort} onChange={setSort} options={[{ v: 'balance', label: 'Most due' }, { v: 'age', label: 'Oldest' }, { v: 'name', label: 'A–Z' }]} />
              <label className="chk"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> With dues</label>
            </div>
          </div>
          <div className="kh-items">
            {list.map((p) => {
              const b = bal.get(p.id)!;
              const tone = b.balance > 0.5 ? (b.overLimit || b.ageDays >= settings.overdueDays ? 'bad' : isC ? 'info' : 'warn') : b.balance < -0.5 ? 'violet' : 'good';
              return (
                <button key={p.id} className={`kh-it ${cur?.id === p.id ? 'on' : ''}`} onClick={() => setSel(p.id)}>
                  <span className="ini">{initials(p.name)}</span>
                  <span className="kh-n">
                    <b>{p.name}</b>
                    <small>
                      {p.phone || p.city || (isC ? 'Customer' : 'Supplier')}
                    </small>
                  </span>
                  <span className="kh-r">
                    <span className={`kh-b ${tone}`}>{Math.abs(b.balance) < 0.5 ? 'Clear' : rs(Math.abs(b.balance))}</span>
                    {b.balance > 0.5 && b.ageDays > 0 && <small className={b.ageDays >= settings.overdueDays ? 'bad' : ''}>{b.ageDays} days</small>}
                  </span>
                </button>
              );
            })}
            {!list.length && <Empty title={`No ${type}s`} />}
          </div>
        </aside>
        <section className="kh-main">{cur ? <Statement party={cur} /> : <Empty title={`Choose a ${type}`} icon={isC ? <BookOpen size={34} /> : <Truck size={34} />} />}</section>
      </div>
    </Page>
  );
}

function Statement({ party }: { party: Party }) {
  const { db, openModal, settings, go, can } = useApp();
  const rows = useMemo(() => ledger(db, party), [db, party]);
  const b = balances(db).get(party.id)!;
  const isC = party.type === 'customer';
  const [view, setView] = useState<'all' | '90'>('all');
  const shown = view === '90' ? rows.filter((r) => r.kind === 'opening' || Date.now() - new Date(r.date).getTime() < 90 * 86400000) : rows;
  const due = b.balance;
  const debit = rows.reduce((a, r) => a + r.debit, 0);
  const credit = rows.reduce((a, r) => a + r.credit, 0);
  const reminder = isC
    ? `Assalam o Alaikum ${party.name},\n\nThis is a reminder from *${settings.shopName}*. Your khata balance is *${rs(due)}*${b.ageDays ? ` (oldest bill ${b.ageDays} days ago)` : ''}.\n\nPlease clear it at your earliest. JazzCash / Easypaisa / bank transfer accepted.\nShukriya! ${shopContactText(settings)}`
    : `Assalam o Alaikum,\n\n${settings.shopName} account statement: balance payable ${rs(due)}.\n${shopContactText(settings)}`;
  const doc = (
    <div className="stmt">
      <div className="stmt-h">
        <div><b>{settings.shopName}</b><span>{settings.address}</span><span>{shopContactText(settings)}</span></div>
        <div className="r"><h2>Khata statement</h2><span>{dShort(new Date())}</span></div>
      </div>
      <div className="stmt-to"><small>{isC ? 'Customer' : 'Supplier'}</small><b>{party.name}</b><span>{[party.shop !== party.name && party.shop, party.city, party.phone].filter(Boolean).join(' · ')}</span></div>
      <LedgerTable rows={rows} isC={isC} print />
      <div className="stmt-tot">{isC ? (due >= 0 ? 'Balance due' : 'Advance with us') : due >= 0 ? 'We owe' : 'They owe us'}: <b>{rs(Math.abs(due))}</b></div>
    </div>
  );
  return (
    <div className="stmtv">
      <div className="kh-head">
        <span className="kh-av">{initials(party.name)}</span>
        <div className="kh-who">
          <h2>{party.name}</h2>
          <div className="kh-tags">
            {party.phone && (
              <a className="kh-tag" href={`tel:${party.phone}`}>
                <Phone size={12} /> {party.phone}
              </a>
            )}
            {(party.city || party.address) && <span className="kh-tag">{[party.shop !== party.name && party.shop, party.city].filter(Boolean).join(' · ') || party.address}</span>}
            {!isC && <span className="kh-tag">delivers in {party.leadDays ?? 3} days</span>}
            {b.balance > 0.5 && b.ageDays >= settings.overdueDays && <Tag tone="bad">overdue {b.ageDays} days</Tag>}
          </div>
        </div>
      </div>
      <div className="kh-stats">
        <div className={`kh-stat main ${due > 0.5 ? (isC ? (b.overLimit ? 'bad' : 'info') : 'bad') : due < -0.5 ? 'violet' : 'good'}`}>
          <small>{isC ? (due >= 0 ? 'Balance due' : 'Advance with us') : due >= 0 ? 'We owe' : 'They owe us'}</small>
          <b>{Math.abs(due) < 0.5 ? 'Clear' : rs(Math.abs(due))}</b>
          {isC && !!party.creditLimit && (
            <span className="kh-limit">
              <span className="limitbar">
                <i style={{ width: `${Math.min(100, (Math.max(0, due) / party.creditLimit) * 100)}%` }} />
              </span>
              <small>{Math.round((Math.max(0, due) / party.creditLimit) * 100)}% of {rs(party.creditLimit)} limit</small>
            </span>
          )}
        </div>
        <div className="kh-stat">
          <small>{isC ? 'Credit given' : 'Goods received'}</small>
          <b>{rs(debit)}</b>
        </div>
        <div className="kh-stat">
          <small>{isC ? 'Received' : 'Paid'}</small>
          <b className="good">{rs(credit)}</b>
        </div>
        <div className="kh-stat">
          <small>Last payment</small>
          <b className="sm">{b.lastPay ? relDay(b.lastPay) : 'never'}</b>
        </div>
      </div>
      <div className="kh-acts">
        <button className={'btn pri'} onClick={() => openModal(<PaymentForm party={party} />)}><HandCoins size={15} /> {isC ? 'Receive payment' : 'Pay'}</button>
        {isC && can('pos') && <button className="btn" onClick={() => go('pos/new')}><ShoppingCart size={15} /> New credit bill</button>}
        {!isC && can('purchases') && <button className="btn" onClick={() => openModal(<PurchaseForm supplierId={party.id} />)}><Truck size={15} /> New purchase</button>}
        {party.phone && due > 0.5 && <a className="btn wa" href={waLink(party.phone, reminder)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> {isC ? 'WhatsApp reminder' : 'WhatsApp statement'}</a>}
        <button className="btn gh" onClick={() => printNow('A4')}><Printer size={15} /> Print statement</button>
        <button className="btn gh" onClick={() => openModal(<PartyForm type={party.type} party={party} />)}><Pencil size={15} /> Edit</button>
      </div>
      <div className="kh-sum">
        <b>Statement</b>
        <span className="muted small">newest first · click a bill to open it</span>
        <span className="spacer" />
        <Seg value={view} onChange={setView} options={[{ v: 'all', label: 'All' }, { v: '90', label: 'Last 90 days' }]} />
      </div>
      {rows.length ? <LedgerTable rows={[...shown].reverse()} isC={isC} onBill={(id) => openModal(<ReceiptModal saleId={id} />)} /> : <Empty title="No entries yet" />}
      <Printable>{doc}</Printable>
    </div>
  );
}

function LedgerTable({ rows, isC, print, onBill }: { rows: LedgerRow[]; isC: boolean; print?: boolean; onBill?: (id: string) => void }) {
  return (
    <div className="tblwrap">
      <table className={`tbl ledger ${print ? 'print' : ''}`}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Details</th>
            <th>Ref</th>
            <th className="r">{isC ? 'Credit given (+)' : 'Goods in (+)'}</th>
            <th className="r">{isC ? 'Received (−)' : 'Paid (−)'}</th>
            <th className="r">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id + r.kind} className={onBill && r.kind === 'bill' ? 'clk' : ''} onClick={onBill && r.kind === 'bill' ? () => onBill(r.id) : undefined}>
              <td>{r.kind === 'opening' ? '—' : dShort(r.date)}</td>
              <td className="wrap">{r.detail}</td>
              <td className="mono small">{r.ref}</td>
              <td className="r">{r.debit ? <span className={isC ? 'info' : 'bad'}>{rs(r.debit)}</span> : ''}</td>
              <td className="r">{r.credit ? <span className="good">{rs(r.credit)}</span> : ''}</td>
              <td className="r">
                <Money v={r.balance} cls="strong" tone={r.balance > 0.5 ? (isC ? undefined : 'bad') : r.balance < -0.5 ? 'warn' : 'good'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
