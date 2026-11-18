'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, PackageX, Save, ClipboardCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, DataTable, Money, Tag, Kpi, Picker, Field, NumInput, StockQty, Empty, type Col } from '../Shared';
import type { MoveType, Product, StockMove } from '../../lib/types';
import { buildStockMove, MOVE_LABEL, stockValue, categoryStats, stockState, auditOp, moveOp } from '../../lib/logic';
import { dFull, inRange, num, rs, makeRange, ymd } from '../../lib/format';
import type { Op } from '../../lib/db';
import { RankBars } from '../Charts';

export function StockPage() {
  const t = useTab();
  return t === 'log' ? <Log /> : t === 'count' ? <Count /> : t === 'value' ? <Value /> : <Entry />;
}

const TYPE_TONE: Record<MoveType, 'good' | 'bad' | 'warn' | 'info' | 'mute' | 'violet'> = {
  sale: 'info', purchase: 'good', return: 'violet', void: 'mute', in: 'good', out: 'bad', damage: 'bad', adjust: 'warn', opening: 'mute',
};

type EntryType = 'in' | 'out' | 'damage';
const REASONS: Record<EntryType, string[]> = {
  in: ['Opening stock', 'Received without a bill', 'Returned from repair / supplier', 'Found during count', 'Other'],
  out: ['Used in shop', 'Given as sample / gift', 'Sent for repair / to supplier', 'Transferred out', 'Other'],
  damage: ['Broken', 'Expired / dried out', 'Lost / missing', 'Faulty from supplier', 'Other'],
};

function Entry() {
  const { db, me, commit, can, go, params } = useApp();
  const [pid, setPid] = useState<string>();
  const [type, setType] = useState<EntryType>(params.get('t') === 'out' ? 'out' : 'in');
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [reason, setReason] = useState(REASONS[params.get('t') === 'out' ? 'out' : 'in'][0]);
  const [note, setNote] = useState('');
  const p = db.products.find((x) => x.id === pid);
  const signed = type === 'in' ? qty : -qty;
  const after = p ? p.stock + signed : 0;
  const today = useMemo(() => db.moves.filter((m) => ['in', 'out', 'damage', 'adjust'].includes(m.type) && inRange(m.date, makeRange('today'))).sort((a, b) => (a.date < b.date ? 1 : -1)), [db.moves]);

  const save = async () => {
    if (!p || qty <= 0) return;
    const ops = buildStockMove(me!, p, type, signed, [reason, note].filter(Boolean).join(' — '), type === 'in' && cost > 0 ? cost : undefined);
    if (await commit(ops, `${p.name}: ${signed > 0 ? '+' : ''}${signed} ${p.unit} — now ${after}`)) {
      setPid(undefined);
      setQty(1);
      setNote('');
      setCost(0);
    }
  };
  const pickType = (t: EntryType) => {
    setType(t);
    setReason(REASONS[t][0]);
  };
  // The Stock OUT shortcut can be used while this screen is already open.
  const want = params.get('t');
  useEffect(() => {
    if (want === 'out') pickType('out');
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  const TYPES: { t: EntryType; label: string; sub: string; icon: React.ReactNode }[] = [
    { t: 'in', label: 'Stock IN', sub: 'Goods came in', icon: <ArrowDownToLine size={18} /> },
    { t: 'out', label: 'Stock OUT', sub: 'Went out, not sold', icon: <ArrowUpFromLine size={18} /> },
    { t: 'damage', label: 'Damage / loss', sub: 'Broken or missing', icon: <PackageX size={18} /> },
  ];

  return (
    <Page
      title="Stock IN / OUT"
      urdu="اسٹاک اندر / باہر"
      sub="For goods that come in or go out without a sale. Buying from a supplier? Use Purchases, so the supplier’s khata is updated too."
      actions={can('purchases') ? <button className="btn" onClick={() => go('purchases/orders?new=1')}>New purchase</button> : undefined}
    >
      <div className="stockwrap">
        <section className="panel ovf stockform">
          <div className="panel-h">
            <h3>New entry</h3>
          </div>
          <div className="panel-b">
            <div className="stocktypes" role="group" aria-label="Entry type">
              {TYPES.map((x) => (
                <button key={x.t} type="button" className={`st ${x.t} ${type === x.t ? 'on' : ''}`} onClick={() => pickType(x.t)} aria-pressed={type === x.t}>
                  {x.icon}
                  <span>
                    <b>{x.label}</b>
                    <small>{x.sub}</small>
                  </span>
                </button>
              ))}
            </div>

            <Field label="Product" hint="Scan the barcode, or type part of the name.">
              <Picker items={db.products.filter((x) => x.active)} value={pid} onPick={(x) => setPid(x?.id)} label={(x) => x.name} sub={(x) => `${x.barcode} · ${num(x.stock)} ${x.unit} in stock`} autoFocus placeholder="Scan barcode or type name…" />
            </Field>

            {p && (
              <div className="selprod">
                <div className="selprod-t">
                  <b>{p.name}</b>
                  <small>
                    {p.category}
                    {p.shelf ? ` · shelf ${p.shelf}` : ''} · {p.barcode}
                  </small>
                </div>
                <div className="selprod-s">
                  <small>In stock</small>
                  <StockQty p={p} />
                </div>
              </div>
            )}

            <div className="formgrid stockfields">
              <Field label="Quantity">
                <span className="qtybox big">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Less">−</button>
                  <NumInput value={qty} onChange={(n) => setQty(Math.max(0, n))} min={0} />
                  <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="More">+</button>
                </span>
              </Field>
              <Field label="Reason">
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS[type].map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              {type === 'in' && can('cost.view') && (
                <Field label="Cost per unit" hint={p ? `Leave empty to keep ${rs(p.cost)}` : 'Optional'}>
                  <NumInput value={cost} onChange={setCost} min={0} placeholder="0" />
                </Field>
              )}
              <Field label="Note" full={!(type === 'in' && can('cost.view'))}>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
              </Field>
            </div>

            <div className="stockfoot">
              {p ? (
                <div className={`stockprev ${type}`}>
                  <span>
                    <small>Now</small>
                    <b>{num(p.stock)}</b>
                  </span>
                  <span className="op">
                    {signed > 0 ? '+' : '−'}
                    {num(qty)}
                  </span>
                  <span>
                    <small>After</small>
                    <b className={after <= 0 ? 'bad' : after <= p.minStock ? 'warn' : 'good'}>{num(after)}</b>
                  </span>
                  {type !== 'in' && can('cost.view') && (
                    <span className="sp-v">
                      <small>Value</small>
                      <Money v={-qty * p.cost} tone="bad" />
                    </span>
                  )}
                </div>
              ) : (
                <span className="muted small">Choose a product to see the stock before and after.</span>
              )}
              <button className={`btn big ${type === 'in' ? 'pri' : 'bad'}`} disabled={!p || qty <= 0} onClick={save}>
                <Save size={15} /> Save {type === 'in' ? 'Stock IN' : type === 'out' ? 'Stock OUT' : 'loss'}
              </button>
            </div>
          </div>
        </section>

        <Panel title="Entered today" sub={today.length ? `${today.length}` : undefined} actions={<button className="link" onClick={() => go('stock/log')}>All movements</button>} tight>
          {today.length ? (
            <div className="mini">
              {today.map((m) => (
                <div key={m.id} className="mini-r">
                  <span>
                    <b>{m.productName}</b>
                    <small>
                      {MOVE_LABEL[m.type]} · {m.note || '—'} · {m.userName}
                    </small>
                  </span>
                  <span className="mini-v">
                    <b className={m.qty > 0 ? 'good' : 'bad'}>
                      {m.qty > 0 ? '+' : ''}
                      {num(m.qty)}
                    </b>
                    <small>now {num(m.balance)}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Nothing entered today">Entries you save appear here.</Empty>
          )}
        </Panel>
      </div>
    </Page>
  );
}

function Log() {
  const { db, range, can } = useApp();
  const [type, setType] = useState('');
  const rows = useMemo(() => db.moves.filter((m) => inRange(m.date, range) && (!type || m.type === type)).sort((a, b) => (a.date < b.date ? 1 : -1)), [db.moves, range, type]);
  const inQ = rows.filter((m) => m.qty > 0).reduce((a, m) => a + m.qty, 0);
  const outQ = rows.filter((m) => m.qty < 0).reduce((a, m) => a - m.qty, 0);
  const cols: Col<StockMove>[] = [
    { key: 'date', label: 'Date & time', get: (m) => m.date, render: (m) => dFull(m.date) },
    { key: 'product', label: 'Product', get: (m) => m.productName, render: (m) => <b>{m.productName}</b> },
    { key: 'type', label: 'Type', get: (m) => MOVE_LABEL[m.type], render: (m) => <Tag tone={TYPE_TONE[m.type]}>{MOVE_LABEL[m.type]}</Tag> },
    { key: 'qty', label: 'Qty', r: true, get: (m) => m.qty, render: (m) => <b className={m.qty > 0 ? 'good' : 'bad'}>{m.qty > 0 ? '+' : ''}{num(m.qty)}</b> },
    { key: 'balance', label: 'Stock after', r: true, get: (m) => m.balance, render: (m) => <span className={m.balance <= 0 ? 'bad' : ''}>{num(m.balance)}</span> },
    { key: 'value', label: 'Value', r: true, hide: !can('cost.view'), get: (m) => m.qty * m.cost, render: (m) => <Money v={m.qty * m.cost} tone={m.qty > 0 ? 'good' : 'bad'} /> },
    { key: 'ref', label: 'Reference', get: (m) => m.ref || '', render: (m) => <span className="mono small">{m.ref || '—'}</span> },
    { key: 'note', label: 'Note', get: (m) => m.note || '' },
    { key: 'by', label: 'By', get: (m) => `${m.userName}${m.counter ? ' · ' + m.counter : ''}` },
  ];
  return (
    <Page search exportable title="Stock movements" urdu="اسٹاک کی نقل و حرکت" sub="Why every quantity changed: sales, purchases, returns, damage and corrections. The running total shows the stock after each movement." period>
      <div className="kpis">
        <Kpi label="Movements" value={rows.length} money={false} color="var(--s7)" />
        <Kpi label="Units in" value={inQ} money={false} tone="good" color="var(--good)" />
        <Kpi label="Units out" value={outQ} money={false} tone="bad" color="var(--bad)" />
      </div>
      <div className="panel">
        <div className="panel-b">
          <DataTable
            rows={rows}
            cols={cols}
            csvName="stock-movements"
            searchPlaceholder="Product, reference…"
            filters={
              <select className="fldsel" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                {(Object.keys(MOVE_LABEL) as MoveType[]).map((t) => <option key={t} value={t}>{MOVE_LABEL[t]}</option>)}
              </select>
            }
          />
        </div>
      </div>
    </Page>
  );
}

function Count() {
  const { db, me, commit, settings, can, confirm } = useApp();
  const [cat, setCat] = useState(settings.categories[0] || '');
  const [counted, setCounted] = useState<Record<string, number | ''>>({});
  const items = db.products.filter((p) => p.active && (!cat || p.category === cat)).sort((a, b) => (a.shelf || '').localeCompare(b.shelf || '') || a.name.localeCompare(b.name));
  const diffs = items.filter((p) => counted[p.id] !== undefined && counted[p.id] !== '' && Number(counted[p.id]) !== p.stock);
  const diffValue = diffs.reduce((a, p) => a + (Number(counted[p.id]) - p.stock) * p.cost, 0);
  const save = async () => {
    if (!diffs.length) return;
    if (!(await confirm({ title: `Correct ${diffs.length} item${diffs.length > 1 ? 's' : ''}?`, body: <>Stock will be set to what you counted. {can('cost.view') && <>Value of the difference: <Money v={diffValue} tone="pl" sign />.</>}</>, ok: 'Save count' }))) return;
    const ops: Op[] = [];
    diffs.forEach((p) => {
      const d = Number(counted[p.id]) - p.stock;
      ops.push({ t: 'inc', c: 'products', id: p.id, field: 'stock', by: d });
      ops.push(moveOp(p, 'adjust', d, p.cost, me!, 'COUNT-' + ymd(), `Counted ${counted[p.id]}, system had ${p.stock}`));
    });
    ops.push(auditOp(me!.name, 'Stock count', `${cat || 'All'}: ${diffs.length} items corrected, value ${rs(diffValue)}`, diffValue < 0 ? 'bad' : 'warn'));
    if (await commit(ops, 'Stock count saved')) setCounted({});
  };
  return (
    <Page
      title="Stock count" urdu="اسٹاک گنتی"
      sub="Count what is on the shelf and type it in. Only items that differ are corrected; the difference is recorded as a count correction (gain or loss)."
      actions={
        <button className="btn pri" disabled={!diffs.length} onClick={save}>
          <ClipboardCheck size={15} /> Save count ({diffs.length})
        </button>
      }
    >
      <div className="toolrow">
        <select className="fldsel" value={cat} onChange={(e) => (setCat(e.target.value), setCounted({}))}>
          <option value="">All categories</option>
          {settings.categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn sm gh" onClick={() => window.print()}>Print count sheet</button>
        <span className="spacer" />
        {diffs.length > 0 && can('cost.view') && (
          <span>
            Difference value <Money v={diffValue} tone="pl" sign />
          </span>
        )}
      </div>
      <div className="panel">
        <div className="tblwrap">
          <table className="tbl count">
            <thead>
              <tr>
                <th>Shelf</th>
                <th>Product</th>
                <th className="r">System says</th>
                <th className="r">Counted</th>
                <th className="r">Difference</th>
                {can('cost.view') && <th className="r">Value</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const c = counted[p.id];
                const d = c === undefined || c === '' ? null : Number(c) - p.stock;
                return (
                  <tr key={p.id} className={d ? (d < 0 ? 'row-bad' : 'row-good') : ''}>
                    <td className="mono">{p.shelf || '—'}</td>
                    <td>{p.name}</td>
                    <td className="r"><StockQty p={p} /></td>
                    <td className="r">
                      <input className="countin" type="number" min={0} value={c ?? ''} placeholder="—" onChange={(e) => setCounted((x) => ({ ...x, [p.id]: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) }))} />
                    </td>
                    <td className="r">{d === null ? <span className="muted">—</span> : d === 0 ? <Tag tone="good">matches</Tag> : <b className={d > 0 ? 'good' : 'bad'}>{d > 0 ? '+' : ''}{num(d)}</b>}</td>
                    {can('cost.view') && <td className="r">{d ? <Money v={d * p.cost} tone="pl" /> : ''}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  );
}

function Value() {
  const { db, range } = useApp();
  const sv = useMemo(() => stockValue(db), [db]);
  const cats = useMemo(() => categoryStats(db, range), [db, range]);
  const prods = useMemo(() => db.products.filter((p) => p.active && p.stock > 0).map((p) => ({ ...p, vc: p.stock * p.cost, vr: p.stock * p.price })), [db.products]);
  const negative = db.products.filter((p) => p.stock < 0);
  const cols: Col<Product & { vc: number; vr: number }>[] = [
    { key: 'name', label: 'Product', render: (p) => <b>{p.name}</b> },
    { key: 'category', label: 'Category' },
    { key: 'stock', label: 'Qty', r: true, get: (p) => p.stock, render: (p) => <StockQty p={p} /> },
    { key: 'cost', label: 'Avg cost', r: true, get: (p) => p.cost, render: (p) => rs(p.cost) },
    { key: 'vc', label: 'Value at cost', r: true, get: (p) => p.vc, render: (p) => rs(p.vc), total: (r) => <Money v={r.reduce((a, p) => a + p.vc, 0)} /> },
    { key: 'vr', label: 'Value at price', r: true, get: (p) => p.vr, render: (p) => rs(p.vr), total: (r) => <Money v={r.reduce((a, p) => a + p.vr, 0)} /> },
    { key: 'pp', label: 'Profit inside', r: true, get: (p) => p.vr - p.vc, render: (p) => <Money v={p.vr - p.vc} tone="pl" />, total: (r) => <Money v={r.reduce((a, p) => a + p.vr - p.vc, 0)} tone="pl" /> },
    { key: 'st', label: 'Status', get: (p) => stockState(p), render: (p) => <Tag tone={stockState(p) === 'low' ? 'warn' : 'good'}>{stockState(p) === 'low' ? 'Low' : 'OK'}</Tag> },
  ];
  return (
    <Page search exportable title="Stock value" urdu="اسٹاک کی مالیت" sub="What the goods on your shelves cost you, what they would sell for, and the profit waiting inside them.">
      <div className="kpis">
        <Kpi label="Stock at cost" value={sv.cost} color="var(--s3)" foot={<span className="vs">money tied up in goods</span>} />
        <Kpi label="Stock at selling price" value={sv.retail} color="var(--s1)" />
        <Kpi label="Profit inside the stock" value={sv.potential} tone="pl" color="var(--good)" foot={<span className="vs">{sv.retail ? ((sv.potential / sv.retail) * 100).toFixed(1) : 0}% average margin</span>} />
        <Kpi label="Units on shelves" value={sv.units} money={false} color="var(--s7)" />
      </div>
      {negative.length > 0 && (
        <div className="note bad" style={{ marginBottom: 16 }}>
          {negative.length} item{negative.length > 1 ? 's show' : ' shows'} stock below zero ({negative.map((p) => p.name).slice(0, 4).join(', ')}). Sold without stock on record — correct them with a stock count.
        </div>
      )}
      <div className="grid c2u">
        <Panel title="By product">
          <DataTable rows={prods} cols={cols} csvName="stock-value" defaultSort={{ key: 'vc', dir: -1 }} />
        </Panel>
        <Panel title="By category" sub="value at cost">
          <RankBars data={cats.filter((c) => c.stockCost > 0).sort((a, b) => b.stockCost - a.stockCost).map((c) => ({ label: c.name, value: c.stockCost, sub: `sells for ${rs(c.stockRetail)}` }))} color="var(--s3)" />
        </Panel>
      </div>
    </Page>
  );
}
