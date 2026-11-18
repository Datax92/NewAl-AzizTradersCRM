'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, PackageCheck, HandCoins, MessageCircle, Ban, Save, ShoppingBag, Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, DataTable, Money, Tag, Kpi, Picker, Field, NumInput, Modal, Empty, StockQty, type Col } from '../Shared';
import { PartyForm, PaymentForm } from '../Forms';
import type { Account, Purchase, PurchaseItem } from '../../lib/types';
import { shopContactText, ACCOUNTS, auditOp, buildPayment, buildReceive, nextNo, purchasePaid, purchaseReceivedValue, reorderSuggestions, balances, type Suggestion } from '../../lib/logic';
import { dFull, dShort, inRange, num, rs, round2, uid, waLink, daysAgo } from '../../lib/format';
import type { Op } from '../../lib/db';

export function PurchasesPage() {
  return useTab() === 'suggest' ? <Suggest /> : <Orders />;
}

const STATUS: Record<Purchase['status'], { t: string; tone: 'warn' | 'info' | 'good' | 'mute' }> = {
  ordered: { t: 'Ordered', tone: 'warn' }, partial: { t: 'Partly received', tone: 'info' }, received: { t: 'Received', tone: 'good' }, cancelled: { t: 'Cancelled', tone: 'mute' },
};

function payState(db: any, p: Purchase) {
  const v = purchaseReceivedValue(p);
  const paid = purchasePaid(db, p);
  if (p.status === 'cancelled') return { paid, due: 0, tag: <Tag>—</Tag> };
  const due = round2(v - paid);
  return { paid, due, tag: v === 0 ? <Tag tone="mute">Nothing received</Tag> : due <= 0.5 ? <Tag tone="good">Paid</Tag> : paid > 0 ? <Tag tone="warn">Part paid</Tag> : <Tag tone="bad">Unpaid</Tag> };
}

function Orders() {
  const { db, range, openModal, params } = useApp();
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (params.get('new')) openModal(<PurchaseForm />);
  }, [params.get('new')]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(
    () => db.purchases.filter((p) => (inRange(p.date, range) || p.status === 'ordered' || p.status === 'partial') && (!status || p.status === status)).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [db.purchases, range, status]
  );
  const open = db.purchases.filter((p) => p.status === 'ordered' || p.status === 'partial');
  const onOrderValue = open.reduce((a, p) => a + p.items.reduce((b, i) => b + (i.qty - i.received) * i.cost, 0), 0);
  const receivedPeriod = db.purchases.filter((p) => p.receivedAt && inRange(p.receivedAt, range)).reduce((a, p) => a + purchaseReceivedValue(p), 0);
  const bal = balances(db);
  const payable = db.parties.filter((x) => x.type === 'supplier').reduce((a, x) => a + Math.max(0, bal.get(x.id)?.balance || 0), 0);

  const cols: Col<Purchase>[] = [
    { key: 'no', label: 'Order', render: (p) => <b className="mono">{p.no}</b> },
    { key: 'date', label: 'Date', get: (p) => p.date, render: (p) => dShort(p.date) },
    { key: 'supplier', label: 'Supplier', get: (p) => p.supplierName },
    { key: 'items', label: 'Items', r: true, get: (p) => p.items.length, render: (p) => `${p.items.length} (${num(p.items.reduce((a, i) => a + i.qty, 0))} units)` },
    { key: 'total', label: 'Order value', r: true, get: (p) => p.total, render: (p) => rs(p.total) },
    { key: 'recv', label: 'Received', r: true, get: (p) => purchaseReceivedValue(p), render: (p) => rs(purchaseReceivedValue(p)), total: (r) => <Money v={r.reduce((a, p) => a + purchaseReceivedValue(p), 0)} /> },
    { key: 'paid', label: 'Paid', r: true, get: (p) => purchasePaid(db, p), render: (p) => <span className="good">{rs(purchasePaid(db, p))}</span> },
    { key: 'due', label: 'Still to pay', r: true, get: (p) => payState(db, p).due, render: (p) => { const d = payState(db, p).due; return d > 0.5 ? <b className="bad">{rs(d)}</b> : <span className="muted">—</span>; } },
    { key: 'status', label: 'Goods', get: (p) => STATUS[p.status].t, render: (p) => <Tag tone={STATUS[p.status].tone}>{STATUS[p.status].t}</Tag> },
    { key: 'pay', label: 'Payment', csv: false, render: (p) => payState(db, p).tag },
  ];
  return (
    <Page search exportable title="Purchase register" urdu="خرید رجسٹر" sub="Buying stock from suppliers. Receiving goods adds them to stock and to the supplier’s khata; paying reduces it." period actions={<button className="btn pri" onClick={() => openModal(<PurchaseForm />)}><Plus size={15} /> New purchase</button>}>
      <div className="kpis">
        <Kpi label="Open orders" value={open.length} money={false} tone={open.length ? 'warn' : undefined} color="var(--warn)" onClick={() => setStatus('ordered')} />
        <Kpi label="Goods on the way" value={onOrderValue} color="var(--s2)" />
        <Kpi label="Received in period" value={receivedPeriod} color="var(--good)" />
        <Kpi label="We owe suppliers" value={payable} tone={payable ? 'bad' : undefined} color="var(--bad)" />
      </div>
      <div className="panel">
        <div className="panel-b">
          <DataTable
            rows={rows}
            cols={cols}
            csvName="purchases"
            onRow={(p) => openModal(<PurchaseView id={p.id} />)}
            filters={
              <select className="fldsel" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Any status</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
              </select>
            }
            empty={<Empty title="No purchases in this period" icon={<Truck size={34} />}>Press <b>New purchase</b> when you buy stock.</Empty>}
          />
        </div>
      </div>
    </Page>
  );
}

export function PurchaseForm({ prefill, supplierId: sup0 }: { prefill?: PurchaseItem[]; supplierId?: string }) {
  const { db, me, commit, closeModal, openModal } = useApp();
  const suppliers = db.parties.filter((p) => p.type === 'supplier');
  const [supplierId, setSupplierId] = useState(sup0 || '');
  const [items, setItems] = useState<PurchaseItem[]>(prefill || []);
  const [receiveNow, setReceiveNow] = useState(!prefill);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState<Account>('Cash');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const supplier = suppliers.find((s) => s.id === supplierId);
  const total = round2(items.reduce((a, i) => a + i.qty * i.cost, 0));
  const add = (pid?: string) => {
    const p = db.products.find((x) => x.id === pid);
    if (!p) return;
    setItems((it) => (it.some((i) => i.productId === p.id) ? it.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)) : [...it, { productId: p.id, name: p.name, qty: Math.max(1, p.minStock * 2 - p.stock), cost: p.cost, received: 0 }]));
  };
  const save = async () => {
    if (!supplier) return setErr('Choose the supplier.');
    if (!items.length || items.some((i) => i.qty <= 0)) return setErr('Add at least one item with a quantity.');
    if (paid > total + 0.5 && receiveNow) return setErr('Paid is more than the bill.');
    const po: Purchase = { id: uid('po'), no: nextNo(db.purchases, 'PO-', 4), date: new Date().toISOString(), supplierId: supplier.id, supplierName: supplier.name, items: items.map((i) => ({ ...i, received: 0 })), total, status: 'ordered', ref: ref || undefined, note: note || undefined, userName: me!.name };
    let ops: Op[] = [{ t: 'put', c: 'purchases', d: po }, auditOp(me!.name, 'Purchase order', `${po.no} to ${supplier.name}: ${rs(total)}`, 'info')];
    if (receiveNow) ops = [...ops, ...buildReceive({ ...db, purchases: [...db.purchases, po] }, me!, po, Object.fromEntries(items.map((i) => [i.productId, i.qty])))];
    if (paid > 0) ops = [...ops, ...buildPayment(me!, supplier, 'out', paid, method, `Against ${po.no}`, po.id)];
    if (await commit(ops, receiveNow ? `${po.no} saved — ${items.length} items added to stock` : `${po.no} saved as an order`)) closeModal();
  };
  return (
    <Modal
      size="xl"
      title="New purchase"
      sub="Buying from a supplier. Tick “received” if the goods are already in the shop."
      foot={
        <>
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>Cancel</button>
          <button className="btn pri" onClick={save}><Save size={15} /> Save {total > 0 ? rs(total) : ''}</button>
        </>
      }
    >
      <div className="formgrid">
        <Field label="Supplier" error={err && !supplier ? err : undefined}>
          <Picker items={suppliers} value={supplierId} onPick={(s) => setSupplierId(s?.id || '')} label={(s) => s.name} sub={(s) => s.city} onCreate={(n) => openModal(<PartyForm type="supplier" initialName={n} onSaved={(p) => setSupplierId(p.id)} />)} createLabel="New supplier" />
        </Field>
        <Field label="Supplier’s bill no.">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="optional" />
        </Field>
        <Field label="Add item (scan or type)" full>
          <Picker items={db.products.filter((p) => p.active)} onPick={(p) => add(p?.id)} label={(p) => p.name} sub={(p) => `${num(p.stock)} in stock · cost ${rs(p.cost)}`} placeholder="Scan barcode or type product…" />
        </Field>
      </div>
      {items.length > 0 && (
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead><tr><th>Item</th><th className="r">In stock</th><th className="r">Qty</th><th className="r">Cost / unit</th><th className="r">Amount</th><th /></tr></thead>
          <tbody>
            {items.map((i, k) => {
              const p = db.products.find((x) => x.id === i.productId);
              const up = p && i.cost > p.cost * 1.001;
              return (
                <tr key={i.productId}>
                  <td>{i.name}</td>
                  <td className="r">{p ? <StockQty p={p} /> : '—'}</td>
                  <td className="r"><span className="qtybox sm"><NumInput value={i.qty} onChange={(n) => setItems((it) => it.map((x, j) => (j === k ? { ...x, qty: Math.max(0, n) } : x)))} min={0} /></span></td>
                  <td className="r">
                    <span className="qtybox sm wide"><NumInput value={i.cost} onChange={(n) => setItems((it) => it.map((x, j) => (j === k ? { ...x, cost: Math.max(0, n) } : x)))} min={0} /></span>
                    {p && Math.abs(i.cost - p.cost) > 0.5 && <small className={up ? 'bad' : 'good'}> {up ? '▲' : '▼'} was {rs(p.cost)}</small>}
                  </td>
                  <td className="r"><b>{rs(i.qty * i.cost)}</b></td>
                  <td><button className="iconbtn" onClick={() => setItems((it) => it.filter((_, j) => j !== k))} aria-label="Remove"><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={4}>Total</td><td className="r">{rs(total)}</td><td /></tr></tfoot>
        </table>
      )}
      <div className="formgrid" style={{ marginTop: 14 }}>
        <label className="chk full">
          <input type="checkbox" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} /> Goods received now — add them to stock straight away
        </label>
        <Field label="Paid now" hint={supplier ? `Rest goes on ${supplier.name}’s khata` : undefined}>
          <NumInput value={paid} onChange={setPaid} min={0} placeholder="0" />
        </Field>
        <Field label="Paid from">
          <select value={method} onChange={(e) => setMethod(e.target.value as Account)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {err && supplier && <div className="note bad">{err}</div>}
      {total > 0 && (
        <div className="calcbox">
          <div className="row">Purchase total <b>{rs(total)}</b></div>
          <div className="row">Paid now <b className="good">−{rs(paid)}</b></div>
          <div className="row tot">Added to supplier khata <b className={total - paid > 0 ? 'bad' : 'good'}>{rs(Math.max(0, total - paid))}</b></div>
        </div>
      )}
    </Modal>
  );
}

function PurchaseView({ id }: { id: string }) {
  const { db, me, commit, closeModal, openModal, confirm, settings } = useApp();
  const po = db.purchases.find((p) => p.id === id);
  const [recv, setRecv] = useState<Record<string, number>>({});
  if (!po) return null;
  const sup = db.parties.find((x) => x.id === po.supplierId);
  const ps = payState(db, po);
  const open = po.status === 'ordered' || po.status === 'partial';
  const orderText = [`*Purchase order ${po.no}* from ${settings.shopName}`, dShort(po.date), '', ...po.items.map((i) => `• ${i.name} — ${i.qty - i.received} pcs`), '', `Please confirm price and delivery. ${shopContactText(settings)}`].join('\n');
  const receive = async () => {
    const q = Object.fromEntries(po.items.map((i) => [i.productId, recv[i.productId] ?? i.qty - i.received]));
    const ops = buildReceive(db, me!, po, q);
    if (!ops.length) return;
    if (await commit(ops, 'Goods received — stock updated')) setRecv({});
  };
  const cancel = async () => {
    if (await confirm({ title: `Cancel ${po.no}?`, body: 'Nothing has been received on this order. It will be kept, marked cancelled.', danger: true, ok: 'Cancel order' }))
      commit([{ t: 'put', c: 'purchases', d: { ...po, status: 'cancelled' } }, auditOp(me!.name, 'Purchase cancelled', po.no, 'bad')], 'Order cancelled');
  };
  return (
    <Modal
      size="wide"
      title={<>{po.no} <Tag tone={STATUS[po.status].tone}>{STATUS[po.status].t}</Tag> {ps.tag}</>}
      sub={`${po.supplierName} · ordered ${dFull(po.date)} (${daysAgo(po.date)} days ago) by ${po.userName}${po.ref ? ' · supplier bill ' + po.ref : ''}`}
      foot={
        <>
          {po.status === 'ordered' && <button className="btn gh bad-t" onClick={cancel}><Ban size={15} /> Cancel order</button>}
          {sup?.phone && open && <a className="btn wa" href={waLink(sup.phone, orderText)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Send order on WhatsApp</a>}
          <span className="spacer" />
          {ps.due > 0.5 && sup && <button className="btn" onClick={() => openModal(<PaymentForm party={sup} dir="out" amount={ps.due} purchaseId={po.id} note={`Against ${po.no}`} />)}><HandCoins size={15} /> Pay {rs(ps.due)}</button>}
          {open && <button className="btn pri" onClick={receive}><PackageCheck size={15} /> Receive goods</button>}
        </>
      }
    >
      <table className="tbl">
        <thead><tr><th>Item</th><th className="r">Ordered</th><th className="r">Received</th><th className="r">Cost</th><th className="r">Value received</th>{open && <th className="r">Receiving now</th>}</tr></thead>
        <tbody>
          {po.items.map((i) => {
            const left = i.qty - i.received;
            return (
              <tr key={i.productId}>
                <td>{i.name}</td>
                <td className="r">{num(i.qty)}</td>
                <td className="r">{i.received >= i.qty ? <Tag tone="good">{num(i.received)} ✓</Tag> : i.received > 0 ? <Tag tone="info">{num(i.received)}</Tag> : <span className="muted">0</span>}</td>
                <td className="r">{rs(i.cost)}</td>
                <td className="r">{rs(i.received * i.cost)}</td>
                {open && <td className="r">{left > 0 ? <span className="qtybox sm"><NumInput value={recv[i.productId] ?? left} onChange={(n) => setRecv((r) => ({ ...r, [i.productId]: Math.max(0, Math.min(left, n)) }))} min={0} max={left} /></span> : '—'}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="calcbox">
        <div className="row">Order value <b>{rs(po.total)}</b></div>
        <div className="row">Goods received <b>{rs(purchaseReceivedValue(po))}</b></div>
        <div className="row">Paid <b className="good">{rs(ps.paid)}</b></div>
        <div className="row tot">Still to pay <b className={ps.due > 0.5 ? 'bad' : 'good'}>{rs(Math.max(0, ps.due))}</b></div>
      </div>
      {po.note && <p className="muted">{po.note}</p>}
    </Modal>
  );
}

function Suggest() {
  const { db, me, commit, go } = useApp();
  const list = useMemo(() => reorderSuggestions(db), [db]);
  const [pick, setPick] = useState<Record<string, number>>({});
  useEffect(() => {
    setPick(Object.fromEntries(list.filter((s) => s.urgency !== 'plan').map((s) => [s.product.id, s.suggest])));
  }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = list.filter((s) => (pick[s.product.id] || 0) > 0);
  const bySup = new Map<string, Suggestion[]>();
  chosen.forEach((s) => {
    const k = s.supplier?.id || '';
    bySup.set(k, [...(bySup.get(k) || []), s]);
  });
  const total = chosen.reduce((a, s) => a + s.product.cost * pick[s.product.id], 0);
  const create = async () => {
    const ops: Op[] = [];
    const made: string[] = [];
    let purchases = [...db.purchases];
    bySup.forEach((items, supId) => {
      const sup = db.parties.find((p) => p.id === supId);
      if (!sup) return;
      const po: Purchase = { id: uid('po'), no: nextNo(purchases, 'PO-', 4), date: new Date().toISOString(), supplierId: sup.id, supplierName: sup.name, items: items.map((s) => ({ productId: s.product.id, name: s.product.name, qty: pick[s.product.id], cost: s.product.cost, received: 0 })), total: items.reduce((a, s) => a + s.product.cost * pick[s.product.id], 0), status: 'ordered', userName: me!.name, note: 'Made from purchase suggestions' };
      purchases = [...purchases, po];
      made.push(po.no);
      ops.push({ t: 'put', c: 'purchases', d: po });
    });
    if (!ops.length) return;
    ops.push(auditOp(me!.name, 'Orders from suggestions', made.join(', '), 'info'));
    if (await commit(ops, `${made.length} purchase order${made.length > 1 ? 's' : ''} created: ${made.join(', ')}`)) go('purchases/orders');
  };
  const noSup = bySup.get('') || [];
  return (
    <Page
      title="What to buy" urdu="کیا خریدنا ہے"
      sub="Worked out from the last 30 days of sales, what is in stock, what is already on order, and each supplier’s delivery time — enough for two weeks after delivery."
      actions={<button className="btn pri" disabled={!chosen.length || noSup.length === chosen.length} onClick={create}><ShoppingBag size={15} /> Create {bySup.size - (noSup.length ? 1 : 0) || ''} order{bySup.size > 1 ? 's' : ''} · {rs(total)}</button>}
    >
      <div className="kpis">
        <Kpi label="Buy now" value={list.filter((s) => s.urgency === 'now').length} money={false} tone="bad" color="var(--bad)" foot={<span className="vs">out, or runs out before delivery</span>} />
        <Kpi label="Buy soon" value={list.filter((s) => s.urgency === 'soon').length} money={false} tone="warn" color="var(--warn)" />
        <Kpi label="Plan ahead" value={list.filter((s) => s.urgency === 'plan').length} money={false} color="var(--ink-3)" />
        <Kpi label="Selected order value" value={total} color="var(--s2)" />
      </div>
      {noSup.length > 0 && <div className="note" style={{ marginBottom: 12 }}>{noSup.length} selected item{noSup.length > 1 ? 's have' : ' has'} no main supplier set — set one in Products to include {noSup.length > 1 ? 'them' : 'it'}.</div>}
      {!list.length ? (
        <Empty title="Nothing to buy right now" icon={<PackageCheck size={34} />}>Every product has enough stock for its sales speed.</Empty>
      ) : (
        <div className="panel">
          <div className="tblwrap">
            <table className="tbl">
              <thead><tr><th /><th>Product</th><th>Supplier</th><th className="r">In stock</th><th className="r">On order</th><th className="r">Sells / day</th><th className="r">Lasts</th><th>Need</th><th className="r">Buy qty</th><th className="r">Cost</th></tr></thead>
              <tbody>
                {list.map((s) => {
                  const on = (pick[s.product.id] || 0) > 0;
                  return (
                    <tr key={s.product.id} className={on ? 'sel' : 'dim'}>
                      <td><input type="checkbox" checked={on} onChange={(e) => setPick((p) => ({ ...p, [s.product.id]: e.target.checked ? s.suggest : 0 }))} /></td>
                      <td><b>{s.product.name}</b></td>
                      <td>{s.supplier?.name || <span className="muted">not set</span>} <small className="muted">{s.lead}d</small></td>
                      <td className="r"><StockQty p={s.product} /></td>
                      <td className="r">{s.onOrder || <span className="muted">—</span>}</td>
                      <td className="r">{s.perDay ? s.perDay.toFixed(1) : <span className="muted">0</span>}</td>
                      <td className="r">{isFinite(s.daysLeft) ? <span className={s.daysLeft <= s.lead ? 'bad' : 'warn'}>{Math.floor(s.daysLeft)} days</span> : <span className="muted">—</span>}</td>
                      <td><Tag tone={s.urgency === 'now' ? 'bad' : s.urgency === 'soon' ? 'warn' : 'mute'}>{s.urgency === 'now' ? 'Buy now' : s.urgency === 'soon' ? 'Soon' : 'Plan'}</Tag></td>
                      <td className="r"><span className="qtybox sm"><NumInput value={pick[s.product.id] || 0} onChange={(n) => setPick((p) => ({ ...p, [s.product.id]: Math.max(0, Math.floor(n)) }))} min={0} /></span></td>
                      <td className="r">{on ? rs(s.product.cost * pick[s.product.id]) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {bySup.size > 0 && (
        <div className="grid c3" style={{ marginTop: 16 }}>
          {[...bySup.entries()].filter(([k]) => k).map(([k, items]) => (
            <Panel key={k} title={items[0].supplier?.name} sub={`${items.length} item${items.length > 1 ? 's' : ''} · delivery ${items[0].lead} days`} tight>
              <div className="mini">
                {items.map((s) => (
                  <div key={s.product.id} className="mini-r">
                    <span><b>{s.product.name}</b></span>
                    <span className="mini-v">{pick[s.product.id]} × {rs(s.product.cost)}</span>
                  </div>
                ))}
              </div>
              <div className="panel-tot">Order total <Money v={items.reduce((a, s) => a + s.product.cost * pick[s.product.id], 0)} /></div>
            </Panel>
          ))}
        </div>
      )}
    </Page>
  );
}
