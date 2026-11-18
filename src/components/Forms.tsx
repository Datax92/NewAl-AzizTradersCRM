'use client';

import React, { useState } from 'react';
import { Save, Trash2, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Account, Party, Product, Expense } from '../lib/types';
import { ACCOUNTS, auditOp, buildExpense, buildPayment, margin, moveOp, newBarcode, balances } from '../lib/logic';
import { uid, rs, round2, ymd, pct } from '../lib/format';
import { Modal, Field, NumInput, Money, Seg } from './Shared';
import { BarcodeSVG } from './Barcode';
import type { Op } from '../lib/db';

/* ------------------------------ customer / supplier ------------------------------ */

export function PartyForm({ type, party, initialName, onSaved }: { type: 'customer' | 'supplier'; party?: Party; initialName?: string; onSaved?: (p: Party) => void }) {
  const { commit, closeModal, me, db, confirm } = useApp();
  const [f, setF] = useState<Party>(
    party || { id: uid(type === 'customer' ? 'c' : 'v'), type, name: initialName || '', phone: '', shop: '', city: '', address: '', opening: 0, creditLimit: type === 'customer' ? 0 : undefined, leadDays: type === 'supplier' ? 3 : undefined, notes: '', createdAt: new Date().toISOString() }
  );
  const [err, setErr] = useState('');
  const set = (k: keyof Party, v: any) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return setErr('Enter a name.');
    const dup = db.parties.find((p) => p.id !== f.id && p.type === type && p.phone && f.phone && p.phone.replace(/\D/g, '') === f.phone.replace(/\D/g, ''));
    if (dup && !(await confirm({ title: 'Same phone number', body: `${dup.name} already has this number. Save anyway?`, ok: 'Save anyway' }))) return;
    const d = { ...f, name: f.name.trim() };
    const ok = await commit([{ t: 'put', c: 'parties', d }, auditOp(me!.name, party ? `${type === 'customer' ? 'Customer' : 'Supplier'} edited` : `New ${type}`, d.name, 'info')], party ? 'Saved' : `${type === 'customer' ? 'Customer' : 'Supplier'} added`);
    if (ok) {
      closeModal();
      onSaved?.(d);
    }
  };
  const del = async () => {
    const bal = balances(db).get(f.id)?.balance || 0;
    const used = db.sales.some((s) => s.customerId === f.id) || db.purchases.some((p) => p.supplierId === f.id) || db.payments.some((p) => p.partyId === f.id);
    if (used || Math.abs(bal) > 0.5) {
      await confirm({ title: 'Cannot delete', body: `${f.name} has bills or payments in the khata${Math.abs(bal) > 0.5 ? ` and a balance of ${rs(bal)}` : ''}. Records with history are kept for the accounts.`, ok: 'OK' });
      return;
    }
    if (await confirm({ title: `Delete ${f.name}?`, danger: true, ok: 'Delete' })) {
      if (await commit([{ t: 'del', c: 'parties', id: f.id }, auditOp(me!.name, `${type} deleted`, f.name, 'bad')], 'Deleted')) closeModal();
    }
  };
  return (
    <Modal
      title={party ? `Edit ${party.name}` : type === 'customer' ? 'New customer' : 'New supplier'}
      sub={type === 'customer' ? 'Technicians and shops who buy on khata, or regular walk-ins.' : 'Who you buy stock from.'}
      foot={
        <>
          {party && (
            <button className="btn gh bad-t" onClick={del}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>Cancel</button>
          <button className="btn pri" onClick={save}>
            <Save size={15} /> Save
          </button>
        </>
      }
    >
      <div className="formgrid">
        <Field label="Name" error={err}>
          <input value={f.name} onChange={(e) => (set('name', e.target.value), setErr(''))} autoFocus />
        </Field>
        <Field label="Mobile / WhatsApp">
          <input value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="03xx-xxxxxxx" inputMode="tel" />
        </Field>
        <Field label={type === 'customer' ? 'Shop name' : 'Company'}>
          <input value={f.shop || ''} onChange={(e) => set('shop', e.target.value)} />
        </Field>
        <Field label="City / area">
          <input value={f.city || ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="Address" full>
          <input value={f.address || ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label={type === 'customer' ? 'Opening balance (they owe us)' : 'Opening balance (we owe them)'} hint="Old khata from your register, if any.">
          <NumInput value={f.opening} onChange={(n) => set('opening', n)} />
        </Field>
        {type === 'customer' ? (
          <Field label="Credit limit" hint="0 = no limit. You are warned before going over.">
            <NumInput value={f.creditLimit || 0} onChange={(n) => set('creditLimit', n)} min={0} />
          </Field>
        ) : (
          <Field label="Delivery time (days)" hint="Used to suggest when to reorder.">
            <NumInput value={f.leadDays ?? 3} onChange={(n) => set('leadDays', n)} min={0} />
          </Field>
        )}
        <Field label="Notes" full>
          <textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ product ------------------------------ */

export function ProductForm({ product, initialBarcode }: { product?: Product; initialBarcode?: string }) {
  const { db, commit, closeModal, me, can, settings, confirm } = useApp();
  const now = new Date().toISOString();
  const [f, setF] = useState<Product>(
    product || {
      id: uid('p'), name: '', barcode: initialBarcode || newBarcode(db), category: settings.categories[0] || '', brand: '', unit: 'pc',
      cost: 0, price: 0, wholesale: 0, minStock: 3, stock: 0, supplierId: '', shelf: '', warranty: '', notes: '', active: true, createdAt: now, updatedAt: now,
    }
  );
  const [opening, setOpening] = useState(0);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof Product, v: any) => setF((x) => ({ ...x, [k]: v }));
  const canPrice = can('prices') || !product;
  const showCost = can('cost.view');
  const m = margin(f);
  const suppliers = db.parties.filter((p) => p.type === 'supplier');

  const save = async (another = false) => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Enter the product name.';
    if (!f.barcode.trim()) e.barcode = 'A barcode is needed for scanning.';
    else if (db.products.some((p) => p.id !== f.id && p.barcode === f.barcode.trim())) e.barcode = 'Another product already uses this barcode.';
    if (f.price <= 0) e.price = 'Enter the selling price.';
    if (showCost && f.cost > f.price) e.price = 'Selling below cost — this item will make a loss.';
    setErr(e);
    if (e.name || e.barcode || (e.price && f.price <= 0)) return;
    if (e.price && !(await confirm({ title: 'Selling price is below cost', body: `Cost ${rs(f.cost)}, price ${rs(f.price)}. Every sale will lose ${rs(f.cost - f.price)}. Save anyway?`, ok: 'Save anyway', danger: true }))) return;
    const d: Product = { ...f, name: f.name.trim(), barcode: f.barcode.trim(), updatedAt: new Date().toISOString() };
    const ops: Op[] = [];
    if (!product) {
      d.stock = opening;
      ops.push({ t: 'put', c: 'products', d });
      if (opening) ops.push(moveOp({ ...d, stock: 0 }, 'opening', opening, d.cost, me!, undefined, 'Opening stock'));
      ops.push(auditOp(me!.name, 'Product added', `${d.name} · ${rs(d.price)}${opening ? ` · ${opening} ${d.unit} in stock` : ''}`, 'good'));
    } else {
      const { stock, ...rest } = d; // stock only changes through movements
      void stock;
      ops.push({ t: 'put', c: 'products', d: rest });
      const changes: string[] = [];
      if (product.price !== d.price) changes.push(`price ${rs(product.price)} → ${rs(d.price)}`);
      if (product.cost !== d.cost) changes.push(`cost ${rs(product.cost)} → ${rs(d.cost)}`);
      if (product.wholesale !== d.wholesale) changes.push(`wholesale ${rs(product.wholesale || 0)} → ${rs(d.wholesale || 0)}`);
      ops.push(auditOp(me!.name, 'Product edited', `${d.name}${changes.length ? ': ' + changes.join(', ') : ''}`, changes.length ? 'warn' : 'info'));
    }
    if (await commit(ops, product ? 'Product saved' : 'Product added')) {
      closeModal();
      if (another) setTimeout(() => (window.location.hash = '#/products/list?new=' + Date.now()), 0);
    }
  };

  return (
    <Modal
      size="wide"
      title={product ? `Edit ${product.name}` : 'Add product'}
      sub={product ? `Added ${new Date(product.createdAt).toLocaleDateString()} · stock changes go through Stock IN / OUT` : 'Fill in the details. Barcode is created for you, or scan the one on the box.'}
      foot={
        <>
          {product && (
            <label className="chk">
              <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Active (shown in POS)
            </label>
          )}
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>Cancel</button>
          {!product && <button className="btn" onClick={() => save(true)}>Save & add another</button>}
          <button className="btn pri" onClick={() => save()}>
            <Save size={15} /> Save
          </button>
        </>
      }
    >
      <div className="pform">
        <div>
          <div className="fieldset">
            <span className="kicker">Product</span>
            <div className="formgrid">
              <Field label="Product name" error={err.name} full>
                <input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="e.g. Quick 861DW Hot Air Station" />
              </Field>
              <Field label="Category">
                <select value={f.category} onChange={(e) => set('category', e.target.value)}>
                  {[...new Set([...settings.categories, f.category].filter(Boolean))].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Brand">
                <input value={f.brand || ''} onChange={(e) => set('brand', e.target.value)} list="brands" />
                <datalist id="brands">{[...new Set(db.products.map((p) => p.brand).filter(Boolean))].map((b) => <option key={b} value={b} />)}</datalist>
              </Field>
              <Field label="Unit">
                <select value={f.unit} onChange={(e) => set('unit', e.target.value)}>
                  {[...new Set([...settings.units, f.unit])].map((u) => <option key={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Warranty">
                <input value={f.warranty || ''} onChange={(e) => set('warranty', e.target.value)} placeholder="e.g. 6 months" />
              </Field>
            </div>
          </div>
          <div className="fieldset">
            <span className="kicker">Price</span>
            <div className="formgrid">
              {showCost && (
                <Field label="Purchase cost (per unit)" hint={product ? 'Average of what you paid. Updated by purchases.' : undefined}>
                  <NumInput value={f.cost} onChange={(n) => set('cost', n)} min={0} disabled={!canPrice} />
                </Field>
              )}
              <Field label="Selling price (retail)" error={err.price}>
                <NumInput value={f.price} onChange={(n) => set('price', n)} min={0} disabled={!canPrice} />
              </Field>
              <Field label="Wholesale price" hint="For technicians buying in bulk. 0 = same as retail.">
                <NumInput value={f.wholesale || 0} onChange={(n) => set('wholesale', n)} min={0} disabled={!canPrice} />
              </Field>
            </div>
            {showCost && f.price > 0 && (
              <div className={`marginbar ${f.price - f.cost >= 0 ? 'good' : 'bad'}`}>
                <span>Profit per unit</span>
                <b><Money v={f.price - f.cost} tone="pl" sign /></b>
                <span>Margin</span>
                <b className={m >= 15 ? 'good' : m >= 0 ? 'warn' : 'bad'}>{pct(m)}</b>
                {!!f.wholesale && (
                  <>
                    <span>Wholesale profit</span>
                    <b><Money v={f.wholesale - f.cost} tone="pl" sign /></b>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="fieldset">
            <span className="kicker">Stock</span>
            <div className="formgrid">
              {!product ? (
                <Field label="Opening stock" hint="How many you have right now.">
                  <NumInput value={opening} onChange={setOpening} min={0} />
                </Field>
              ) : (
                <Field label="In stock now" hint="Change it from Stock IN / OUT.">
                  <input value={`${f.stock} ${f.unit}`} readOnly />
                </Field>
              )}
              <Field label="Low-stock alert at" hint="Warn me when stock falls to this.">
                <NumInput value={f.minStock} onChange={(n) => set('minStock', n)} min={0} />
              </Field>
              <Field label="Shelf / location">
                <input value={f.shelf || ''} onChange={(e) => set('shelf', e.target.value)} placeholder="e.g. A-3" />
              </Field>
              <Field label="Main supplier">
                <select value={f.supplierId || ''} onChange={(e) => set('supplierId', e.target.value)}>
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Notes" full>
                <textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Specs, compatible models, etc." />
              </Field>
            </div>
          </div>
        </div>
        <aside className="pform-side">
          <span className="kicker">Barcode</span>
          <Field label="Barcode number" error={err.barcode} hint="Scan the box, or keep the one created.">
            <div className="inrow">
              <input value={f.barcode} onChange={(e) => set('barcode', e.target.value.trim())} />
              <button type="button" className="btn sm" title="Create a new code" onClick={() => set('barcode', newBarcode(db))}>
                <RefreshCw size={13} />
              </button>
            </div>
          </Field>
          <div className="bc-prev">
            <small>{settings.shopName}</small>
            <b>{f.name || 'Product name'}</b>
            <BarcodeSVG value={f.barcode || '0000'} height={44} module={1.2} />
            <strong>{rs(f.price)}</strong>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

/* ------------------------------ khata payment ------------------------------ */

export function PaymentForm({ party, dir: dir0, amount: amount0, purchaseId, note: note0 }: { party?: Party; dir?: 'in' | 'out'; amount?: number; purchaseId?: string; note?: string }) {
  const { db, commit, closeModal, me } = useApp();
  const [pid, setPid] = useState(party?.id || '');
  const p = db.parties.find((x) => x.id === pid);
  const bal = p ? balances(db).get(p.id)?.balance || 0 : 0;
  const normal = p?.type === 'supplier' ? 'out' : 'in';
  const [dir, setDir] = useState<'in' | 'out'>(dir0 || normal);
  const [amount, setAmount] = useState(amount0 ?? 0);
  const [method, setMethod] = useState<Account>('Cash');
  const [note, setNote] = useState(note0 || '');
  const [date, setDate] = useState(ymd());
  const [err, setErr] = useState('');
  const after = p ? round2(bal + ((p.type === 'customer') === (dir === 'in') ? -amount : amount)) : 0;
  const save = async () => {
    if (!p) return setErr('Choose the customer or supplier.');
    if (amount <= 0) return setErr('Enter the amount.');
    const when = date === ymd() ? new Date().toISOString() : new Date(date + 'T12:00:00').toISOString();
    if (await commit(buildPayment(me!, p, dir, amount, method, note, purchaseId, when), `${rs(amount)} ${dir === 'in' ? 'received from' : 'paid to'} ${p.name}`)) closeModal();
  };
  return (
    <Modal
      size="sm"
      title={p ? (p.type === 'customer' ? (dir === 'in' ? 'Receive payment' : 'Pay back customer') : dir === 'out' ? 'Pay supplier' : 'Refund from supplier') : 'Khata payment'}
      sub={p ? `${p.name}${p.phone ? ' · ' + p.phone : ''}` : undefined}
      foot={
        <>
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>Cancel</button>
          <button className={'btn pri'} onClick={save}>
            <Save size={15} /> {dir === 'in' ? 'Receive' : 'Pay'} {amount > 0 ? rs(amount) : ''}
          </button>
        </>
      }
    >
      {!party && (
        <Field label="Customer or supplier">
          <select value={pid} onChange={(e) => (setPid(e.target.value), setDir(db.parties.find((x) => x.id === e.target.value)?.type === 'supplier' ? 'out' : 'in'))} autoFocus>
            <option value="">Choose…</option>
            <optgroup label="Customers">
              {db.parties.filter((x) => x.type === 'customer').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
            <optgroup label="Suppliers">
              {db.parties.filter((x) => x.type === 'supplier').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </optgroup>
          </select>
        </Field>
      )}
      {p && (
        <>
          <div className={`balbox ${bal > 0 ? (p.type === 'customer' ? 'info' : 'warn') : 'good'}`}>
            <span>{p.type === 'customer' ? (bal >= 0 ? 'Customer owes' : 'We owe customer (advance)') : bal >= 0 ? 'We owe supplier' : 'Supplier owes us'}</span>
            <b>{rs(Math.abs(bal))}</b>
            {bal > 0 && (
              <button className="btn sm" onClick={() => setAmount(bal)}>
                Full amount
              </button>
            )}
          </div>
          <div className="formgrid" style={{ marginTop: 14 }}>
            <Field label="Type" full>
              <Seg
                value={dir}
                onChange={setDir}
                options={
                  p.type === 'customer'
                    ? [{ v: 'in', label: 'Money received', tone: 'g' }, { v: 'out', label: 'Money given back' }]
                    : [{ v: 'out', label: 'Money paid', tone: 'r' }, { v: 'in', label: 'Refund received' }]
                }
              />
            </Field>
            <Field label="Amount" error={err}>
              <NumInput value={amount} onChange={(n) => (setAmount(n), setErr(''))} min={0} autoFocus={!!party} placeholder="0" />
            </Field>
            <Field label="Paid by">
              <select value={method} onChange={(e) => setMethod(e.target.value as Account)}>
                {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" value={date} max={ymd()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Note">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cheque no., reference…" />
            </Field>
          </div>
          {amount > 0 && (
            <div className="calcbox">
              <div className="row">
                Balance now <b>{rs(bal)}</b>
              </div>
              <div className="row">
                This payment <b className={after < bal ? 'good' : 'bad'}>{after < bal ? '−' : '+'}{rs(amount)}</b>
              </div>
              <div className="row tot">
                Balance after <b className={after > 0 ? (p.type === 'customer' ? 'info' : 'warn') : 'good'}>{rs(after)}</b>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------ expense ------------------------------ */

export function ExpenseForm({ expense }: { expense?: Expense }) {
  const { commit, closeModal, me, settings, confirm } = useApp();
  const [category, setCategory] = useState(expense?.category || settings.expenseCategories[0]);
  const [amount, setAmount] = useState(expense?.amount || 0);
  const [method, setMethod] = useState<Account>(expense?.method || 'Cash');
  const [payee, setPayee] = useState(expense?.payee || '');
  const [note, setNote] = useState(expense?.note || '');
  const [date, setDate] = useState(expense ? ymd(expense.date) : ymd());
  const [err, setErr] = useState('');
  const save = async () => {
    if (amount <= 0) return setErr('Enter the amount.');
    const when = date === ymd() && !expense ? new Date().toISOString() : new Date(date + 'T12:00:00').toISOString();
    const ops: Op[] = expense
      ? [{ t: 'put', c: 'expenses', d: { ...expense, category, amount: round2(amount), method, payee, note, date: when } }, auditOp(me!.name, 'Expense edited', `${category}: ${rs(expense.amount)} → ${rs(amount)}`, 'warn')]
      : buildExpense(me!, { date: when, category, amount, method, payee, note });
    if (await commit(ops, expense ? 'Expense saved' : `${rs(amount)} expense recorded`)) closeModal();
  };
  const del = async () => {
    if (!expense) return;
    if (await confirm({ title: 'Delete this expense?', body: `${expense.category} · ${rs(expense.amount)}`, danger: true, ok: 'Delete' }))
      if (await commit([{ t: 'del', c: 'expenses', id: expense.id }, auditOp(me!.name, 'Expense deleted', `${expense.category}: ${rs(expense.amount)}`, 'bad')], 'Deleted')) closeModal();
  };
  return (
    <Modal
      size="sm"
      title={expense ? 'Edit expense' : 'New expense'}
      sub="Money spent to run the shop. It is taken off profit."
      foot={
        <>
          {expense && (
            <button className="btn gh bad-t" onClick={del}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>Cancel</button>
          <button className="btn pri" onClick={save}>
            <Save size={15} /> Save {amount > 0 ? rs(amount) : ''}
          </button>
        </>
      }
    >
      <div className="formgrid">
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {[...new Set([...settings.expenseCategories, category])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Amount" error={err}>
          <NumInput value={amount} onChange={(n) => (setAmount(n), setErr(''))} min={0} autoFocus placeholder="0" />
        </Field>
        <Field label="Paid from">
          <select value={method} onChange={(e) => setMethod(e.target.value as Account)}>
            {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={date} max={ymd()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid to" full>
          <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. IESCO, landlord, staff name" />
        </Field>
        <Field label="Note" full>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
