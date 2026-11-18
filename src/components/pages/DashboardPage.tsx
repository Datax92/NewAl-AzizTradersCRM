'use client';

import React, { useMemo } from 'react';
import { Printer, TriangleAlert, CircleAlert, Info, CircleCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, Money, MethodChip, Delta, Empty, Tag, StockQty, RangePicker, Kpi } from '../Shared';
import { Bars, Donut } from '../Charts';
import { AppIcon } from '../AppIcons';
import { alerts, balances, daily, pnl, reorderSuggestions, stockValue, accountBalances, type Alert } from '../../lib/logic';
import { addDays, dTime, dayLabel, eachDay, prevRange, rs, num, startOfDay, relDay } from '../../lib/format';
import { ReceiptModal } from '../Receipt';

export function DashboardPage() {
  return useTab() === 'alerts' ? <AlertsView /> : <Overview />;
}

const METHOD_COLORS: Record<string, string> = { Cash: 'var(--m-cash)', Bank: 'var(--m-bank)', JazzCash: 'var(--m-jazz)', Easypaisa: 'var(--m-easy)', Khata: 'var(--m-khata)' };

function Overview() {
  const { db, range, can, go, openModal, me } = useApp();
  const p = useMemo(() => pnl(db, range), [db, range]);
  const pr = prevRange(range);
  const pp = useMemo(() => (pr ? pnl(db, pr) : null), [db, pr?.from.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const bal = useMemo(() => balances(db), [db]);
  const acc = useMemo(() => accountBalances(db), [db]);
  const receivable = db.parties.filter((x) => x.type === 'customer').reduce((a, x) => a + Math.max(0, bal.get(x.id)?.balance || 0), 0);
  const payable = db.parties.filter((x) => x.type === 'supplier').reduce((a, x) => a + Math.max(0, bal.get(x.id)?.balance || 0), 0);
  const sv = useMemo(() => stockValue(db), [db]);
  const al = useMemo(() => alerts(db).filter((a) => !a.need || can(a.need)), [db, can]);
  const seeProfit = can('profit');

  // A single day still shows a trend: the two weeks up to it.
  const chartRange = range.to.getTime() - range.from.getTime() <= 86400000 * 1.5 ? { ...range, from: addDays(startOfDay(range.from), -13) } : range;
  const first = db.sales.reduce((a, s) => (s.date < a ? s.date : a), new Date().toISOString());
  const days = eachDay(range.key === 'all' ? { ...chartRange, from: startOfDay(new Date(first)) } : chartRange, 90);
  const series = useMemo(() => daily(db, days), [db, days.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useMemo(() => [...db.sales].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7), [db.sales]);
  const sugg = useMemo(() => reorderSuggestions(db).slice(0, 7), [db]);
  const methods = (['Cash', 'Bank', 'JazzCash', 'Easypaisa', 'Khata'] as const).map((m) => ({ label: m === 'Khata' ? 'Khata (credit)' : m, value: p.byMethod[m] || 0, color: METHOD_COLORS[m] }));
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const loss = seeProfit ? p.netProfit < 0 : false;

  const figs = [
    { icon: 'sales', k: 'Sales', v: p.netSales, f: `${p.bills} bills · ${num(p.items)} items`, go: 'sales/bills', show: true },
    { icon: 'gross', k: 'Gross profit', v: p.grossProfit, f: `${p.grossMargin.toFixed(1)}% margin`, go: 'reports/pnl', show: seeProfit, pl: true },
    { icon: 'cash', k: 'Cash in hand', v: acc.Cash, f: `Bank ${rs(acc.Bank)}`, go: 'cash/accounts', show: can('cashbook') },
    { icon: 'khata', k: 'Customers owe', v: receivable, f: 'khata to collect', go: 'khata/customers', show: can('khata') },
    { icon: 'receivables', k: 'Payables', v: payable, f: 'we owe suppliers', go: 'khata/suppliers', show: can('purchases') },
    { icon: 'value', k: 'Stock at cost', v: sv.cost, f: `sells for ${rs(sv.retail)}`, go: 'stock/value', show: can('cost.view') },
  ].filter((x) => x.show);

  return (
    <div className="page">
      <div className="dhero">
        <div className="dhero-t">
          <span className="kicker">
            {hello}, {me!.name.split(' ')[0]}
          </span>
          <h1>Shop dashboard</h1>
          <p>{range.label} · everything is worked out from the bills, purchases and expenses</p>
        </div>
        <span className="spacer" />
        <div className="dhero-acts">
          <RangePicker />
          <button type="button" className="btn dhero-print" onClick={() => window.print()}>
            <Printer size={14} /> Print dashboard
          </button>
        </div>
      </div>

      {al.length > 0 && (
        <button type="button" className="dalert" onClick={() => go('dashboard/alerts')}>
          <TriangleAlert size={16} className="ic" />
          <span>
            <b>{al.length} alerts</b> — {al.slice(0, 3).map((a) => a.title).join(' · ')}
          </span>
        </button>
      )}

      <div className="dtop">
        {seeProfit ? (
          <button type="button" className={`dbig ${loss ? 'loss' : ''}`} onClick={() => go('reports/pnl')}>
            <span className="k">{loss ? 'Net loss' : 'Net profit'}</span>
            <span className="v">{rs(p.netProfit)}</span>
            <span className="f">
              {pp && (
                <>
                  <Delta now={p.netProfit} prev={pp.netProfit} /> <span>vs previous period</span>
                </>
              )}
            </span>
            <span className="dbig-rows">
              <span>
                Sales <b>{rs(p.netSales)}</b>
              </span>
              <span>
                Gross profit <b>{rs(p.grossProfit)}</b>
              </span>
              <span>
                Expenses <b>{rs(p.expenses)}</b>
              </span>
            </span>
          </button>
        ) : (
          <button type="button" className="dbig" onClick={() => go('sales/bills')}>
            <span className="k">Sales</span>
            <span className="v">{rs(p.netSales)}</span>
            <span className="f">
              {p.bills} bills · average {rs(p.avgBill)}
            </span>
          </button>
        )}
        <div className="dfigs">
          {figs.map((x) => (
            <button key={x.k} type="button" className="dfig" onClick={() => go(x.go)}>
              <span className="dfig-ic">
                <AppIcon name={x.icon} size={30} />
              </span>
              <span className="dfig-t">
                <span className="k">{x.k}</span>
                <span className={`v ${x.pl ? (x.v >= 0 ? 'pos' : 'neg') : ''}`}>{rs(x.v)}</span>
                <span className="f">{x.f}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid c2u">
        <Panel title="Sales by day" sub={`${dayLabel(days[0])} – ${dayLabel(days[days.length - 1])}`}>
          <Bars
            data={series.map((d) => ({
              label: dayLabel(d.day),
              value: d.sales,
              tip: (
                <>
                  <span>
                    Sales <b>{rs(d.sales)}</b> · {d.bills} bills
                  </span>
                  {seeProfit && <span className={d.profit >= 0 ? 'good' : 'bad'}>Profit {rs(d.profit)}</span>}
                </>
              ),
            }))}
            color="var(--s1)"
          />
        </Panel>
        <Panel title="How customers paid" sub={range.label}>
          <Donut data={methods} center={rs(p.netSales + p.returns)} sub="billed" />
        </Panel>
      </div>

      <div className="grid c2" style={{ marginTop: 16 }}>
        <Panel title="Recent bills" actions={<button className="link" onClick={() => go('sales/bills')}>Sales register</button>} tight>
          <div className="mini">
            {recent.map((s) => (
              <button key={s.id} className={`mini-r ${s.status === 'void' ? 'void' : ''}`} onClick={() => openModal(<ReceiptModal saleId={s.id} />)}>
                <span>
                  <b>{s.no}</b>
                  <small>
                    {relDay(s.date) === 'today' ? dTime(s.date) : relDay(s.date)} · {s.customerName || 'Walk-in'}
                  </small>
                </span>
                <span className="mini-v">
                  {s.status === 'void' ? <Tag tone="bad">Cancelled</Tag> : <Money v={s.total} cls="strong" />}
                  <span className="mchips">
                    {s.payments.map((x, i) => (
                      <MethodChip key={i} m={x.method} />
                    ))}
                  </span>
                </span>
              </button>
            ))}
            {!recent.length && <Empty title="No bills yet" />}
          </div>
        </Panel>
        <Panel title="Need to buy" sub="running out" actions={can('purchases') ? <button className="link" onClick={() => go('purchases/suggest')}>What to buy</button> : undefined} tight>
          <div className="mini">
            {sugg.map((s) => (
              <div key={s.product.id} className="mini-r">
                <span>
                  <b>{s.product.name}</b>
                  <small>{isFinite(s.daysLeft) ? `about ${Math.floor(s.daysLeft)} days left` : 'not selling lately'}</small>
                </span>
                <span className="mini-v">
                  <StockQty p={s.product} />
                  <Tag tone={s.urgency === 'now' ? 'bad' : s.urgency === 'soon' ? 'warn' : 'mute'}>buy {s.suggest}</Tag>
                </span>
              </div>
            ))}
            {!sugg.length && <Empty title="Stock is fine">Nothing needs reordering.</Empty>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const ICONS: Record<Alert['level'], React.ReactNode> = {
  high: <CircleAlert className="ic" />, med: <TriangleAlert className="ic" />, low: <Info className="ic" />, good: <CircleCheck className="ic" />,
};

function AlertsView() {
  const { db, can, go } = useApp();
  const list = useMemo(() => alerts(db).filter((a) => !a.need || can(a.need)), [db, can]);
  const rank = ['high', 'med', 'low', 'good'];
  const count = (l: Alert['level']) => list.filter((a) => a.level === l).length;
  return (
    <Page title="Alerts & notifications" urdu="اطلاعات" sub="Everything that needs a decision, most urgent first. An alert clears itself once it is dealt with.">
      <div className="kpis">
        <Kpi label="Urgent" value={count('high')} money={false} tone={count('high') ? 'bad' : undefined} />
        <Kpi label="Needs attention" value={count('med')} money={false} tone={count('med') ? 'warn' : undefined} />
        <Kpi label="For information" value={count('low')} money={false} />
      </div>
      {!list.length ? (
        <Empty title="All clear">No low stock, no overdue khata, nothing pending.</Empty>
      ) : (
        <div className="alerts">
          {[...list].sort((a, b) => rank.indexOf(a.level) - rank.indexOf(b.level)).map((a) => (
            <button key={a.id} className={`alert ${a.level}`} onClick={() => go(a.go)}>
              {ICONS[a.level]}
              <span>
                <span className="t">
                  {a.title} <span className="tag mute">{a.group}</span>
                </span>
                <span className="d">{a.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}
