'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, DataTable, Money, Kpi, MethodChip, Delta, type Col } from '../Shared';
import { ExpenseForm } from '../Forms';
import { Donut, Bars } from '../Charts';
import type { Expense } from '../../lib/types';
import { dShort, inRange, prevRange, rs, monthLabel } from '../../lib/format';
import { pnl } from '../../lib/logic';

export function ExpensesPage() {
  return useTab() === 'summary' ? <Summary /> : <List />;
}

const CAT_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

function List() {
  const { db, range, openModal, params } = useApp();
  const [cat, setCat] = useState('');
  useEffect(() => {
    if (params.get('new')) openModal(<ExpenseForm />);
  }, [params.get('new')]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => db.expenses.filter((e) => inRange(e.date, range) && (!cat || e.category === cat)).sort((a, b) => (a.date < b.date ? 1 : -1)), [db.expenses, range, cat]);
  const total = rows.reduce((a, e) => a + e.amount, 0);
  const pr = prevRange(range);
  const prev = pr ? db.expenses.filter((e) => inRange(e.date, pr) && (!cat || e.category === cat)).reduce((a, e) => a + e.amount, 0) : 0;
  const sales = useMemo(() => pnl(db, range).netSales, [db, range]);
  const cats = [...new Set(db.expenses.map((e) => e.category))];
  const cols: Col<Expense>[] = [
    { key: 'date', label: 'Date', get: (e) => e.date, render: (e) => dShort(e.date) },
    { key: 'category', label: 'Category', render: (e) => <b>{e.category}</b> },
    { key: 'payee', label: 'Paid to', get: (e) => e.payee || '' },
    { key: 'note', label: 'Note', get: (e) => e.note || '' },
    { key: 'method', label: 'Paid from', render: (e) => <MethodChip m={e.method} /> },
    { key: 'amount', label: 'Amount', r: true, get: (e) => e.amount, render: (e) => <Money v={-e.amount} tone="bad" />, total: () => <Money v={-total} tone="bad" /> },
    { key: 'user', label: 'By', get: (e) => e.userName },
  ];
  return (
    <Page search exportable title="Expenses" urdu="اخراجات" sub="Money spent to run the shop — rent, bills, salaries, tea. Expenses are taken off profit." period actions={<button className="btn pri" onClick={() => openModal(<ExpenseForm />)}><Plus size={15} /> New expense</button>}>
      <div className="kpis">
        <Kpi label="Spent" value={-total} tone="bad" color="var(--bad)" foot={pr && <><Delta now={total} prev={prev} invert /> <span className="vs">vs {pr.label}</span></>} />
        <Kpi label="Entries" value={rows.length} money={false} color="var(--s7)" />
        <Kpi label="Expenses as % of sales" value={sales ? `${((total / sales) * 100).toFixed(1)}%` : '—'} color="var(--warn)" foot={<span className="vs">of {rs(sales)} sales</span>} />
      </div>
      <div className="panel">
        <div className="panel-b">
          <DataTable
            rows={rows}
            cols={cols}
            csvName="expenses"
            onRow={(e) => openModal(<ExpenseForm expense={e} />)}
            filters={
              <select className="fldsel" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">All categories</option>
                {cats.map((c) => <option key={c}>{c}</option>)}
              </select>
            }
          />
        </div>
      </div>
    </Page>
  );
}

function Summary() {
  const { db, range } = useApp();
  const p = useMemo(() => pnl(db, range), [db, range]);
  const ents = Object.entries(p.expenseBy).sort((a, b) => b[1] - a[1]);
  const top = ents.slice(0, 7);
  const other = ents.slice(7).reduce((a, [, v]) => a + v, 0);
  const slices = [...top.map(([k, v], i) => ({ label: k, value: v, color: CAT_COLORS[i] })), ...(other ? [{ label: 'Other', value: other, color: 'var(--ink-3)' }] : [])];
  const months = useMemo(() => {
    const m = new Map<string, number>();
    const start = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      m.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
    }
    db.expenses.forEach((e) => {
      const k = e.date.slice(0, 7);
      if (m.has(k)) m.set(k, m.get(k)! + e.amount);
    });
    return [...m.entries()].map(([k, v]) => ({ label: monthLabel(k).slice(0, 3), value: v, tip: <span>{monthLabel(k)}: <b className="bad">{rs(v)}</b></span> }));
  }, [db.expenses]);
  return (
    <Page title="Expenses by category" urdu="اخراجات کی اقسام" sub="Where the money goes." period>
      <div className="grid c2">
        <Panel title="Share by category" sub={range.label}>
          <Donut data={slices} center={rs(p.expenses)} sub="spent" />
        </Panel>
        <Panel title="Last 12 months">
          <Bars data={months} color="var(--s2)" labelEvery={1} />
        </Panel>
      </div>
      <Panel title="Categories" sub={range.label} cls="mt">
        <table className="tbl">
          <thead><tr><th>Category</th><th className="r">Amount</th><th className="r">Share</th><th className="r">% of sales</th></tr></thead>
          <tbody>
            {ents.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td className="r"><Money v={-v} tone="bad" /></td><td className="r">{p.expenses ? ((v / p.expenses) * 100).toFixed(1) : 0}%</td><td className="r">{p.netSales ? ((v / p.netSales) * 100).toFixed(1) : 0}%</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td className="r"><Money v={-p.expenses} tone="bad" /></td><td /><td className="r">{p.netSales ? ((p.expenses / p.netSales) * 100).toFixed(1) : 0}%</td></tr></tfoot>
        </table>
      </Panel>
    </Page>
  );
}
