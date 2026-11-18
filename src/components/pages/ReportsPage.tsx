'use client';

import React, { useMemo } from 'react';
import { Printer, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, DataTable, Money, Kpi, Delta, Tag, Empty, type Col } from '../Shared';
import { Bars, RankBars } from '../Charts';
import { pnl, daily, productStats, categoryStats, activeSales, balances, saleProfit, type PnL, type DayRow } from '../../lib/logic';
import { eachDay, prevRange, rs, num, pct, dayLabel, monthLabel, toCSV, download, ymd, inRange, type Range } from '../../lib/format';

export function ReportsPage() {
  const t = useTab();
  if (t === 'daily') return <Daily />;
  if (t === 'products') return <Products />;
  if (t === 'categories') return <Categories />;
  if (t === 'staff') return <Staff />;
  if (t === 'khata') return <KhataSummary />;
  return <ProfitLoss />;
}

function PrintBtns({ csv }: { csv?: () => void }) {
  return (
    <>
      {csv && <button className="btn" onClick={csv}><Download size={14} /> Excel</button>}
      <button className="btn" onClick={() => window.print()}><Printer size={14} /> PDF</button>
    </>
  );
}

function ProfitLoss() {
  const { db, range } = useApp();
  const p = useMemo(() => pnl(db, range), [db, range]);
  const pr = prevRange(range);
  const q = useMemo(() => (pr ? pnl(db, pr) : null), [db, pr?.from.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => {
    const out: { key: string; p: PnL }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const r: Range = { key: 'custom', from, to, label: '' };
      out.push({ key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`, p: pnl(db, r) });
    }
    return out.filter((m, i) => i >= out.findIndex((x) => x.p.bills > 0 || x.p.expenses > 0));
  }, [db]);

  type Line = { label: string; k: keyof PnL; sign: 1 | -1; kind?: 'sub' | 'tot'; note?: string; invert?: boolean };
  const lines: Line[] = [
    { label: 'Sales (at bill prices)', k: 'grossSales', sign: 1 },
    { label: 'Discounts given', k: 'discounts', sign: -1, invert: true },
    { label: 'Returns refunded', k: 'returns', sign: -1, invert: true },
    { label: 'Net sales', k: 'netSales', sign: 1, kind: 'sub' },
    { label: 'Cost of goods sold', k: 'cogs', sign: -1, note: 'what the items sold cost you', invert: true },
    { label: 'Gross profit', k: 'grossProfit', sign: 1, kind: 'sub' },
    { label: 'Damaged / lost / corrected stock', k: 'stockLoss', sign: -1, invert: true },
    { label: 'Shop expenses', k: 'expenses', sign: -1, invert: true },
    { label: p.netProfit >= 0 ? 'Net profit' : 'Net loss', k: 'netProfit', sign: 1, kind: 'tot' },
  ];
  const csv = () =>
    download(`profit-loss-${ymd()}.csv`, toCSV([['Line', range.label, ...(q ? ['Previous period'] : [])], ...lines.map((l) => [l.label, (p[l.k] as number) * l.sign, ...(q ? [(q[l.k] as number) * l.sign] : [])]), [], ['Expense category', 'Amount'], ...Object.entries(p.expenseBy).map(([k, v]) => [k, v])]));

  return (
    <Page title="Profit & loss" urdu="نفع و نقصان" sub="From sales down to what the shop actually earned. Green is profit, red is loss." period toolsEnd={<PrintBtns csv={csv} />}>
      <div className="kpis">
        <Kpi label="Net sales" value={p.netSales} color="var(--s1)" foot={q && <><Delta now={p.netSales} prev={q.netSales} /> <span className="vs">vs {pr!.label}</span></>} />
        <Kpi label="Gross profit" value={p.grossProfit} tone="pl" color={p.grossProfit >= 0 ? 'var(--good)' : 'var(--bad)'} foot={<span className="vs">{pct(p.grossMargin)} of sales</span>} />
        <Kpi label="Expenses" value={-p.expenses} tone={p.expenses ? 'bad' : undefined} color="var(--bad)" foot={q && <><Delta now={p.expenses} prev={q.expenses} invert /> <span className="vs">vs {pr!.label}</span></>} />
        <Kpi label={p.netProfit >= 0 ? 'Net profit' : 'Net loss'} value={p.netProfit} tone="pl" color={p.netProfit >= 0 ? 'var(--good)' : 'var(--bad)'} foot={<span className={p.netProfit >= 0 ? 'good' : 'bad'}>{pct(p.netMargin)} net margin</span>} />
      </div>
      <div className="grid c2u">
        <Panel title="Statement" sub={range.label}>
          <table className="tbl pl">
            <thead><tr><th /><th className="r">{range.label}</th>{q && <th className="r">Previous</th>}{q && <th className="r">Change</th>}</tr></thead>
            <tbody>
              {lines.map((l) => {
                const v = (p[l.k] as number) * l.sign;
                const w = q ? (q[l.k] as number) * l.sign : 0;
                return (
                  <tr key={l.k} className={l.kind || ''}>
                    <td>{l.label}{l.note && <small className="muted"> — {l.note}</small>}</td>
                    <td className="r">{l.kind ? <Money v={v} tone="pl" /> : v < 0 ? <span className="bad">{rs(v)}</span> : rs(v)}</td>
                    {q && <td className="r muted">{rs(w)}</td>}
                    {q && <td className="r"><Delta now={Math.abs(v)} prev={Math.abs(w)} invert={l.invert} /></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className={`verdict ${p.netProfit >= 0 ? 'good' : 'bad'}`}>
            {p.netProfit >= 0 ? `The shop made ${rs(p.netProfit)} profit` : `The shop lost ${rs(-p.netProfit)}`} {range.label.toLowerCase()} — {p.bills} bills, {num(p.items)} items sold, average bill {rs(p.avgBill)}.
          </div>
        </Panel>
        <Panel title="Expenses" sub={range.label}>
          {!p.expenses && <Empty title="No expenses in this period" />}
          <RankBars data={Object.entries(p.expenseBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, sub: p.netSales ? `${((v / p.netSales) * 100).toFixed(1)}% of sales` : '' }))} color="var(--s2)" />
        </Panel>
      </div>
      <Panel title="Month by month" sub="green months made money, red months lost it" cls="mt">
        <Bars signed data={months.map((m) => ({ label: monthLabel(m.key).slice(0, 3), value: m.p.netProfit, tip: <><span>{monthLabel(m.key)}</span><span>Sales <b>{rs(m.p.netSales)}</b></span><span>Gross profit <b>{rs(m.p.grossProfit)}</b></span><span>Expenses <b className="bad">{rs(m.p.expenses)}</b></span><span className={m.p.netProfit >= 0 ? 'good' : 'bad'}>Net <b>{rs(m.p.netProfit)}</b></span></> }))} height={190} labelEvery={1} />
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Month</th><th className="r">Bills</th><th className="r">Net sales</th><th className="r">Gross profit</th><th className="r">Margin</th><th className="r">Expenses</th><th className="r">Net profit</th></tr></thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.key}>
                  <td>{monthLabel(m.key)}</td><td className="r">{m.p.bills}</td><td className="r">{rs(m.p.netSales)}</td>
                  <td className="r"><Money v={m.p.grossProfit} tone="pl" /></td><td className="r">{pct(m.p.grossMargin)}</td>
                  <td className="r bad">{rs(m.p.expenses)}</td><td className="r"><b><Money v={m.p.netProfit} tone="pl" /></b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}

function Daily() {
  const { db, range, can } = useApp();
  const first = db.sales.reduce((a, s) => (s.date < a ? s.date : a), new Date().toISOString());
  const days = eachDay(range.key === 'all' ? { ...range, from: new Date(first) } : range, 400);
  const rows = useMemo(() => daily(db, days).reverse().map((d) => ({ ...d, id: d.day })), [db, days.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const seeP = can('profit');
  const sum = (k: keyof DayRow) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const cols: Col<DayRow & { id: string }>[] = [
    { key: 'day', label: 'Day', render: (d) => <b>{new Date(d.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</b> },
    { key: 'bills', label: 'Bills', r: true, total: () => num(sum('bills')) },
    { key: 'sales', label: 'Sales', r: true, render: (d) => rs(d.sales), total: () => rs(sum('sales')) },
    { key: 'profit', label: 'Gross profit', r: true, hide: !seeP, render: (d) => <Money v={d.profit} tone="pl" />, total: () => <Money v={sum('profit')} tone="pl" /> },
    { key: 'expenses', label: 'Expenses', r: true, hide: !seeP, render: (d) => (d.expenses ? <span className="bad">−{rs(d.expenses)}</span> : ''), total: () => <span className="bad">−{rs(sum('expenses'))}</span> },
    { key: 'net', label: 'Net', r: true, hide: !seeP, render: (d) => <b><Money v={d.net} tone="pl" /></b>, total: () => <Money v={sum('net')} tone="pl" /> },
  ];
  const best = rows.reduce((a, r) => (r.sales > (a?.sales || 0) ? r : a), rows[0]);
  return (
    <Page search exportable title="Day by day" urdu="روزانہ" sub="Each day’s bills, sales and — for the owner — profit after that day’s expenses." period>
      <div className="kpis">
        <Kpi label="Days" value={rows.length} money={false} color="var(--s7)" />
        <Kpi label="Average sales per day" value={rows.length ? sum('sales') / rows.length : 0} color="var(--s1)" />
        {best && <Kpi label="Best day" value={best.sales} color="var(--good)" foot={<span className="vs">{dayLabel(best.day)}</span>} />}
        {seeP && <Kpi label="Days in loss" value={rows.filter((r) => r.net < 0).length} money={false} tone={rows.some((r) => r.net < 0) ? 'bad' : undefined} color="var(--bad)" foot={<span className="vs">usually rent / salary days</span>} />}
      </div>
      <div className="panel"><div className="panel-b"><DataTable rows={rows} cols={cols} csvName="daily-report" search={false} pageSize={40} rowCls={(d) => (seeP && d.net < 0 ? 'row-bad' : '')} /></div></div>
    </Page>
  );
}

function Products() {
  const { db, range, can } = useApp();
  const seeP = can('profit');
  const rows = useMemo(() => {
    const st = productStats(db, range);
    return [...st.entries()].map(([id, x]) => {
      const p = db.products.find((q) => q.id === id);
      return { id, name: p?.name || '?', category: p?.category || '', ...x, margin: x.revenue ? (x.profit / x.revenue) * 100 : 0, stock: p?.stock ?? 0 };
    }).filter((r) => r.qty !== 0 || r.revenue !== 0);
  }, [db, range]);
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { key: 'name', label: 'Product', render: (r) => <b>{r.name}</b> },
    { key: 'category', label: 'Category' },
    { key: 'qty', label: 'Units sold', r: true, render: (r) => num(r.qty), total: (x) => num(x.reduce((a, r) => a + r.qty, 0)) },
    { key: 'bills', label: 'Bills', r: true },
    { key: 'revenue', label: 'Sales', r: true, render: (r) => rs(r.revenue), total: (x) => rs(x.reduce((a, r) => a + r.revenue, 0)) },
    { key: 'cost', label: 'Cost', r: true, hide: !seeP, render: (r) => rs(r.cost) },
    { key: 'profit', label: 'Profit', r: true, hide: !seeP, render: (r) => <Money v={r.profit} tone="pl" />, total: (x) => <Money v={x.reduce((a, r) => a + r.profit, 0)} tone="pl" /> },
    { key: 'margin', label: 'Margin', r: true, hide: !seeP, render: (r) => <span className={`pill ${r.margin < 0 ? 'bad' : r.margin < 10 ? 'warn' : 'good'}`}>{pct(r.margin)}</span> },
    { key: 'stock', label: 'In stock now', r: true, render: (r) => <span className={r.stock <= 0 ? 'bad' : ''}>{num(r.stock)}</span> },
  ];
  const losers = rows.filter((r) => r.profit < 0);
  return (
    <Page search exportable title="Product sales" urdu="مصنوعات کی فروخت" sub="What sold, how much it brought in, and — for the owner — which items make money and which lose it." period>
      {seeP && losers.length > 0 && <div className="note bad" style={{ marginBottom: 14 }}>{losers.length} product{losers.length > 1 ? 's were' : ' was'} sold at a loss: {losers.slice(0, 5).map((r) => r.name).join(', ')}. Check their prices.</div>}
      <div className="grid c2">
        <Panel title="Top by sales"><RankBars data={[...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((r) => ({ label: r.name, value: r.revenue, sub: `${num(r.qty)} sold` }))} /></Panel>
        {seeP ? <Panel title="Top by profit"><RankBars signed data={[...rows].sort((a, b) => b.profit - a.profit).slice(0, 8).map((r) => ({ label: r.name, value: r.profit, sub: pct(r.margin) + ' margin' }))} /></Panel> : <Panel title="Top by units"><RankBars fmt={num} data={[...rows].sort((a, b) => b.qty - a.qty).slice(0, 8).map((r) => ({ label: r.name, value: r.qty }))} color="var(--s3)" /></Panel>}
      </div>
      <Panel title="All products sold" cls="mt"><DataTable rows={rows} cols={cols} csvName="product-sales" defaultSort={{ key: 'revenue', dir: -1 }} /></Panel>
    </Page>
  );
}

function Categories() {
  const { db, range, can } = useApp();
  const rows = useMemo(() => categoryStats(db, range).map((c) => ({ ...c, id: c.name })), [db, range]);
  const seeP = can('profit');
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { key: 'name', label: 'Category', render: (c) => <b>{c.name}</b> },
    { key: 'items', label: 'Products', r: true },
    { key: 'qty', label: 'Units sold', r: true, render: (c) => num(c.qty) },
    { key: 'revenue', label: 'Sales', r: true, render: (c) => rs(c.revenue), total: (x) => rs(x.reduce((a, c) => a + c.revenue, 0)) },
    { key: 'profit', label: 'Profit', r: true, hide: !seeP, render: (c) => <Money v={c.profit} tone="pl" />, total: (x) => <Money v={x.reduce((a, c) => a + c.profit, 0)} tone="pl" /> },
    { key: 'margin', label: 'Margin', r: true, hide: !seeP, get: (c) => (c.revenue ? (c.profit / c.revenue) * 100 : 0), render: (c) => pct(c.revenue ? (c.profit / c.revenue) * 100 : 0) },
    { key: 'stockCost', label: 'Stock at cost', r: true, hide: !can('cost.view'), render: (c) => rs(c.stockCost), total: (x) => rs(x.reduce((a, c) => a + c.stockCost, 0)) },
    { key: 'stockRetail', label: 'Stock at price', r: true, render: (c) => rs(c.stockRetail) },
  ];
  return (
    <Page search exportable title="Categories" urdu="اقسام" sub="Sales and stock by product group." period>
      <Panel title="Sales by category"><RankBars data={rows.filter((r) => r.revenue > 0).map((r) => ({ label: r.name, value: r.revenue, sub: seeP ? `profit ${rs(r.profit)}` : `${num(r.qty)} units` }))} /></Panel>
      <Panel title="Detail" cls="mt"><DataTable rows={rows} cols={cols} csvName="category-report" search={false} /></Panel>
    </Page>
  );
}

function Staff() {
  const { db, range, can } = useApp();
  const seeP = can('profit');
  const rows = useMemo(() => {
    const m = new Map<string, { id: string; name: string; counters: Set<string>; bills: number; sales: number; profit: number; disc: number; voids: number; returns: number; credit: number }>();
    const get = (n: string) => {
      let x = m.get(n);
      if (!x) m.set(n, (x = { id: n, name: n, counters: new Set(), bills: 0, sales: 0, profit: 0, disc: 0, voids: 0, returns: 0, credit: 0 }));
      return x;
    };
    db.sales.filter((s) => inRange(s.date, range)).forEach((s) => {
      const x = get(s.userName);
      x.counters.add(s.counter);
      if (s.status === 'void') return void x.voids++;
      x.bills++;
      x.sales += s.total;
      x.profit += saleProfit(s);
      x.disc += s.discount + s.items.reduce((a, i) => a + i.disc, 0);
      x.credit += s.payments.filter((p) => p.method === 'Khata').reduce((a, p) => a + p.amount, 0);
    });
    db.returns.filter((r) => inRange(r.date, range)).forEach((r) => (get(r.userName).returns += r.total));
    return [...m.values()].map((x) => ({ ...x, counters: [...x.counters].join(', ') }));
  }, [db, range]);
  const counters = useMemo(() => {
    const m = new Map<string, number>();
    activeSales(db, range).forEach((s) => m.set(s.counter, (m.get(s.counter) || 0) + s.total));
    return [...m.entries()];
  }, [db, range]);
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    { key: 'name', label: 'Staff', render: (r) => <b>{r.name}</b> },
    { key: 'counters', label: 'Counter' },
    { key: 'bills', label: 'Bills', r: true },
    { key: 'sales', label: 'Sales', r: true, render: (r) => rs(r.sales), total: (x) => rs(x.reduce((a, r) => a + r.sales, 0)) },
    { key: 'avg', label: 'Avg bill', r: true, get: (r) => (r.bills ? r.sales / r.bills : 0), render: (r) => rs(r.bills ? r.sales / r.bills : 0) },
    { key: 'profit', label: 'Profit made', r: true, hide: !seeP, render: (r) => <Money v={r.profit} tone="pl" /> },
    { key: 'disc', label: 'Discounts given', r: true, render: (r) => (r.disc ? <span className="warn">{rs(r.disc)}</span> : '—') },
    { key: 'credit', label: 'Given on khata', r: true, render: (r) => rs(r.credit) },
    { key: 'returns', label: 'Returns', r: true, render: (r) => (r.returns ? <span className="violet">{rs(r.returns)}</span> : '—') },
    { key: 'voids', label: 'Cancelled', r: true, render: (r) => (r.voids ? <Tag tone="bad">{r.voids}</Tag> : '—') },
  ];
  return (
    <Page search exportable title="Staff & counters" urdu="عملہ و کاؤنٹر" sub="Who sold what, discounts given and bills cancelled." period>
      <div className="kpis">
        {counters.map(([c, v], i) => <Kpi key={c} label={c} value={v} color={`var(--s${i + 1})`} />)}
      </div>
      <div className="panel"><div className="panel-b"><DataTable rows={rows} cols={cols} csvName="staff-report" search={false} defaultSort={{ key: 'sales', dir: -1 }} /></div></div>
    </Page>
  );
}

function KhataSummary() {
  const { db, go, can } = useApp();
  const bal = useMemo(() => balances(db), [db]);
  const buckets = (type: 'customer' | 'supplier') => {
    const rows = db.parties.filter((p) => p.type === type).map((p) => ({ id: p.id, name: p.name, phone: p.phone || '', ...bal.get(p.id)! })).filter((r) => r.balance > 0.5);
    const b = { '0–30 days': 0, '31–60 days': 0, '61–90 days': 0, 'Over 90 days': 0 } as Record<string, number>;
    rows.forEach((r) => (b[r.ageDays <= 30 ? '0–30 days' : r.ageDays <= 60 ? '31–60 days' : r.ageDays <= 90 ? '61–90 days' : 'Over 90 days'] += r.balance));
    return { rows, b };
  };
  const c = buckets('customer');
  const s = buckets('supplier');
  type R = (typeof c.rows)[number];
  const cols = (type: string): Col<R>[] => [
    { key: 'name', label: type, render: (r) => <b>{r.name}</b> },
    { key: 'phone', label: 'Phone' },
    { key: 'balance', label: 'Balance', r: true, render: (r) => rs(r.balance), total: (x) => rs(x.reduce((a, r) => a + r.balance, 0)) },
    { key: 'ageDays', label: 'Oldest unpaid', r: true, render: (r) => <span className={r.ageDays > 60 ? 'bad' : r.ageDays > 30 ? 'warn' : ''}>{r.ageDays} days</span> },
    { key: 'lastPay', label: 'Last payment', get: (r) => r.lastPay || '', render: (r) => (r.lastPay ? new Date(r.lastPay).toLocaleDateString('en-GB') : <span className="bad">never</span>) },
  ];
  const tones = ['var(--good)', 'var(--warn)', 'var(--s2)', 'var(--bad)'];
  const Ageing = ({ b }: { b: Record<string, number> }) => (
    <div className="ageing">
      {Object.entries(b).map(([k, v], i) => (
        <div key={k} style={{ '--c': tones[i] } as React.CSSProperties}><small>{k}</small><b>{rs(v)}</b></div>
      ))}
    </div>
  );
  return (
    <Page search exportable title="Khata ageing" urdu="کھاتہ خلاصہ" sub="Balances by how long they have been unpaid. The older the money, the harder it is to collect.">
      <Panel title="Customers owe us" sub={rs(c.rows.reduce((a, r) => a + r.balance, 0))}>
        <Ageing b={c.b} />
        <DataTable rows={c.rows} cols={cols('Customer')} csvName="receivables" defaultSort={{ key: 'balance', dir: -1 }} onRow={(r) => go('khata/customers?id=' + r.id)} />
      </Panel>
      {can('purchases') && (
        <Panel title="We owe suppliers" sub={rs(s.rows.reduce((a, r) => a + r.balance, 0))} cls="mt">
          <Ageing b={s.b} />
          <DataTable rows={s.rows} cols={cols('Supplier')} csvName="payables" search={false} onRow={(r) => go('khata/suppliers?id=' + r.id)} />
        </Panel>
      )}
    </Page>
  );
}
