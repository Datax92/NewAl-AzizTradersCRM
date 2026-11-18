'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanBarcode, Plus, Minus, Trash2, Pause, UserRound, X, CircleCheck, TriangleAlert, Play, Percent, PackageX, Keyboard } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import type { PayMethod, Product, Held } from '../../lib/types';
import { buildSale, stockState, METHODS, balances, lineNet, type CartLine } from '../../lib/logic';
import { rs, num, uid, round2, dFull, relDay } from '../../lib/format';
import { Page, Picker, NumInput, Empty, METHOD_CLS, Tag, Seg } from '../Shared';
import { ReceiptModal } from '../Receipt';
import { PartyForm, ProductForm } from '../Forms';
import type { Op } from '../../lib/db';

interface Cart {
  lines: CartLine[];
  customerId?: string;
  walkName: string;
  walkPhone: string;
  priceType: 'retail' | 'wholesale';
  discMode: 'rs' | 'pct';
  discVal: number;
  method: PayMethod | 'Split';
  split: Partial<Record<PayMethod, number>>;
  cashGiven: number;
  note: string;
}

const EMPTY: Cart = { lines: [], walkName: '', walkPhone: '', priceType: 'retail', discMode: 'rs', discVal: 0, method: 'Cash', split: {}, cashGiven: 0, note: '' };

export function PosPage() {
  const tab = useTab();
  return tab === 'held' ? <HeldBills /> : <Billing />;
}

function Billing() {
  const { db, me, can, settings, commit, openModal, toast, confirm, params, go } = useApp();
  const KEY = 'mts-cart-' + me!.counter;
  const [cart, setCart] = useState<Cart>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setCart({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, [KEY]);
  useEffect(() => {
    if (loaded) sessionStorage.setItem(KEY, JSON.stringify(cart));
  }, [cart, loaded, KEY]);

  // Resume a held bill passed in the address (#/pos/new?resume=ID)
  useEffect(() => {
    const id = params.get('resume');
    if (!id) return;
    const h = db.held.find((x) => x.id === id);
    if (h) {
      setCart({ ...EMPTY, ...h.cart });
      commit([{ t: 'del', c: 'held', id }]);
      toast('Held bill resumed', 'info');
    }
    go('pos/new');
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const [discAt, setDiscAt] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const searchRef = useRef<HTMLInputElement>(null);
  const pm = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const customers = useMemo(() => db.parties.filter((p) => p.type === 'customer'), [db.parties]);
  const customer = customers.find((c) => c.id === cart.customerId);
  const bal = useMemo(() => (customer ? balances(db).get(customer.id) : undefined), [db, customer]);

  /* ---- top sellers for the quick grid ---- */
  const popular = useMemo(() => {
    const m = new Map<string, number>();
    db.sales.slice(-400).forEach((s) => s.items.forEach((i) => m.set(i.productId, (m.get(i.productId) || 0) + 1)));
    return m;
  }, [db.sales]);
  const cats = useMemo(() => ['All', 'Top sellers', ...settings.categories.filter((c) => db.products.some((p) => p.category === c && p.active))], [settings.categories, db.products]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    let ps = db.products.filter((p) => p.active);
    if (t) ps = ps.filter((p) => p.name.toLowerCase().includes(t) || p.barcode.includes(t) || (p.brand || '').toLowerCase().includes(t) || (p.shelf || '').toLowerCase() === t);
    else if (cat === 'Top sellers') ps = ps.filter((p) => popular.has(p.id)).sort((a, b) => (popular.get(b.id) || 0) - (popular.get(a.id) || 0)).slice(0, 24);
    else if (cat !== 'All') ps = ps.filter((p) => p.category === cat);
    if (!t && cat === 'All') ps = [...ps].sort((a, b) => (popular.get(b.id) || 0) - (popular.get(a.id) || 0));
    return ps.slice(0, 60);
  }, [db.products, q, cat, popular]);

  /* ---- cart maths ---- */
  const priceFor = useCallback((p: Product, type: Cart['priceType']) => (type === 'wholesale' && p.wholesale ? p.wholesale : p.price), []);
  const gross = round2(cart.lines.reduce((a, l) => a + l.price * l.qty, 0));
  const lineDisc = round2(cart.lines.reduce((a, l) => a + (l.disc || 0), 0));
  const subtotal = round2(gross - lineDisc);
  const billDisc = round2(Math.min(subtotal, cart.discMode === 'pct' ? (subtotal * cart.discVal) / 100 : cart.discVal));
  const total = round2(subtotal - billDisc);
  const listGross = round2(cart.lines.reduce((a, l) => a + (pm.get(l.productId)?.price || l.price) * l.qty, 0));
  const discPct = listGross ? ((listGross - total) / listGross) * 100 : 0;
  const manualDiscPct = gross ? ((lineDisc + billDisc) / gross) * 100 : 0;
  const overLimit = !can('bigDiscount') && manualDiscPct > settings.cashierDiscountLimit + 0.001;
  const items = cart.lines.reduce((a, l) => a + l.qty, 0);
  const profit = round2(cart.lines.reduce((a, l) => a + (lineNet(l as any) - (pm.get(l.productId)?.cost || 0) * l.qty), 0) - billDisc);

  const payments = useMemo(() => {
    if (cart.method !== 'Split') return total > 0 ? [{ method: cart.method, amount: total }] : [];
    const paid = (['Cash', 'Bank', 'JazzCash', 'Easypaisa'] as PayMethod[]).map((m) => ({ method: m, amount: round2(cart.split[m] || 0) })).filter((p) => p.amount > 0);
    const sum = paid.reduce((a, p) => a + p.amount, 0);
    const rest = round2(total - sum);
    return rest > 0 ? [...paid, { method: 'Khata' as PayMethod, amount: rest }] : paid;
  }, [cart.method, cart.split, total]);
  const paidSum = payments.reduce((a, p) => a + p.amount, 0);
  const onKhata = payments.filter((p) => p.method === 'Khata').reduce((a, p) => a + p.amount, 0);
  const cashPart = payments.filter((p) => p.method === 'Cash').reduce((a, p) => a + p.amount, 0);
  const change = cart.cashGiven > cashPart && cashPart > 0 ? round2(cart.cashGiven - cashPart) : 0;

  const add = useCallback(
    (p: Product, qty = 1) => {
      setCart((c) => {
        const i = c.lines.findIndex((l) => l.productId === p.id);
        if (i >= 0) {
          const lines = [...c.lines];
          lines[i] = { ...lines[i], qty: lines[i].qty + qty };
          return { ...c, lines: [lines[i], ...lines.filter((_, k) => k !== i)] };
        }
        return { ...c, lines: [{ productId: p.id, qty, price: priceFor(p, c.priceType), disc: 0 }, ...c.lines] };
      });
      if (p.stock - qty < 0) toast(`${p.name}: only ${Math.max(0, p.stock)} in stock`, 'warn');
    },
    [priceFor, toast]
  );

  const scan = useCallback(
    (code: string) => {
      const c = code.trim();
      if (!c) return false;
      const p = db.products.find((x) => x.barcode === c);
      if (p) {
        if (!p.active) toast(`${p.name} is switched off in Products`, 'warn');
        else add(p);
        return true;
      }
      return false;
    },
    [db.products, add, toast]
  );

  const onSearchEnter = () => {
    if (scan(q)) return setQ('');
    if (list.length === 1) {
      add(list[0]);
      return setQ('');
    }
    if (/^\d{6,}$/.test(q.trim())) {
      if (can('products.edit')) {
        confirm({ title: 'Barcode not found', body: `No product has barcode ${q}. Add it as a new product now?`, ok: 'Add product' }).then((ok) => ok && openModal(<ProductForm initialBarcode={q.trim()} />));
      } else toast(`No product with barcode ${q}`, 'bad');
      setQ('');
    }
  };

  /* ---- a scanner typing while focus is elsewhere still adds the item ---- */
  useEffect(() => {
    let buf = '';
    let last = 0;
    const k = (e: KeyboardEvent) => {
      if (document.querySelector('.overlay')) return;
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        document.getElementById('pos-complete')?.click();
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const now = Date.now();
      if (now - last > 60) buf = '';
      last = now;
      if (e.key === 'Enter') {
        if (buf.length >= 4 && !scan(buf)) toast(`Barcode ${buf} not found`, 'bad');
        buf = '';
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [scan, toast]);

  const setLine = (i: number, patch: Partial<CartLine>) => setCart((c) => ({ ...c, lines: c.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));
  const removeLine = (i: number) => setCart((c) => ({ ...c, lines: c.lines.filter((_, k) => k !== i) }));
  const setPriceType = (t: Cart['priceType']) =>
    setCart((c) => ({ ...c, priceType: t, lines: c.lines.map((l) => ({ ...l, price: pm.get(l.productId) ? priceFor(pm.get(l.productId)!, t) : l.price })) }));

  const clear = async () => {
    if (cart.lines.length && !(await confirm({ title: 'Clear this bill?', body: 'All items in the cart will be removed.', ok: 'Clear', danger: true }))) return;
    setCart(EMPTY);
    searchRef.current?.focus();
  };

  const hold = async () => {
    if (!cart.lines.length) return;
    const label = customer?.name || cart.walkName || `Bill of ${items} item${items > 1 ? 's' : ''}`;
    const h: Held = { id: uid('h'), date: new Date().toISOString(), counter: me!.counter, userName: me!.name, label: `${label} · ${rs(total)}`, cart };
    if (await commit([{ t: 'put', c: 'held', d: h }], 'Bill put on hold — serve the next customer')) setCart(EMPTY);
  };

  const complete = async () => {
    if (!cart.lines.length) return toast('Add items first — scan or click a product.', 'warn');
    if (overLimit) return toast(`Discount of ${manualDiscPct.toFixed(1)}% is over your limit of ${settings.cashierDiscountLimit}%. Ask the manager.`, 'bad');
    if (cart.lines.some((l) => l.qty <= 0)) return toast('A quantity is zero — fix or remove that line.', 'warn');
    if (cart.method === 'Split' && paidSum > total + 0.01) return toast('Split amounts add up to more than the bill.', 'bad');
    if (onKhata > 0 && !customer) return toast('Choose a khata customer for credit, or take the full amount.', 'bad');
    const short = cart.lines.filter((l) => (pm.get(l.productId)?.stock ?? 0) < l.qty);
    if (short.length && !(await confirm({ title: 'Not enough stock on record', body: <>{short.map((l) => <div key={l.productId}>{pm.get(l.productId)?.name}: selling {l.qty}, system shows {pm.get(l.productId)?.stock}</div>)}<p className="muted">Sell anyway? Stock will go below zero until you correct it in Stock IN / OUT.</p></>, ok: 'Sell anyway' }))) return;
    if (customer && onKhata > 0 && customer.creditLimit && (bal?.balance || 0) + onKhata > customer.creditLimit) {
      if (!(await confirm({ title: 'Credit limit will be crossed', body: `${customer.name} owes ${rs(bal?.balance || 0)}. With ${rs(onKhata)} more the khata becomes ${rs((bal?.balance || 0) + onKhata)}, over the limit of ${rs(customer.creditLimit)}.`, ok: 'Give credit anyway', danger: true }))) return;
    }
    if (cart.method === 'Cash' && cart.cashGiven > 0 && cart.cashGiven < total) return toast(`Cash received is less than the bill by ${rs(total - cart.cashGiven)}.`, 'bad');
    const { sale, ops } = buildSale(db, me!, {
      lines: cart.lines, discount: billDisc, payments, customer, customerName: cart.walkName.trim(), customerPhone: cart.walkPhone.trim(),
      cashReceived: cashPart ? cart.cashGiven || cashPart : 0, priceType: cart.priceType, note: cart.note,
    });
    const ok = await commit(ops as Op[]);
    if (ok) {
      setCart(EMPTY);
      setQ('');
      openModal(<ReceiptModal saleId={sale.id} fresh />);
    }
  };

  return (
    <div className="posv">
      <section className="pos-left">
        <div className="pos-search">
          <ScanBarcode size={20} />
          <input
            ref={searchRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.preventDefault(), onSearchEnter());
              if (e.key === 'Escape') setQ('');
            }}
            placeholder="Scan barcode or type product name…  (F2)"
            aria-label="Scan or search products"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="chips">
          {cats.map((c) => (
            <button key={c} className={cat === c && !q ? 'on' : ''} onClick={() => (setCat(c), setQ(''))}>
              {c}
            </button>
          ))}
        </div>
        <div className="pgrid">
          {list.map((p) => {
            const st = stockState(p);
            const inCart = cart.lines.find((l) => l.productId === p.id)?.qty || 0;
            return (
              <button key={p.id} className={`pitem s-${st}`} onClick={() => add(p)} title={`${p.name}\n${p.barcode}${p.shelf ? ' · shelf ' + p.shelf : ''}`}>
                {inCart > 0 && <span className="incart">{inCart}</span>}
                <span className="pc-n">{p.name}</span>
                <span className="pc-b">
                  <b>{rs(cart.priceType === 'wholesale' && p.wholesale ? p.wholesale : p.price)}</b>
                  <span className={`pc-s ${st}`}>{st === 'out' ? 'Out' : `${num(p.stock)} left`}</span>
                </span>
              </button>
            );
          })}
          {!list.length && (
            <Empty title="No product found" icon={<PackageX size={34} />}>
              {can('products.edit') ? (
                <button className="btn pri" onClick={() => openModal(<ProductForm initialBarcode={/^\d{6,}$/.test(q) ? q : undefined} />)}>
                  <Plus size={14} /> Add a new product
                </button>
              ) : (
                'Check the spelling or scan again.'
              )}
            </Empty>
          )}
        </div>
        <div className="pos-keys">
          <Keyboard size={13} /> <b>F2</b> search <b>Enter</b> add <b>F9</b> complete — a barcode scanner works anywhere on this screen
        </div>
      </section>

      <section className="pos-cart">
        <div className="cart-h">
          <div className="cart-title">
            <b>Current bill</b>
            <span className="muted">
              {num(items)} item{items === 1 ? '' : 's'}
            </span>
            <span className="spacer" />
            <Seg
              value={cart.priceType}
              onChange={setPriceType}
              options={[
                { v: 'retail', label: 'Retail' },
                { v: 'wholesale', label: 'Wholesale' },
              ]}
            />
          </div>
          <div className="cust">
            <UserRound size={16} />
            <Picker
              items={customers}
              value={cart.customerId}
              onPick={(c) => setCart((x) => ({ ...x, customerId: c?.id, method: !c && x.method === 'Khata' ? 'Cash' : x.method }))}
              label={(c) => c.name}
              sub={(c) => {
                const b = balances(db).get(c.id)?.balance || 0;
                return b > 0 ? <span className="info">owes {rs(b)}</span> : c.phone;
              }}
              placeholder="Walk-in customer (or pick a khata customer)"
              onCreate={(name) => openModal(<PartyForm type="customer" initialName={name} onSaved={(p) => setCart((x) => ({ ...x, customerId: p.id }))} />)}
              createLabel="New customer"
            />
          </div>
          {customer ? (
            <div className={`custbal ${bal && bal.balance > 0 ? (bal.overLimit ? 'bad' : 'info') : 'good'}`}>
              {bal && bal.balance > 0 ? (
                <>
                  Owes <b>{rs(bal.balance)}</b>
                  {customer.creditLimit ? ` of ${rs(customer.creditLimit)} limit` : ''}
                </>
              ) : (
                <>Khata is clear</>
              )}
            </div>
          ) : (
            <input
              className="walkin"
              placeholder="Name or mobile (for WhatsApp bill) — optional"
              value={cart.walkPhone || cart.walkName}
              inputMode="text"
              onChange={(e) => {
                const v = e.target.value;
                const isPhone = /^[\d\s+-]+$/.test(v.trim()) && v.replace(/\D/g, '').length >= 4;
                setCart((x) => ({ ...x, walkPhone: isPhone ? v : '', walkName: isPhone ? '' : v }));
              }}
            />
          )}
        </div>

        <div className="cart-lines">
          {!cart.lines.length && (
            <div className="cart-empty">
              <ScanBarcode size={36} />
              <b>No items yet</b>
              <span>Scan a barcode or tap a product.</span>
            </div>
          )}
          {cart.lines.map((l, i) => {
            const p = pm.get(l.productId);
            const short = p && p.stock < l.qty;
            const below = p && can('cost.view') && l.price < p.cost;
            return (
              <div key={l.productId} className={`cl ${short ? 'short' : ''}`}>
                <div className="cl-top">
                  <span className="cl-n">{p?.name || 'Removed product'}</span>
                  <span className="cl-amt">{rs(l.price * l.qty - (l.disc || 0))}</span>
                </div>
                <div className="cl-row">
                  <span className="qtybox">
                    <button onClick={() => (l.qty <= 1 ? removeLine(i) : setLine(i, { qty: l.qty - 1 }))} aria-label="Less">
                      <Minus size={13} />
                    </button>
                    <NumInput value={l.qty} onChange={(n) => setLine(i, { qty: Math.max(0, n) })} min={0} aria-label="Quantity" />
                    <button onClick={() => setLine(i, { qty: l.qty + 1 })} aria-label="More">
                      <Plus size={13} />
                    </button>
                  </span>
                  <span className="x">×</span>
                  {can('prices') ? (
                    <NumInput className="pricein" value={l.price} onChange={(n) => setLine(i, { price: n })} min={0} aria-label="Price" />
                  ) : (
                    <span className="pricefix">{num(l.price)}</span>
                  )}
                  {discAt === i ? (
                    <span className="linedisc">
                      −
                      <NumInput autoFocus value={l.disc || 0} onChange={(n) => setLine(i, { disc: Math.max(0, Math.min(l.price * l.qty, n)) })} min={0} onBlur={() => setDiscAt(null)} onKeyDown={(e) => e.key === 'Enter' && setDiscAt(null)} aria-label="Line discount" />
                    </span>
                  ) : (
                    <button className={`linkbtn small ${l.disc ? 'warn' : ''}`} onClick={() => setDiscAt(i)}>
                      {l.disc ? `−${num(l.disc)}` : 'Discount'}
                    </button>
                  )}
                  <span className="spacer" />
                  <button className="cl-x" onClick={() => removeLine(i)} aria-label="Remove item" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
                {(short || below) && (
                  <div className="cl-meta">
                    {short && (
                      <span className="bad">
                        <TriangleAlert size={12} /> only {num(p!.stock)} in stock
                      </span>
                    )}
                    {below && <span className="bad">below cost ({rs(p!.cost)})</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="cart-f">
          <div className="tots">
            <div>
              <span>Sub-total</span>
              <b>{rs(subtotal)}</b>
            </div>
            <div className="discrow">
              <span>Discount</span>
              <span className="discin">
                <NumInput value={cart.discVal} onChange={(n) => setCart((x) => ({ ...x, discVal: Math.max(0, n) }))} min={0} placeholder="0" aria-label="Bill discount" />
                <button className={cart.discMode === 'pct' ? 'on' : ''} onClick={() => setCart((x) => ({ ...x, discMode: x.discMode === 'pct' ? 'rs' : 'pct' }))} title="Switch between rupees and percent">
                  {cart.discMode === 'pct' ? <Percent size={12} /> : 'Rs'}
                </button>
              </span>
              <b className={billDisc ? 'warn' : 'muted'}>{billDisc ? '−' + rs(billDisc) : '—'}</b>
            </div>
            {overLimit && <div className="note bad small">Discount {manualDiscPct.toFixed(1)}% is over the {settings.cashierDiscountLimit}% cashier limit — a manager must make this bill.</div>}
            <div className="grand">
              <span>Total</span>
              <b>{rs(total)}</b>
            </div>
            {can('cost.view') && total > 0 && (
              <div className={`profitline ${profit >= 0 ? 'good' : 'bad'}`}>
                {profit >= 0 ? 'Profit' : 'Loss'} <b>{rs(profit)}</b>
                {discPct > 0.5 && <small> · {discPct.toFixed(1)}% below list</small>}
              </div>
            )}
          </div>

          <div className="paym" role="group" aria-label="Payment method">
            {[...METHODS, 'Split' as const].map((m) => (
              <button key={m} className={`pm ${METHOD_CLS[m] || 'm-split'} ${cart.method === m ? 'on' : ''}`} onClick={() => setCart((x) => ({ ...x, method: m }))} disabled={m === 'Khata' && !customer} title={m === 'Khata' && !customer ? 'Pick a khata customer first' : undefined}>
                {m}
              </button>
            ))}
          </div>

          {cart.method === 'Cash' && total > 0 && (
            <div className="cashrow">
              <label className="cashin">
                <span>Cash received</span>
                <NumInput value={cart.cashGiven} onChange={(n) => setCart((x) => ({ ...x, cashGiven: n }))} min={0} placeholder={String(total)} />
              </label>
              <div className={`change ${change > 0 ? 'on' : ''}`}>
                <span>Change</span>
                <b>{rs(change)}</b>
              </div>
              <div className="quickcash">
                {[...new Set([total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000])].slice(0, 4).map((v) => (
                  <button key={v} className={cart.cashGiven === v ? 'on' : ''} onClick={() => setCart((x) => ({ ...x, cashGiven: v }))}>
                    {num(v)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {cart.method === 'Split' && (
            <div className="splitbox">
              {(['Cash', 'Bank', 'JazzCash', 'Easypaisa'] as PayMethod[]).map((m) => (
                <label key={m} className={METHOD_CLS[m]}>
                  <span>{m}</span>
                  <NumInput value={cart.split[m] || 0} onChange={(n) => setCart((x) => ({ ...x, split: { ...x.split, [m]: n } }))} min={0} placeholder="0" />
                </label>
              ))}
              <div className={`splitrest ${total - paidSum + onKhata > 0.01 ? (customer ? 'info' : 'bad') : 'good'}`}>
                {onKhata > 0 ? (customer ? <>Rest on khata: <b>{rs(onKhata)}</b></> : <>Short by <b>{rs(onKhata)}</b> — pick a customer for khata</>) : paidSum > total + 0.01 ? <>Over by <b>{rs(paidSum - total)}</b></> : <>Fully paid</>}
              </div>
            </div>
          )}
          {cart.method === 'Khata' && customer && (
            <div className="note calm small">
              Goes on {customer.name}’s khata. New balance <b>{rs((bal?.balance || 0) + total)}</b>
            </div>
          )}

          <div className="cart-btns">
            <button className="btn icon" onClick={hold} disabled={!cart.lines.length} title="Hold this bill and serve someone else" aria-label="Hold bill">
              <Pause size={16} />
            </button>
            <button className="btn icon" onClick={clear} disabled={!cart.lines.length} title="Clear the bill" aria-label="Clear bill">
              <X size={16} />
            </button>
            <button id="pos-complete" className="btn pri big grow" onClick={complete} disabled={!cart.lines.length}>
              <CircleCheck size={17} /> Complete sale
              {total > 0 && <span>{rs(total)}</span>}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeldBills() {
  const { db, go, commit, confirm } = useApp();
  const list = [...db.held].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Page title="Held bills" urdu="رکے ہوئے بل" sub="Bills put aside while serving another customer. Any counter can resume them.">
      {!list.length ? (
        <Empty title="No bills on hold" icon={<Pause size={34} />}>
          Press <b>Hold</b> on the billing screen to park a bill.
        </Empty>
      ) : (
        <div className="heldgrid">
          {list.map((h) => (
            <div key={h.id} className="held">
              <div>
                <b>{h.label}</b>
                <small>
                  {h.counter} · {h.userName} · {dFull(h.date)} ({relDay(h.date)})
                </small>
                <div className="held-items">
                  {(h.cart?.lines || []).slice(0, 4).map((l: CartLine) => (
                    <Tag key={l.productId}>{(db.products.find((p) => p.id === l.productId)?.name || '?').slice(0, 26)} × {l.qty}</Tag>
                  ))}
                </div>
              </div>
              <div className="held-a">
                <button className="btn pri" onClick={() => go('pos/new?resume=' + h.id)}>
                  <Play size={14} /> Resume
                </button>
                <button
                  className="btn gh"
                  onClick={async () => (await confirm({ title: 'Delete held bill?', danger: true, ok: 'Delete' })) && commit([{ t: 'del', c: 'held', id: h.id }], 'Held bill deleted')}
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
