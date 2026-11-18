'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { AppIcon } from '../AppIcons';
import { Icon } from '../Icons';
import { Wallpaper } from '../Wallpapers';
import { useAppearance } from '../../context/AppearanceContext';
import { SHORTCUTS, MAX_SHORTCUTS, findWallpaper, type ShortcutDef } from '../../lib/appearance';
import { HomeSections, loadHomeView, saveHomeView, type HomeView } from '../HomeSections';
import { TILES as TILE_LIST } from '../../lib/nav';
import { alerts as allAlerts, balances, pnl, accountBalances, reorderSuggestions, stockState } from '../../lib/logic';
import { makeRange, rs } from '../../lib/format';

interface Tile {
  icon: string;
  label: string;
  /** Live figure, shown on the tile's tooltip and on the big cards. */
  value?: string;
  go: string;
  need?: string;
  before?: () => void;
}

/* The home layout is a list of grid cells, each holding a tile ID or nothing. Dragging a tile
   drops it into the cell under the pointer (swapping with whatever was there), so tiles always
   sit on the grid. The layout is kept in this browser. */
const LAYOUT_KEY = 'mts-home-layout-v1';
const DEFAULT_LAYOUT = TILE_LIST.map((t) => t.id);
/** Cells kept free at the end, so there is always room to drop or add a tile. */
const SPARE = 6;

function loadLayout(): (string | null)[] {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      const cells = parsed.map((x: any) => (typeof x === 'string' ? x : null));
      // Icons added since the layout was saved go into the first free place.
      DEFAULT_LAYOUT.forEach((id) => {
        if (cells.includes(id)) return;
        const free = cells.indexOf(null);
        if (free >= 0) cells[free] = id;
        else cells.push(id);
      });
      return cells;
    }
  } catch {
    /* storage blocked or corrupt: fall back to the default */
  }
  return DEFAULT_LAYOUT.slice();
}

function saveLayout(cells: (string | null)[]) {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(cells));
  } catch {
    /* the layout simply is not remembered */
  }
}

/** Trim empty cells off the end, then leave SPARE free cells (rounded up to a full row of 6). */
function withSpare(cells: (string | null)[]) {
  const out = cells.slice();
  while (out.length && out[out.length - 1] == null) out.pop();
  const target = Math.ceil((out.length + SPARE) / 6) * 6;
  while (out.length < target) out.push(null);
  return out;
}

/** Home: shortcuts on top, then one large icon per area of the shop — Property CRM's launcher. */
export function HomePage() {
  const { db, goto, denied, can } = useApp();
  const { look, update, surprise } = useAppearance();
  const tone = findWallpaper(look.wallpaper).tone;

  const today = useMemo(() => pnl(db, makeRange('today')), [db]);
  const month = useMemo(() => pnl(db, makeRange('month')), [db]);
  const bal = useMemo(() => balances(db), [db]);
  const acc = useMemo(() => accountBalances(db), [db]);
  const alerts = useMemo(() => allAlerts(db).filter((a) => !a.need || can(a.need)), [db, can]);
  const owed = db.parties.filter((p) => p.type === 'customer').reduce((a, p) => a + Math.max(0, bal.get(p.id)?.balance || 0), 0);
  const payable = db.parties.filter((p) => p.type === 'supplier').reduce((a, p) => a + Math.max(0, bal.get(p.id)?.balance || 0), 0);
  const low = db.products.filter((p) => p.active && stockState(p) !== 'ok').length;
  const toBuy = useMemo(() => reorderSuggestions(db).length, [db]);

  const VALUES: Record<string, string> = {
    dash: rs(today.netSales) + ' sold today',
    pos: db.held.length ? `${db.held.length} on hold` : 'Start a bill',
    sales: `${today.bills} bills today`,
    returns: `${db.returns.length} returns`,
    products: `${db.products.filter((p) => p.active).length} items`,
    stock: low ? `${low} low / out` : 'All in stock',
    purchases: rs(payable) + ' payable',
    suggest: `${toBuy} to reorder`,
    khata: rs(owed) + ' to collect',
    payables: rs(payable) + ' to pay',
    cash: rs(acc.Cash) + ' cash',
    expenses: rs(month.expenses) + ' this month',
    pnl: rs(month.netProfit) + ' this month',
    daily: rs(today.netSales) + ' today',
    psales: `${today.items} items today`,
    closing: 'Count the drawer',
    labels: 'Print barcodes',
    count: 'Count the shelves',
    value: 'Stock at cost',
    staff: 'Bills per person',
    alerts: `${alerts.length} alerts`,
    admin: 'Shop, users, rules',
    backup: 'Download a copy',
    appearance: 'Themes, wallpapers & icons',
    account: 'Change my PIN',
  };
  const TILES: Record<string, Tile> = Object.fromEntries(
    TILE_LIST.map((t) => [t.id, { icon: t.icon, label: t.label, go: t.go, need: t.need, value: VALUES[t.id] }])
  );

  // The layout is read after mounting: the server render has no access to this browser's storage.
  const [cells, setCells] = useState<(string | null)[]>(() => withSpare(DEFAULT_LAYOUT));
  useEffect(() => {
    setCells(withSpare(loadLayout().filter((id) => id == null || TILES[id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const commit = useCallback((next: (string | null)[]) => {
    const tidy = withSpare(next);
    setCells(tidy);
    saveLayout(tidy);
  }, []);

  const [editing, setEditing] = useState(false);
  // Icons in a grid, or cards under headings (normal or big).
  const [view, setViewState] = useState<HomeView>('icons');
  useEffect(() => setViewState(loadHomeView()), []);
  const setView = (v: HomeView) => {
    setViewState(v);
    saveHomeView(v);
  };
  const [sectionsReset, setSectionsReset] = useState(0);
  const [picker, setPicker] = useState<number | null>(null);
  const [scPicker, setScPicker] = useState(false);
  const [scDrag, setScDrag] = useState<string | null>(null);
  const [scOver, setScOver] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number | null; x: number; y: number } | null>(null);
  const pending = useRef<{ from: number; x: number; y: number; id: number } | null>(null);
  const justDragged = useRef(false);

  const visible = (id: string | null) => !!id && !!TILES[id] && !denied(TILES[id].need);
  const hidden = Object.keys(TILES).filter((id) => !cells.includes(id) && !denied(TILES[id].need));

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el && (el.closest('[data-cell]') as HTMLElement | null);
    return cell ? +(cell.dataset.cell as string) : null;
  };

  const onPointerDown = (e: React.PointerEvent, i: number) => {
    // A mouse can drag at any time; on a touch screen dragging is for "Customize", so scrolling still works.
    if (e.button !== 0 || (!editing && e.pointerType !== 'mouse')) return;
    pending.current = { from: i, x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      if (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      e.preventDefault();
      setDrag({ from: p.from, over: cellAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      pending.current = null;
      if (!drag) return;
      const to = cellAt(e.clientX, e.clientY);
      setDrag(null);
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
      if (to == null || to === p.from) return;
      const next = cells.slice();
      [next[p.from], next[to]] = [next[to], next[p.from]];
      commit(next);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag, cells, commit]);

  const open = (t: Tile) => {
    if (justDragged.current || editing) return;
    if (t.before) t.before();
    goto(t.go);
  };

  const remove = (i: number) => {
    const next = cells.slice();
    next[i] = null;
    commit(next);
  };

  const add = (id: string) => {
    if (picker == null) return;
    const next = cells.slice();
    next[picker] = id;
    commit(next);
    setPicker(null);
  };

  // Shortcuts on top: the ones chosen, in the chosen order.
  const shortcuts = look.shortcuts
    .map((id) => SHORTCUTS.find((s) => s.id === id))
    .filter((s): s is ShortcutDef => !!s && !denied(s.need));
  const scHidden = SHORTCUTS.filter((s) => !look.shortcuts.includes(s.id) && !denied(s.need));
  const runShortcut = (s: ShortcutDef) => {
    if (editing) return;
    if (s.go) goto(s.go);
  };

  const dragTile = drag ? cells[drag.from] : null;
  // Outside "Customize" and dragging, the spare places after the last icon are not drawn at all.
  let lastFilled = cells.length - 1;
  while (lastFilled >= 0 && !(cells[lastFilled] && visible(cells[lastFilled]))) lastFilled--;

  return (
    <div className="page o-home" data-tone={tone}>
      <Wallpaper id={look.wallpaper} seed={look.seed} themeKey={look.theme + (look.uniqueName || '')} />

      {/* Shortcuts on top: chosen under "Customize" or on the Appearance page. */}
      {(shortcuts.length > 0 || editing) && (
        <div className="shortcuts" data-noprint="1">
          {shortcuts.map((s, i) => (
            <div
              key={s.id}
              className={`shortcut-wrap ${scDrag === s.id ? 'sc-dragging' : ''} ${scOver === s.id && scDrag !== s.id ? 'sc-over' : ''}`}
              draggable
              title="Drag to move this shortcut"
              onDragStart={(e) => {
                setScDrag(s.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
              }}
              onDragOver={(e) => {
                if (!scDrag) return;
                e.preventDefault();
                if (scOver !== s.id) setScOver(s.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (scDrag && scDrag !== s.id) {
                  const ids = look.shortcuts.filter((x) => x !== scDrag);
                  ids.splice(ids.indexOf(s.id) + (look.shortcuts.indexOf(scDrag) < look.shortcuts.indexOf(s.id) ? 1 : 0), 0, scDrag);
                  update({ shortcuts: ids });
                }
                setScDrag(null);
                setScOver(null);
              }}
              onDragEnd={() => {
                setScDrag(null);
                setScOver(null);
              }}
            >
              <button type="button" className={`shortcut sc-v${i % 3}`} onClick={() => runShortcut(s)}>
                <span className="sc-ic">
                  <AppIcon name={s.icon} size={30} />
                </span>
                <span className="sc-t">
                  <b>{s.label}</b>
                  <small>{s.sub}</small>
                </span>
                <span className="sc-plus">
                  <Icon name="plus" />
                </span>
              </button>
              {editing && (
                <button
                  type="button"
                  className="shortcut-x"
                  aria-label={`Remove the ${s.label} shortcut`}
                  onClick={() => update({ shortcuts: look.shortcuts.filter((x) => x !== s.id) })}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {editing && shortcuts.length < MAX_SHORTCUTS && scHidden.length > 0 && (
            <button type="button" className="shortcut-add" onClick={() => setScPicker(true)}>
              <Icon name="plus" /> Add a shortcut
            </button>
          )}
        </div>
      )}

      {alerts.length > 0 && (
        <button type="button" className="home-alert" data-noprint="1" onClick={() => goto('dashboard/alerts')}>
          <b>
            {alerts.length} {alerts.length === 1 ? 'item needs' : 'items need'} attention.
          </b>{' '}
          {alerts[0].title}: {alerts[0].detail}
        </button>
      )}

      <div className="launch-bar" data-noprint="1">
        <span className="kicker">
          {!editing
            ? 'Your apps'
            : view === 'icons'
            ? 'Drag icons to move them · × removes · + adds'
            : 'Rename a heading by typing in it · drag cards between headings · × removes · + adds'}
        </span>
        <span className="spacer" />
        <span className="seg" role="group" aria-label="Home view">
          <button type="button" aria-pressed={view === 'icons'} onClick={() => setView('icons')} title="Icons in a grid">
            Icons
          </button>
          <button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')} title="Cards under headings">
            Cards
          </button>
          <button type="button" aria-pressed={view === 'big'} onClick={() => setView('big')} title="Big cards with large labels and today's figure">
            Big cards
          </button>
        </span>
        {!editing && (
          <>
            <button type="button" className="btn sm dice" onClick={surprise} title="A new matching theme, wallpaper and icon pack">
              <Icon name="dice" /> Surprise me
            </button>
            <button type="button" className="btn sm" onClick={() => goto('appearance')}>
              <Icon name="palette" /> Appearance
            </button>
          </>
        )}
        {editing && (
          <button
            type="button"
            className="btn sm"
            onClick={() => (view === 'icons' ? commit(DEFAULT_LAYOUT.slice()) : setSectionsReset((n) => n + 1))}
          >
            Reset
          </button>
        )}
        <button type="button" className={`btn sm ${editing ? 'pri' : ''}`} onClick={() => { setEditing(!editing); setPicker(null); }}>
          {editing ? <><Icon name="ok" /> Done</> : <><Icon name="grid" /> Customize</>}
        </button>
      </div>

      {view !== 'icons' && (
        <HomeSections
          tiles={TILES}
          view={view}
          editing={editing}
          denied={denied}
          openTile={open}
          runShortcut={runShortcut}
          resetKey={sectionsReset}
        />
      )}

      {view === 'icons' && (
      <nav className={`launch ${editing ? 'editing' : ''} ${drag ? 'dragging' : ''}`} aria-label="All sections">
        {(editing || drag ? cells : cells.slice(0, lastFilled + 1)).map((id, i) => {
          const t = id && visible(id) ? TILES[id] : null;
          const isOver = drag && drag.over === i && drag.from !== i;
          if (!t) {
            return (
              <div key={'empty-' + i} data-cell={i} className={`cell empty ${isOver ? 'over' : ''}`}>
                {editing && (
                  <button type="button" className="cell-add" onClick={() => setPicker(i)} aria-label="Add an icon here" disabled={!hidden.length}>
                    <Icon name="plus" />
                  </button>
                )}
              </div>
            );
          }
          return (
            <div key={id} data-cell={i} className={`cell ${isOver ? 'over' : ''} ${drag && drag.from === i ? 'lifted' : ''}`}>
              <button
                type="button"
                className="tile"
                title={t.value ? `${t.label} — ${t.value}` : t.label}
                style={{ '--i': i } as React.CSSProperties}
                onPointerDown={(e) => onPointerDown(e, i)}
                onClick={() => open(t)}
              >
                <span className="tile-ic">
                  <AppIcon name={t.icon} />
                </span>
                <span className="tile-l">{t.label}</span>
              </button>
              {editing && (
                <button type="button" className="tile-x" onClick={() => remove(i)} aria-label={`Remove ${t.label}`}>
                  ×
                </button>
              )}
            </div>
          );
        })}
      </nav>
      )}

      {/* The icon being carried. It lives on <body> so nothing on the page can pin it in place. */}
      {drag &&
        dragTile &&
        TILES[dragTile] &&
        createPortal(
          <div className="tile-ghost" data-tone={tone} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            <span className="tile-ic">
              <AppIcon name={TILES[dragTile].icon} />
            </span>
            <span className="tile-l">{TILES[dragTile].label}</span>
          </div>,
          document.body
        )}

      {scPicker && (
        <div className="overlay" onClick={() => setScPicker(false)}>
          <div className="modal tile-picker" role="dialog" aria-modal="true" aria-label="Add a shortcut" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <div>
                <h2>Add a shortcut</h2>
                <p>Up to {MAX_SHORTCUTS} shortcuts sit on top of the home screen.</p>
              </div>
              <button type="button" className="x" onClick={() => setScPicker(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-b">
              <div className="picker-grid wide">
                {scHidden.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="sc-pick"
                    onClick={() => {
                      update({ shortcuts: [...look.shortcuts, s.id].slice(0, MAX_SHORTCUTS) });
                      setScPicker(false);
                    }}
                  >
                    <span className="sc-ic">
                      <AppIcon name={s.icon} size={28} />
                    </span>
                    <span>
                      <b>{s.label}</b>
                      <small>{s.sub}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {picker != null && (
        <div className="overlay" onClick={() => setPicker(null)}>
          <div className="modal tile-picker" role="dialog" aria-modal="true" aria-label="Add an icon" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h">
              <div>
                <h2>Add an icon</h2>
                <p>Pick the icon to put in this place.</p>
              </div>
              <button type="button" className="x" onClick={() => setPicker(null)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="modal-b">
              <div className="picker-grid">
                {hidden.map((id) => (
                  <button key={id} type="button" className="tile" onClick={() => add(id)}>
                    <span className="tile-ic">
                      <AppIcon name={TILES[id].icon} />
                    </span>
                    <span className="tile-l">{TILES[id].label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
