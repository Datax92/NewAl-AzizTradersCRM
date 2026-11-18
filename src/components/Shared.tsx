'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X, Download, Printer, Inbox } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { num, RANGE_LABELS, type RangeKey, toCSV, download, ymd, addDays, dShort } from '../lib/format';
import type { PayMethod, Product } from '../lib/types';
import { stockState, STOCK_LABEL } from '../lib/logic';

/* ------------------------------ figures ------------------------------ */

function fmtNum(n: number) {
  return Math.abs(Math.round(n)).toLocaleString('en-US');
}

/** A rupee figure in the Property CRM style: a small "PKR" before the number. */
export function Fig({ n, cls = '' }: { n: number; cls?: string }) {
  const v = Math.round(Number(n) || 0);
  return (
    <span className={`fig ${cls}`}>
      <span className="cur">PKR</span>
      {v < 0 ? '−' : ''}
      {fmtNum(v)}
    </span>
  );
}

/** Money inside text and tables. `tone="pl"`: green when positive, red when negative. */
export function Money({ v, tone, sign, cls = '' }: { v: number; tone?: 'pl' | 'good' | 'bad' | 'warn' | 'mute'; sign?: boolean; cls?: string }) {
  const r = Math.round(Number(v) || 0);
  const t = tone === 'pl' ? (r > 0 ? 'pos' : r < 0 ? 'neg' : '') : tone === 'good' ? 'pos' : tone === 'bad' ? 'neg' : tone === 'warn' ? 'warnc' : tone === 'mute' ? 'muted' : '';
  return (
    <span className={`money ${t} ${cls}`}>
      {r < 0 ? '−' : sign && r > 0 ? '+' : ''}PKR {fmtNum(r)}
    </span>
  );
}

export function Delta({ now, prev, invert }: { now: number; prev: number; invert?: boolean }) {
  if (!prev && !now) return <span className="delta flat">—</span>;
  if (!prev) return <span className="delta flat">new</span>;
  const d = ((now - prev) / Math.abs(prev)) * 100;
  const up = d > 0.5, down = d < -0.5;
  const good = invert ? down : up;
  return (
    <span className={`delta ${!up && !down ? 'flat' : good ? 'up' : 'down'}`}>
      <span className="ar">{up ? '▲' : down ? '▼' : ''}</span>
      {Math.abs(d) > 999 ? '>999' : Math.abs(d).toFixed(1)}%
    </span>
  );
}

/* ------------------------------ tags ------------------------------ */

const TAG_CLS: Record<string, string> = { good: 'ok', bad: 'bad', warn: 'warn', info: 'new', mute: 'mute', violet: 'vio' };

export function Tag({ tone = 'mute', children, title }: { tone?: 'good' | 'bad' | 'warn' | 'info' | 'mute' | 'violet'; children: React.ReactNode; title?: string }) {
  return (
    <span className={`tag ${TAG_CLS[tone]}`} title={title}>
      {children}
    </span>
  );
}

export function StockTag({ p }: { p: Product }) {
  const s = stockState(p);
  return <Tag tone={s === 'out' ? 'bad' : s === 'low' ? 'warn' : 'good'}>{STOCK_LABEL[s]}</Tag>;
}

export function StockQty({ p }: { p: Product }) {
  const s = stockState(p);
  return (
    <span className={`sqty ${s}`}>
      {num(p.stock)} <small>{p.unit}</small>
    </span>
  );
}

export const METHOD_CLS: Record<string, string> = { Cash: 'm-cash', Bank: 'm-bank', JazzCash: 'm-jazz', Easypaisa: 'm-easy', Khata: 'm-khata' };

export function MethodChip({ m, amount }: { m: PayMethod; amount?: number }) {
  return (
    <span className={`mchip ${METHOD_CLS[m]}`}>
      <i />
      {m}
      {amount !== undefined && <b>{fmtNum(amount)}</b>}
    </span>
  );
}

/* ------------------------------ page shell ------------------------------ */

interface PageCtxT {
  query: string;
  exporter: React.MutableRefObject<null | (() => { name: string; rows: (string | number)[][] })>;
}
const PageCtx = createContext<PageCtxT | null>(null);

function exportXls(name: string, rows: (string | number)[][]) {
  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<html><head><meta charset="utf-8"></head><body><table>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</table></body></html>`;
  download(`${name}-${ymd()}.xls`, html, 'application/vnd.ms-excel');
}

/** Property CRM's page: the main action on the left, the title with its Urdu name, then search,
    period and the CSV / Excel / PDF buttons. */
export function Page({
  title, urdu, sub, actions, children, period, search, exportable, toolsExtra, toolsEnd,
}: {
  title: string;
  urdu?: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  period?: boolean;
  search?: boolean;
  exportable?: boolean;
  toolsExtra?: React.ReactNode;
  toolsEnd?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const exporter = useRef<PageCtxT['exporter']['current']>(null);
  const tools = period || search || exportable || toolsExtra || toolsEnd;
  const doExport = (kind: 'csv' | 'xls') => {
    const x = exporter.current?.();
    if (!x) return;
    if (kind === 'csv') download(`${x.name}-${ymd()}.csv`, toCSV(x.rows));
    else exportXls(x.name, x.rows);
  };
  return (
    <PageCtx.Provider value={{ query, exporter }}>
      <div className="page">
        <PrintHead title={title} />
        <div className="phead cp">
          {actions && (
            <div className="acts" data-noprint="1">
              {actions}
            </div>
          )}
          <div className="ptitle">
            <h1>
              {title}
              {urdu && <span className="u">{urdu}</span>}
            </h1>
            {sub && <p>{sub}</p>}
          </div>
          {tools && (
            <div className="toolrow" data-noprint="1">
              {search && <input className="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />}
              {toolsExtra}
              {period && <RangePicker />}
              {exportable && (
                <>
                  <span className="spacer" />
                  <button className="btn" onClick={() => doExport('csv')}>
                    <Download size={14} /> CSV
                  </button>
                  <button className="btn" onClick={() => doExport('xls')}>
                    <Download size={14} /> Excel
                  </button>
                  <button className="btn" onClick={() => window.print()}>
                    <Printer size={14} /> PDF
                  </button>
                </>
              )}
              {toolsEnd && (
                <>
                  <span className="spacer" />
                  {toolsEnd}
                </>
              )}
            </div>
          )}
        </div>
        {children}
      </div>
    </PageCtx.Provider>
  );
}

export function PrintHead({ title }: { title: string }) {
  const { settings, range, me } = useApp();
  return (
    <div className="print-head">
      <div className="co">{settings.shopName}</div>
      <div className="mt">
        <b>{title}</b> · Period: {range.label} ({dShort(range.from)} – {dShort(addDays(range.to, -1))}) · Generated {dShort(new Date())} · User: {me?.name}
      </div>
    </div>
  );
}

export function Panel({ title, sub, actions, children, tight, cls = '' }: { title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; tight?: boolean; cls?: string }) {
  return (
    <section className={`panel ${cls}`}>
      {(title || actions) && (
        <div className="panel-h">
          {title && <h3>{title}</h3>}
          {sub && <span className="sub">{sub}</span>}
          <span className="spacer" />
          {actions}
        </div>
      )}
      <div className={tight ? 'panel-b tight' : 'panel-b'}>{children}</div>
    </section>
  );
}

/** A Property CRM figure card: label, then the figure, then a line under it. */
export function Kpi({ label, value, money = true, tone, foot, onClick, lead, warn }: { label: string; value: number | string; money?: boolean; tone?: 'pl' | 'good' | 'bad' | 'warn'; foot?: React.ReactNode; onClick?: () => void; lead?: boolean; warn?: boolean; icon?: React.ReactNode; color?: string }) {
  const t = typeof value === 'number' ? (tone === 'pl' ? (value > 0 ? 'pos' : value < 0 ? 'neg' : '') : tone === 'good' ? 'pos' : tone === 'bad' ? 'neg' : tone === 'warn' ? 'warnc' : '') : '';
  const body = (
    <>
      {(lead || warn) && <i className="strip" />}
      <span className="k">{label}</span>
      <span className={`v ${t}`}>{typeof value === 'number' ? (money ? <Fig n={value} /> : <span className="fig">{num(value)}</span>) : value}</span>
      {foot && <span className="f">{foot}</span>}
    </>
  );
  const cls = `kpi ${lead ? 'lead' : ''} ${warn ? 'warnbox' : ''}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon || <Inbox size={32} strokeWidth={1.4} />}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function RangePicker({ keys }: { keys?: RangeKey[] }) {
  const { range, setRange } = useApp();
  const list: RangeKey[] = keys || ['today', 'yesterday', 'week', 'month', 'lastMonth', '30d', '90d', 'year', 'all', 'custom'];
  const [from, setFrom] = useState(ymd(range.from));
  const [to, setTo] = useState(ymd(addDays(range.to, -1)));
  return (
    <>
      <select className="fldsel" value={range.key} onChange={(e) => setRange(e.target.value as RangeKey, from, to)} aria-label="Period" title="Period">
        {list.map((k) => (
          <option key={k} value={k}>
            {RANGE_LABELS[k]}
          </option>
        ))}
      </select>
      {range.key === 'custom' ? (
        <>
          <input type="date" className="fldsel" value={from} onChange={(e) => (setFrom(e.target.value), setRange('custom', e.target.value, to))} aria-label="From" />
          <span className="vs">to</span>
          <input type="date" className="fldsel" value={to} onChange={(e) => (setTo(e.target.value), setRange('custom', from, e.target.value))} aria-label="To" />
        </>
      ) : (
        <span className="vs">{range.key === 'today' || range.key === 'yesterday' ? dShort(range.from) : `${dShort(range.from)} – ${dShort(addDays(range.to, -1))}`}</span>
      )}
    </>
  );
}

/* ------------------------------ modal & fields ------------------------------ */

export function Modal({ title, sub, children, foot, size = '', onClose }: { title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode; size?: '' | 'sm' | 'wide' | 'xl'; onClose?: () => void }) {
  const { closeModal } = useApp();
  const close = onClose || closeModal;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal ${size === 'wide' || size === 'xl' ? 'wide' : ''} ${size}`} role="dialog" aria-modal="true">
        <div className="modal-h">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button className="x" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {foot && <div className="modal-f">{foot}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, full }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`fld ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="bad">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function NumInput({ value, onChange, min, step, autoFocus, placeholder, ...rest }: { value: number | ''; onChange: (n: number) => void; min?: number; step?: number; autoFocus?: boolean; placeholder?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={value === 0 && placeholder ? '' : value}
      min={min}
      step={step || 'any'}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
    />
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: React.ReactNode; tone?: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="seg">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} className={o.tone || ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

/* ------------------------------ table ------------------------------ */

/** Columns dragged into another order by their heading, remembered in this browser. */
function useColumnOrder<C extends { key: string }>(name: string, base: C[]) {
  const key = 'mts-cols:' + name;
  const [order, setOrderState] = useState<string[]>([]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ key: string; after: boolean } | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(key) || '[]');
      setOrderState(Array.isArray(v) ? v : []);
    } catch {
      setOrderState([]);
    }
  }, [key]);
  const setOrder = (o: string[]) => {
    setOrderState(o);
    try {
      if (o.length) window.localStorage.setItem(key, JSON.stringify(o));
      else window.localStorage.removeItem(key);
    } catch {}
  };
  let cols = base;
  if (order.length) {
    const known = order.map((k) => base.find((c) => c.key === k)).filter(Boolean) as C[];
    cols = known.slice();
    base.forEach((c, i) => {
      if (!order.includes(c.key)) cols.splice(Math.min(i, cols.length), 0, c);
    });
  }
  const moved = cols.some((c, i) => c.key !== base[i]?.key);
  const end = () => (setDragKey(null), setDrop(null));
  const headProps = (k: string) => ({
    draggable: true,
    title: 'Drag to move this column',
    'data-drag': dragKey === k ? 'lifted' : drop && drop.key === k && dragKey !== k ? (drop.after ? 'after' : 'before') : undefined,
    onDragStart: (e: React.DragEvent) => {
      setDragKey(k);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', k);
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!dragKey) return;
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      const after = e.clientX > box.left + box.width / 2;
      if (!drop || drop.key !== k || drop.after !== after) setDrop({ key: k, after });
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragKey && drop && dragKey !== k) {
        const keys = cols.map((c) => c.key).filter((x) => x !== dragKey);
        keys.splice(keys.indexOf(k) + (drop.after ? 1 : 0), 0, dragKey);
        setOrder(keys);
      }
      end();
    },
    onDragEnd: end,
  });
  return { cols, moved, headProps, reset: () => setOrder([]) };
}

export interface Col<T> {
  key: string;
  label: string;
  r?: boolean;
  get?: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  total?: (rows: T[]) => React.ReactNode;
  csv?: boolean;
  hide?: boolean;
  w?: number;
}

/** Property CRM's register table: sortable headings, totals row, "1-12 / N" with Show all.
    The page's search box and CSV / Excel buttons work on it. */
export function DataTable<T extends { id: string }>({
  rows, cols, onRow, csvName, defaultSort, filters, empty, rowCls, highlight, pageSize = 15,
}: {
  rows: T[];
  cols: Col<T>[];
  onRow?: (r: T) => void;
  csvName?: string;
  defaultSort?: { key: string; dir: 1 | -1 };
  filters?: React.ReactNode;
  empty?: React.ReactNode;
  rowCls?: (r: T) => string;
  highlight?: string;
  pageSize?: number;
  search?: boolean;
  searchPlaceholder?: string;
}) {
  const ctx = useContext(PageCtx);
  const { cols: ordered, moved, headProps, reset } = useColumnOrder(csvName || cols.slice(0, 3).map((c) => c.key).join(','), cols.filter((c) => !c.hide));
  const shown = ordered;
  const [sort, setSort] = useState(defaultSort || null);
  const [all, setAll] = useState(false);
  const val = (c: Col<T>, r: T) => (c.get ? c.get(r) : (r as any)[c.key]);
  const q = (ctx?.query || '').trim().toLowerCase();

  const data = useMemo(() => {
    let out = rows;
    if (q) out = rows.filter((r) => shown.some((c) => String(val(c, r) ?? '').toLowerCase().includes(q)));
    if (sort) {
      const c = shown.find((x) => x.key === sort.key);
      if (c)
        out = [...out].sort((a, b) => {
          const x = val(c, a), y = val(c, b);
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
          return String(x ?? '').localeCompare(String(y ?? '')) * sort.dir;
        });
    }
    return out;
  }, [rows, q, sort, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // The page's CSV / Excel buttons export what this table shows.
  useEffect(() => {
    if (!ctx || !csvName) return;
    ctx.exporter.current = () => {
      const cc = shown.filter((c) => c.csv !== false);
      return { name: csvName, rows: [cc.map((c) => c.label), ...data.map((r) => cc.map((c) => (val(c, r) ?? '') as any))] };
    };
  });

  const cap = all ? data.length : pageSize;
  const page = data.slice(0, cap);
  const hasTotals = shown.some((c) => c.total);

  return (
    <>
      {filters && (
        <div className="tfilters" data-noprint="1">
          {filters}
        </div>
      )}
      {data.length === 0 ? (
        empty || (
          <Empty title="Nothing to show">{q ? `No rows match “${ctx?.query}”.` : 'No records fall inside this period and filter combination.'}</Empty>
        )
      ) : (
        <>
          <div className="panel">
            <div className="tblwrap">
              <table className="tbl">
                <thead>
                  <tr>
                    {shown.map((c) => (
                      <th key={c.key} className={`${c.r ? 'r' : ''} th-drag`} style={c.w ? { width: c.w } : undefined} {...headProps(c.key)}>
                        <button type="button" onClick={() => setSort((s) => (s && s.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.r ? -1 : 1 }))}>
                          {c.label}
                          {sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.map((r) => (
                    <tr key={r.id} className={`${onRow ? 'clk' : ''} ${rowCls ? rowCls(r) : ''} ${highlight === r.id ? 'fresh' : ''}`} onClick={onRow ? () => onRow(r) : undefined}>
                      {shown.map((c) => (
                        <td key={c.key} className={c.r ? 'r' : ''}>
                          {c.render ? c.render(r) : String(val(c, r) ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {hasTotals && (
                  <tfoot>
                    <tr>
                      {shown.map((c, i) => (
                        <td key={c.key} className={c.r ? 'r' : ''}>
                          {c.total ? c.total(data) : i === 0 ? `Total · ${num(data.length)} rows` : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <div className="pager" data-noprint="1">
            {moved && (
              <button type="button" className="link pager-hint" onClick={reset} title="Put the columns back in their first order">
                Reset column order
              </button>
            )}
            <span>
              1-{num(page.length)} / {num(data.length)}
            </span>
            {data.length > pageSize && (
              <button className="btn sm" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : 'Show all'}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Search-as-you-type picker for products, customers or suppliers. */
export function Picker<T extends { id: string }>({ items, value, onPick, label, sub, placeholder, autoFocus, onCreate, createLabel }: { items: T[]; value?: string; onPick: (x: T | undefined) => void; label: (x: T) => string; sub?: (x: T) => React.ReactNode; placeholder?: string; autoFocus?: boolean; onCreate?: (q: string) => void; createLabel?: string }) {
  const cur = items.find((x) => x.id === value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const t = q.trim().toLowerCase();
  const list = items.filter((x) => !t || label(x).toLowerCase().includes(t) || String((x as any).barcode || (x as any).phone || '').includes(t)).slice(0, 30);
  const choose = (x: T | undefined) => {
    onPick(x);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="picker" ref={ref}>
      <input
        value={open ? q : cur ? label(cur) : ''}
        placeholder={placeholder || 'Type to search…'}
        autoFocus={autoFocus}
        onFocus={() => (setOpen(true), setQ(''))}
        onChange={(e) => (setQ(e.target.value), setOpen(true), setHi(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(h + 1, list.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)));
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (list[hi]) choose(list[hi]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {cur && !open && (
        <button type="button" className="picker-x" onClick={() => choose(undefined)} aria-label="Clear">
          <X size={13} />
        </button>
      )}
      {open && (
        <div className="picker-list">
          {list.map((x, i) => (
            <button type="button" key={x.id} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => choose(x)}>
              <span>{label(x)}</span>
              {sub && <small>{sub(x)}</small>}
            </button>
          ))}
          {!list.length && <div className="picker-none">No match</div>}
          {onCreate && (
            <button type="button" className="picker-new" onClick={() => (onCreate(q), setOpen(false))}>
              + {createLabel || 'Add new'} {q && `“${q}”`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
