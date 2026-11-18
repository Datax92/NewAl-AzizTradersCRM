'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, DataTable, Money, MethodChip, Tag, Kpi, type Col } from '../Shared';
import { ReceiptModal } from '../Receipt';
import type { Sale, SaleReturn } from '../../lib/types';
import { saleProfit, payOf, returnsFor, METHODS } from '../../lib/logic';
import { dFull, inRange, num, rs } from '../../lib/format';

export function SalesPage() {
  return useTab() === 'returns' ? <Returns /> : <Bills />;
}

function Bills() {
  const { db, range, can, openModal, params, go, settings } = useApp();
  const [counter, setCounter] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [user, setUser] = useState('');
  useEffect(() => {
    const id = params.get('id');
    if (id && db.sales.some((s) => s.id === id)) openModal(<ReceiptModal saleId={id} />);
  }, [params.get('id')]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () =>
      db.sales
        .filter((s) => inRange(s.date, range))
        .filter((s) => !counter || s.counter === counter)
        .filter((s) => !method || s.payments.some((p) => p.method === method))
        .filter((s) => !user || s.userName === user)
        .filter((s) => !status || (status === 'void' ? s.status === 'void' : status === 'returned' ? returnsFor(db, s.id).length > 0 : status === 'credit' ? payOf(s, 'Khata') > 0 : s.status !== 'void'))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [db, range, counter, method, status, user]
  );
  const live = rows.filter((s) => s.status !== 'void');
  const total = live.reduce((a, s) => a + s.total, 0);
  const profit = live.reduce((a, s) => a + saleProfit(s), 0);
  const credit = live.reduce((a, s) => a + payOf(s, 'Khata'), 0);
  const users = [...new Set(db.sales.map((s) => s.userName))];

  const cols: Col<Sale>[] = [
    { key: 'no', label: 'Bill', render: (s) => <b className="mono">{s.no}</b> },
    { key: 'date', label: 'Date & time', get: (s) => s.date, render: (s) => dFull(s.date) },
    { key: 'customer', label: 'Customer', get: (s) => s.customerName || 'Walk-in', render: (s) => (s.customerName ? <span>{s.customerName}{s.customerId && <Tag tone="info">khata</Tag>}</span> : <span className="muted">Walk-in</span>) },
    { key: 'items', label: 'Items', r: true, get: (s) => s.items.reduce((a, i) => a + i.qty, 0) },
    { key: 'disc', label: 'Discount', r: true, get: (s) => s.items.reduce((a, i) => a + i.disc, 0) + s.discount, render: (s) => { const d = s.items.reduce((a, i) => a + i.disc, 0) + s.discount; return d ? <span className="warn">−{rs(d)}</span> : <span className="muted">—</span>; } },
    { key: 'total', label: 'Total', r: true, get: (s) => s.total, render: (s) => (s.status === 'void' ? <s className="muted">{rs(s.total)}</s> : <Money v={s.total} cls="strong" />), total: () => <Money v={total} /> },
    { key: 'profit', label: 'Profit', r: true, hide: !can('profit'), get: (s) => (s.status === 'void' ? 0 : saleProfit(s)), render: (s) => (s.status === 'void' ? '—' : <Money v={saleProfit(s)} tone="pl" />), total: () => <Money v={profit} tone="pl" /> },
    { key: 'paid', label: 'Payment', get: (s) => s.payments.map((p) => `${p.method} ${p.amount}`).join(' + '), render: (s) => <span className="mchips">{s.payments.map((p, i) => <MethodChip key={i} m={p.method} amount={s.payments.length > 1 ? p.amount : undefined} />)}</span> },
    { key: 'counter', label: 'Counter', get: (s) => `${s.counter} · ${s.userName}` },
    { key: 'status', label: 'Status', get: (s) => (s.status === 'void' ? 'Cancelled' : returnsFor(db, s.id).length ? 'Part returned' : 'Paid'), render: (s) => (s.status === 'void' ? <Tag tone="bad">Cancelled</Tag> : returnsFor(db, s.id).length ? <Tag tone="violet">Returned</Tag> : payOf(s, 'Khata') > 0 ? <Tag tone="info">Credit</Tag> : <Tag tone="good">Paid</Tag>) },
  ];

  return (
    <Page search exportable
      title="Sales register" urdu="فروخت رجسٹر"
      sub="Every sale from both counters. Click a bill to reprint, send on WhatsApp, return items or cancel it."
      period
      actions={can('pos') && <button className="btn pri" onClick={() => go('pos/new')}><ShoppingCart size={15} /> New bill</button>}
    >
      <div className="kpis">
        <Kpi label="Bills" value={live.length} money={false} color="var(--s1)" foot={<span className="vs">{rows.length - live.length} cancelled</span>} />
        <Kpi label="Sales" value={total} color="var(--s1)" />
        {can('profit') && <Kpi label="Profit on these bills" value={profit} tone="pl" color={profit >= 0 ? 'var(--good)' : 'var(--bad)'} foot={<span className="vs">{total ? ((profit / total) * 100).toFixed(1) : 0}% margin</span>} />}
        <Kpi label="Given on khata" value={credit} tone={credit ? 'warn' : undefined} color="var(--m-khata)" />
      </div>
      <div className="panel">
        <div className="panel-b">
          <DataTable
            rows={rows}
            cols={cols}
            csvName="bills"
            onRow={(s) => openModal(<ReceiptModal saleId={s.id} />)}
            rowCls={(s) => (s.status === 'void' ? 'void' : '')}
            searchPlaceholder="Bill no., customer, item…"
            filters={
              <>
                <select className="fldsel" value={counter} onChange={(e) => setCounter(e.target.value)}>
                  <option value="">All counters</option>
                  {settings.counters.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="fldsel" value={user} onChange={(e) => setUser(e.target.value)}>
                  <option value="">All staff</option>
                  {users.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="fldsel" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="">Any payment</option>
                  {METHODS.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="fldsel" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Any status</option>
                  <option value="ok">Completed</option>
                  <option value="credit">On credit</option>
                  <option value="returned">With returns</option>
                  <option value="void">Cancelled</option>
                </select>
              </>
            }
          />
        </div>
      </div>
    </Page>
  );
}

function Returns() {
  const { db, range, openModal } = useApp();
  const rows = useMemo(() => db.returns.filter((r) => inRange(r.date, range)).sort((a, b) => (a.date < b.date ? 1 : -1)), [db.returns, range]);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const damaged = rows.reduce((a, r) => a + r.items.filter((i) => !i.restock).reduce((b, i) => b + i.cost * i.qty, 0), 0);
  const cols: Col<SaleReturn>[] = [
    { key: 'no', label: 'Return', render: (r) => <b className="mono">{r.no}</b> },
    { key: 'date', label: 'Date', get: (r) => r.date, render: (r) => dFull(r.date) },
    { key: 'sale', label: 'On bill', get: (r) => r.saleNo, render: (r) => <button className="linkbtn" onClick={(e) => (e.stopPropagation(), openModal(<ReceiptModal saleId={r.saleId} />))}>{r.saleNo}</button> },
    { key: 'cust', label: 'Customer', get: (r) => r.customerName || 'Walk-in' },
    { key: 'items', label: 'Items', get: (r) => r.items.map((i) => `${i.name} × ${i.qty}`).join(', '), render: (r) => <span className="wrap">{r.items.map((i, k) => <span key={k} className="ret-i">{i.name} × {num(i.qty)} {i.restock ? <Tag tone="good">to shelf</Tag> : <Tag tone="bad">damaged</Tag>}</span>)}</span> },
    { key: 'refund', label: 'Refunded by', get: (r) => r.refundMethod, render: (r) => <MethodChip m={r.refundMethod} /> },
    { key: 'total', label: 'Amount', r: true, get: (r) => r.total, render: (r) => <Money v={-r.total} tone="bad" />, total: () => <Money v={-total} tone="bad" /> },
    { key: 'reason', label: 'Reason', get: (r) => r.reason || '' },
    { key: 'user', label: 'By', get: (r) => `${r.userName} · ${r.counter}` },
  ];
  return (
    <Page search exportable title="Returns" urdu="واپسی" sub="Goods brought back. To make a return, open the bill from Bills and press Return items." period>
      <div className="kpis">
        <Kpi label="Returns" value={rows.length} money={false} color="var(--s7)" />
        <Kpi label="Refunded" value={-total} tone="bad" color="var(--bad)" />
        <Kpi label="Damaged stock written off (at cost)" value={-damaged} tone={damaged ? 'bad' : undefined} color="var(--bad)" />
      </div>
      <div className="panel">
        <div className="panel-b">
          <DataTable rows={rows} cols={cols} csvName="returns" />
        </div>
      </div>
    </Page>
  );
}
