'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Upload, Printer, Tag as TagIc, Pencil, Trash2, Barcode, Download, Minus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTab } from '../Router';
import { Page, Panel, DataTable, Money, Tag, Kpi, StockQty, StockTag, Seg, Empty, Modal, Field, NumInput, type Col } from '../Shared';
import { ProductForm } from '../Forms';
import { BarcodeSVG } from '../Barcode';
import { Printable, printNow } from '../Print';
import type { Product } from '../../lib/types';
import { margin, stockState, productStats, lastSoldMap, stockValue, newBarcode, auditOp, moveOp, onOrder } from '../../lib/logic';
import { addDays, daysAgo, num, pct, rs, startOfDay, toCSV, download, uid } from '../../lib/format';
import type { Op } from '../../lib/db';

export function ProductsPage() {
  const t = useTab();
  return t === 'labels' ? <Labels /> : t === 'categories' ? <Categories /> : <List />;
}

type Filter = 'all' | 'low' | 'out' | 'slow' | 'new' | 'off';

function List() {
  const { db, can, openModal, params, settings } = useApp();
  const [filter, setFilter] = useState<Filter>((params.get('f') as Filter) || 'all');
  const [cat, setCat] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const showCost = can('cost.view');

  useEffect(() => {
    if (params.get('new') && can('products.edit')) openModal(<ProductForm />);
    const id = params.get('id');
    const p = id && db.products.find((x) => x.id === id);
    if (p && can('products.edit')) openModal(<ProductForm product={p} />);
  }, [params.get('new'), params.get('id')]); // eslint-disable-line react-hooks/exhaustive-deps

  const r30 = useMemo(() => ({ key: '30d' as const, from: addDays(startOfDay(new Date()), -29), to: addDays(startOfDay(new Date()), 1), label: '' }), []);
  const stats = useMemo(() => productStats(db, r30), [db, r30]);
  const last = useMemo(() => lastSoldMap(db), [db]);
  const sv = useMemo(() => stockValue(db), [db]);
  const isSlow = (p: Product) => p.stock > 0 && (!last.get(p.id) || daysAgo(last.get(p.id)!) > 45) && daysAgo(p.createdAt) > 45;

  const counts = useMemo(() => {
    const a = db.products.filter((p) => p.active);
    return { all: a.length, low: a.filter((p) => stockState(p) === 'low').length, out: a.filter((p) => stockState(p) === 'out').length, slow: a.filter(isSlow).length, new: a.filter((p) => daysAgo(p.createdAt) <= 30).length, off: db.products.length - a.length };
  }, [db.products, last]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    let ps = db.products.filter((p) => (filter === 'off' ? !p.active : p.active));
    if (filter === 'low') ps = ps.filter((p) => stockState(p) === 'low');
    if (filter === 'out') ps = ps.filter((p) => stockState(p) === 'out');
    if (filter === 'slow') ps = ps.filter(isSlow);
    if (filter === 'new') ps = ps.filter((p) => daysAgo(p.createdAt) <= 30);
    if (cat) ps = ps.filter((p) => p.category === cat);
    return ps;
  }, [db.products, filter, cat, last]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols: Col<Product>[] = [
    { key: 'name', label: 'Product', get: (p) => p.name, render: (p) => <span className="pname"><b>{p.name}</b><small>{[p.brand, p.shelf && 'shelf ' + p.shelf, p.warranty && p.warranty + ' warranty'].filter(Boolean).join(' · ')}</small></span> },
    { key: 'barcode', label: 'Barcode', render: (p) => <span className="mono small">{p.barcode}</span> },
    { key: 'category', label: 'Category' },
    { key: 'stock', label: 'In stock', r: true, get: (p) => p.stock, render: (p) => <StockQty p={p} /> },
    { key: 'min', label: 'Alert at', r: true, get: (p) => p.minStock },
    { key: 'cost', label: 'Cost', r: true, hide: !showCost, get: (p) => p.cost, render: (p) => rs(p.cost) },
    { key: 'price', label: 'Price', r: true, get: (p) => p.price, render: (p) => <b>{rs(p.price)}</b> },
    { key: 'wholesale', label: 'Wholesale', r: true, get: (p) => p.wholesale || 0, render: (p) => (p.wholesale ? rs(p.wholesale) : <span className="muted">—</span>) },
    { key: 'margin', label: 'Margin', r: true, hide: !showCost, get: (p) => margin(p), render: (p) => { const m = margin(p); return <span className={`pill ${m < 0 ? 'bad' : m < 10 ? 'warn' : 'good'}`}>{pct(m)}</span>; } },
    { key: 'sold', label: 'Sold (30 days)', r: true, get: (p) => stats.get(p.id)?.qty || 0, render: (p) => { const q = stats.get(p.id)?.qty || 0; return q ? num(q) : <span className="muted">0</span>; } },
    { key: 'value', label: 'Stock value', r: true, hide: !showCost, get: (p) => Math.max(0, p.stock) * p.cost, render: (p) => rs(Math.max(0, p.stock) * p.cost), total: (rs_) => <Money v={rs_.reduce((a, p) => a + Math.max(0, p.stock) * p.cost, 0)} /> },
    { key: 'status', label: 'Status', get: (p) => stockState(p), render: (p) => (!p.active ? <Tag>Switched off</Tag> : isSlow(p) && stockState(p) === 'ok' ? <Tag tone="violet" title="No sale in 45 days">Slow moving</Tag> : <StockTag p={p} />) },
  ];

  const template = () =>
    download('products-template.csv', toCSV([['name', 'barcode', 'category', 'brand', 'unit', 'cost', 'price', 'wholesale', 'stock', 'minStock', 'shelf'], ['Example Tweezers ST-14', '', settings.categories[0] || 'General', 'Vetus', 'pc', 250, 400, 350, 20, 5, 'A-1']]));

  return (
    <Page search exportable
      title="Products" urdu="مصنوعات"
      sub="Your catalogue. Green = in stock, amber = low, red = out of stock. Click a product to edit."
      actions={
        <>
          {can('products.edit') && (
            <>
              <button className="btn" onClick={() => fileRef.current?.click()} title="Import from Excel (CSV)">
                <Upload size={15} /> Import
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openModal(<ImportModal file={f} onTemplate={template} />); e.target.value = ''; }} />
              <button className="btn pri" onClick={() => openModal(<ProductForm />)}>
                <Plus size={15} /> Add product
              </button>
            </>
          )}
        </>
      }
    >
      <div className="kpis">
        <Kpi label="Products" value={counts.all} money={false} color="var(--s1)" onClick={() => setFilter('all')} />
        <Kpi label="Low stock" value={counts.low} money={false} tone={counts.low ? 'warn' : undefined} color="var(--warn)" onClick={() => setFilter('low')} />
        <Kpi label="Out of stock" value={counts.out} money={false} tone={counts.out ? 'bad' : undefined} color="var(--bad)" onClick={() => setFilter('out')} />
        {showCost && <Kpi label="Stock at cost" value={sv.cost} color="var(--s3)" foot={<span className="vs">{num(sv.units)} units</span>} />}
        {showCost && <Kpi label="Stock at selling price" value={sv.retail} color="var(--s1)" foot={<span className="good">+{rs(sv.potential)} profit inside</span>} />}
      </div>
      <div className="panel">
        <div className="panel-b">
          <DataTable
            rows={rows}
            cols={cols}
            csvName="products"
            pageSize={30}
            defaultSort={{ key: 'name', dir: 1 }}
            onRow={can('products.edit') ? (p) => openModal(<ProductForm product={p} />) : undefined}
            rowCls={(p) => 'st-' + stockState(p)}
            searchPlaceholder="Name, barcode, brand…"
            filters={
              <>
                <Seg
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { v: 'all', label: `All ${counts.all}` },
                    { v: 'low', label: `Low ${counts.low}`, tone: 'a' },
                    { v: 'out', label: `Out ${counts.out}`, tone: 'r' },
                    { v: 'slow', label: `Slow ${counts.slow}` },
                    { v: 'new', label: `New ${counts.new}` },
                    ...(counts.off ? [{ v: 'off' as Filter, label: `Off ${counts.off}` }] : []),
                  ]}
                />
                <select className="fldsel" value={cat} onChange={(e) => setCat(e.target.value)}>
                  <option value="">All categories</option>
                  {settings.categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </>
            }
          />
        </div>
      </div>
    </Page>
  );
}

/* ------------------------------ CSV import ------------------------------ */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"', i++);
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function ImportModal({ file, onTemplate }: { file: File; onTemplate: () => void }) {
  const { db, commit, closeModal, me, settings } = useApp();
  const [rows, setRows] = useState<{ name: string; barcode: string; category: string; brand: string; unit: string; cost: number; price: number; wholesale: number; stock: number; minStock: number; shelf: string; status: string; existing?: Product }[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    file.text().then((t) => {
      const data = parseCSV(t.replace(/^﻿/, ''));
      if (data.length < 2) return setErr('The file has no rows.');
      const head = data[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
      const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
      const ix = { name: col('name', 'product', 'productname', 'item'), barcode: col('barcode', 'code', 'sku'), category: col('category'), brand: col('brand'), unit: col('unit'), cost: col('cost', 'purchaseprice', 'costprice'), price: col('price', 'saleprice', 'retail', 'sellingprice'), wholesale: col('wholesale'), stock: col('stock', 'qty', 'quantity'), minStock: col('minstock', 'min', 'reorder', 'alert'), shelf: col('shelf', 'location') };
      if (ix.name < 0 || ix.price < 0) return setErr('The first row must have at least “name” and “price” columns. Download the template to see the layout.');
      const used = new Set<string>();
      const out = data.slice(1).map((r) => {
        const g = (k: keyof typeof ix) => (ix[k] >= 0 ? (r[ix[k]] || '').trim() : '');
        const n = (k: keyof typeof ix) => Number(g(k).replace(/[^\d.-]/g, '')) || 0;
        const barcode = g('barcode');
        const existing = barcode ? db.products.find((p) => p.barcode === barcode) : db.products.find((p) => p.name.toLowerCase() === g('name').toLowerCase());
        const status = !g('name') ? 'Missing name' : n('price') <= 0 ? 'Missing price' : barcode && used.has(barcode) ? 'Duplicate barcode in file' : existing ? 'Update' : 'New';
        if (barcode) used.add(barcode);
        return { name: g('name'), barcode, category: g('category') || settings.categories[0] || 'General', brand: g('brand'), unit: g('unit') || 'pc', cost: n('cost'), price: n('price'), wholesale: n('wholesale'), stock: n('stock'), minStock: ix.minStock >= 0 ? n('minStock') : 3, shelf: g('shelf'), status, existing };
      });
      setRows(out);
    });
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  const good = rows.filter((r) => r.status === 'New' || r.status === 'Update');
  const run = async () => {
    const ops: Op[] = [];
    const now = new Date().toISOString();
    const fake = { ...db, products: [...db.products] };
    good.forEach((r) => {
      if (r.existing) {
        ops.push({ t: 'put', c: 'products', d: { id: r.existing.id, name: r.name, category: r.category, brand: r.brand, unit: r.unit, cost: r.cost || r.existing.cost, price: r.price, wholesale: r.wholesale || r.existing.wholesale, minStock: r.minStock, shelf: r.shelf || r.existing.shelf, updatedAt: now } });
      } else {
        const p: Product = { id: uid('p'), name: r.name, barcode: r.barcode || newBarcode(fake as any), category: r.category, brand: r.brand, unit: r.unit, cost: r.cost, price: r.price, wholesale: r.wholesale, minStock: r.minStock, stock: r.stock, shelf: r.shelf, active: true, createdAt: now, updatedAt: now };
        fake.products.push(p);
        ops.push({ t: 'put', c: 'products', d: p });
        if (r.stock) ops.push(moveOp({ ...p, stock: 0 }, 'opening', r.stock, r.cost, me!, undefined, 'Imported opening stock'));
      }
    });
    const newCats = [...new Set(good.map((r) => r.category))].filter((c) => !settings.categories.includes(c));
    if (newCats.length) ops.push({ t: 'put', c: 'settings', d: { ...settings, categories: [...settings.categories, ...newCats] } });
    ops.push(auditOp(me!.name, 'Products imported', `${good.filter((r) => !r.existing).length} new, ${good.filter((r) => r.existing).length} updated from ${file.name}`, 'info'));
    if (await commit(ops, `${good.length} products imported`)) closeModal();
  };
  return (
    <Modal
      size="xl"
      title={`Import ${file.name}`}
      sub="Existing products (same barcode, or same name) are updated; their stock is not changed. New products get their opening stock."
      foot={
        <>
          <button className="btn gh" onClick={onTemplate}><Download size={14} /> Template</button>
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>Cancel</button>
          <button className="btn pri" disabled={!good.length} onClick={run}><Upload size={15} /> Import {good.length} products</button>
        </>
      }
    >
      {err ? (
        <div className="note bad">{err}</div>
      ) : (
        <div className="tblwrap" style={{ maxHeight: 420 }}>
          <table className="tbl">
            <thead><tr><th>Status</th><th>Name</th><th>Barcode</th><th>Category</th><th className="r">Cost</th><th className="r">Price</th><th className="r">Stock</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><Tag tone={r.status === 'New' ? 'good' : r.status === 'Update' ? 'info' : 'bad'}>{r.status}</Tag></td>
                  <td>{r.name}</td><td className="mono small">{r.barcode || <span className="muted">auto</span>}</td><td>{r.category}</td>
                  <td className="r">{rs(r.cost)}</td><td className="r">{rs(r.price)}</td><td className="r">{r.existing ? <span className="muted">kept</span> : num(r.stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ barcode labels ------------------------------ */

function Labels() {
  const { db, settings, params } = useApp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, number>>(() => {
    const id = params.get('id');
    return id ? { [id]: 1 } : {};
  });
  const [showPrice, setShowPrice] = useState(true);
  const list = db.products.filter((p) => p.active && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q))).slice(0, 80);
  const chosen = Object.entries(sel).filter(([, n]) => n > 0).map(([id, n]) => ({ p: db.products.find((x) => x.id === id)!, n })).filter((x) => x.p);
  const total = chosen.reduce((a, x) => a + x.n, 0);
  const labels = chosen.flatMap((x) => Array.from({ length: x.n }, () => x.p));
  const label = (p: Product, k: number) => (
    <div key={k} className="lbl">
      <small>{settings.shopName}</small>
      <b>{p.name}</b>
      <BarcodeSVG value={p.barcode} height={36} module={1.1} />
      {showPrice && <strong>{rs(p.price)}</strong>}
    </div>
  );
  return (
    <Page
      title="Barcode labels" urdu="بارکوڈ لیبل"
      sub="Pick products and how many stickers of each. Prints on A4 sticker sheets (3 across); a USB barcode scanner reads them at the counter."
      actions={
        <>
          <label className="chk"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Show price</label>
          <button className="btn pri" disabled={!total} onClick={() => printNow('labels')}><Printer size={15} /> Print {total} label{total === 1 ? '' : 's'}</button>
        </>
      }
    >
      <div className="grid c2u">
        <Panel title="Products" actions={<input className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          <div className="lblpick">
            {list.map((p) => (
              <div key={p.id} className={`lp ${sel[p.id] ? 'on' : ''}`}>
                <span><b>{p.name}</b><small className="mono">{p.barcode} · {num(p.stock)} in stock</small></span>
                <span className="qtybox sm">
                  <button onClick={() => setSel((s) => ({ ...s, [p.id]: Math.max(0, (s[p.id] || 0) - 1) }))}><Minus size={13} /></button>
                  <NumInput value={sel[p.id] || 0} onChange={(n) => setSel((s) => ({ ...s, [p.id]: Math.max(0, Math.floor(n)) }))} min={0} />
                  <button onClick={() => setSel((s) => ({ ...s, [p.id]: (s[p.id] || 0) + 1 }))}><Plus size={13} /></button>
                </span>
                <button className="btn sm gh" onClick={() => setSel((s) => ({ ...s, [p.id]: Math.max(1, p.stock) }))} title="One per unit in stock">= stock</button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Preview" sub={`${total} labels`} actions={total ? <button className="btn sm gh" onClick={() => setSel({})}>Clear</button> : undefined}>
          {total ? <div className="lblsheet prev">{labels.slice(0, 24).map(label)}</div> : <Empty title="No labels chosen" icon={<Barcode size={34} />}>Use + next to a product.</Empty>}
          {total > 24 && <p className="muted small">…and {total - 24} more on the printout.</p>}
        </Panel>
      </div>
      <Printable>
        <div className="lblsheet">{labels.map(label)}</div>
      </Printable>
    </Page>
  );
}

/* ------------------------------ categories ------------------------------ */

function Categories() {
  const { db, settings, commit, can, me, confirm, go } = useApp();
  const [name, setName] = useState('');
  const [edit, setEdit] = useState<{ from: string; to: string } | null>(null);
  const stats = useMemo(() => {
    const r = { key: '30d' as const, from: addDays(startOfDay(new Date()), -29), to: addDays(startOfDay(new Date()), 1), label: '' };
    const ps = productStats(db, r);
    return settings.categories.map((c) => {
      const items = db.products.filter((p) => p.category === c && p.active);
      return { c, items: items.length, low: items.filter((p) => stockState(p) !== 'ok').length, value: items.reduce((a, p) => a + Math.max(0, p.stock) * p.cost, 0), sold: items.reduce((a, p) => a + (ps.get(p.id)?.revenue || 0), 0), onOrder: items.reduce((a, p) => a + onOrder(db, p.id), 0) };
    });
  }, [db, settings.categories]);
  const add = async () => {
    const n = name.trim();
    if (!n || settings.categories.includes(n)) return;
    if (await commit([{ t: 'put', c: 'settings', d: { ...settings, categories: [...settings.categories, n] } }], 'Category added')) setName('');
  };
  const rename = async () => {
    if (!edit) return;
    const to = edit.to.trim();
    if (!to || to === edit.from) return setEdit(null);
    const ops: Op[] = [{ t: 'put', c: 'settings', d: { ...settings, categories: settings.categories.map((c) => (c === edit.from ? to : c)) } }];
    db.products.filter((p) => p.category === edit.from).forEach((p) => ops.push({ t: 'put', c: 'products', d: { id: p.id, category: to } }));
    ops.push(auditOp(me!.name, 'Category renamed', `${edit.from} → ${to}`, 'info'));
    if (await commit(ops, 'Category renamed')) setEdit(null);
  };
  const del = async (c: string) => {
    const n = db.products.filter((p) => p.category === c).length;
    if (n) return confirm({ title: 'Category in use', body: `${n} products are in “${c}”. Move them to another category first.`, ok: 'OK' });
    if (await confirm({ title: `Delete “${c}”?`, danger: true, ok: 'Delete' })) commit([{ t: 'put', c: 'settings', d: { ...settings, categories: settings.categories.filter((x) => x !== c) } }], 'Deleted');
  };
  const max = Math.max(1, ...stats.map((s) => s.sold));
  return (
    <Page title="Categories" urdu="اقسام" sub="Groups of products — shown as quick filters on the billing screen.">
      {can('products.edit') && (
        <div className="toolrow">
          <input className="search plain" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn pri" onClick={add}><Plus size={15} /> Add</button>
        </div>
      )}
      <div className="catgrid">
        {stats.map((s, i) => (
          <div key={s.c} className="cat" style={{ '--c': `var(--s${(i % 8) + 1})` } as React.CSSProperties}>
            {edit?.from === s.c ? (
              <input autoFocus value={edit.to} onChange={(e) => setEdit({ ...edit, to: e.target.value })} onKeyDown={(e) => (e.key === 'Enter' ? rename() : e.key === 'Escape' && setEdit(null))} onBlur={rename} />
            ) : (
              <button className="cat-n" onClick={() => go('products/list')}><TagIc size={15} /> {s.c}</button>
            )}
            <div className="cat-s">
              <span><b>{s.items}</b> items</span>
              {s.low > 0 && <span className="warn"><b>{s.low}</b> low/out</span>}
              {can('cost.view') && <span>stock <b>{rs(s.value)}</b></span>}
            </div>
            <div className="bar"><i style={{ width: `${(s.sold / max) * 100}%` }} /></div>
            <small className="muted">{rs(s.sold)} sold in 30 days</small>
            {can('products.edit') && (
              <div className="cat-a">
                <button className="iconbtn" onClick={() => setEdit({ from: s.c, to: s.c })} aria-label="Rename"><Pencil size={14} /></button>
                <button className="iconbtn" onClick={() => del(s.c)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Page>
  );
}

