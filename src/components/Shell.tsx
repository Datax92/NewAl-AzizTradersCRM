'use client';

import { SHOP_DETAILS } from '../lib/shop-details';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Plus, LogOut, Palette, KeyRound, Cloud, HardDrive, CircleCheck, CircleAlert, TriangleAlert, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { store, CLOUD, cloudAuth } from '../lib/db';
import { NAV, moduleOf } from '../lib/nav';
import { alerts, ROLE_LABEL } from '../lib/logic';
import { initials } from '../lib/format';
import { Login, Setup, CloudSignIn } from './Login';
import { Router } from './Router';

export function Shell() {
  const [fbUser, setFbUser] = useState<any>(CLOUD ? undefined : null);
  const [dbErr, setDbErr] = useState<string | null>(null);
  const { ready, db, me } = useApp();

  // Cloud: the computer signs in once with the shop account; only then can it read the database.
  useEffect(() => {
    if (!CLOUD) {
      store.init().catch((e) => setDbErr(String(e?.message || e)));
      return;
    }
    let off = () => {};
    cloudAuth().then(async (auth) => {
      const { onAuthStateChanged } = await import('firebase/auth');
      off = onAuthStateChanged(auth, (u: any) => {
        setFbUser(u);
        if (u) store.init().catch((e) => setDbErr(String(e?.message || e)));
      });
    });
    return () => off();
  }, []);

  if (CLOUD && fbUser === undefined) return <Loading text="Connecting…" />;
  if (CLOUD && !fbUser) return <CloudSignIn />;
  if (dbErr) return <Loading text={'Could not open the database: ' + dbErr} />;
  if (!ready) return <Loading text="Loading…" />;
  if (!db.users.length) return <Setup />;
  if (!me) return <Login />;
  return <App />;
}

function Loading({ text }: { text: string }) {
  return (
    <div className="login-wrap" role="status">
      <div style={{ textAlign: 'center' }}>
        <div className="spin" />
        <b>{SHOP_DETAILS.shopName}</b>
        <span>{text}</span>
      </div>
    </div>
  );
}

function App() {
  const { page, tab, syncError, modals, toastState } = useApp();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
    window.scrollTo(0, 0);
  }, [page, tab]);
  return (
    <>
      <div className="shell">
        <Navbar />
        {syncError && (
          <div className="dbdown" role="alert">
            <b>Database not connected.</b> {syncError}
          </div>
        )}
        <main id="main" ref={mainRef} className={page === 'home' ? 'home' : ''}>
          <Router />
        </main>
      </div>
      <div id="layer">
        {modals.map((m, i) => (
          <React.Fragment key={i}>{m}</React.Fragment>
        ))}
      </div>
      {toastState && <Toast key={toastState.n} msg={toastState.msg} tone={toastState.tone} />}
    </>
  );
}

function Toast({ msg, tone }: { msg: string; tone: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const Ic = tone === 'bad' ? CircleAlert : tone === 'warn' ? TriangleAlert : tone === 'info' ? Info : CircleCheck;
  return (
    <div className={`toast t-${tone} ${on ? 'on' : ''}`} role="status">
      <Ic />
      <span>{msg}</span>
    </div>
  );
}

type MenuId = 'user' | 'new' | 'mods';

/** Property CRM's navbar: apps button, logo, the open module's name and its menus, then search,
    new, alerts and the user. */
function Navbar() {
  const { page, tab, go, me, can, db, settings, saving, signOut } = useApp();
  const mod = moduleOf(page);
  const [menu, setMenu] = useState<{ id: MenuId; x: number; y: number } | null>(null);
  const [q, setQ] = useState('');
  const al = useMemo(() => alerts(db).filter((a) => !a.need || can(a.need)), [db, can]);
  const tabs = mod ? mod.tabs.filter((t) => !t.need || can(t.need)) : [];
  const current = tabs.find((t) => t.id === tab) ? tab : tabs[0]?.id;
  const brand = page === 'home' ? settings.shopName : mod ? mod.label : page === 'appearance' ? 'Appearance' : settings.shopName;

  const drop = (id: MenuId, width: number) => (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu(menu?.id === id ? null : { id, x: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), y: r.bottom + 2 });
  };

  return (
    <header className="o-nav" id="topbar" data-noprint="1">
      <button type="button" className="o-nav-apps" title="Home menu" aria-label="Home menu" onClick={() => go('home')}>
        <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden="true">
          {[2, 7, 12].map((y) => [2, 7, 12].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="2.4" height="2.4" rx=".5" />))}
        </svg>
      </button>
      <button type="button" className="o-nav-logo" title={settings.shopName} aria-label="Home" onClick={() => go('home')}>
        <Logo size={22} />
      </button>
      <button type="button" className="o-nav-brand" onClick={() => (mod && tabs[0] ? go(`${mod.id}/${tabs[0].id}`) : go('home'))} title={brand}>
        <span className="o-nav-brand-t">{brand}</span>
      </button>

      {mod && (
        <>
          <nav className="o-nav-menu" aria-label="Section menu">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={`o-nav-item ${current === t.id ? 'on' : ''}`} onClick={() => go(`${mod.id}/${t.id}`)}>
                {t.label}
              </button>
            ))}
          </nav>
        </>
      )}
      <button type="button" className="o-nav-ic burger" aria-label="Menu" onClick={drop('mods', 250)}>
        <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
        </svg>
      </button>

      <span className="spacer" />

      <form
        className="navsearch-f"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go('search?q=' + encodeURIComponent(q.trim()));
        }}
      >
        <input className="navsearch" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search everything" />
      </form>

      {can('pos') && (
        <button type="button" className="o-nav-ic" title="New record" aria-label="New record" onClick={drop('new', 250)}>
          <Plus size={16} />
        </button>
      )}
      <button type="button" className="o-nav-ic" title="Alerts" aria-label="Alerts" onClick={() => go('dashboard/alerts')}>
        <Bell size={16} />
        {al.length > 0 && <span className="dot">{al.length > 9 ? '9+' : al.length}</span>}
      </button>
      <button type="button" className="o-nav-user" onClick={drop('user', 250)}>
        <span className="ini">{initials(me!.name)}</span>
        <span className="nm">{me!.name}</span>
      </button>

      {menu && <div className="scrim" onClick={() => setMenu(null)} />}
      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={() => setMenu(null)}>
          {menu.id === 'user' && (
            <>
              <h5>
                {ROLE_LABEL[me!.role]} · {me!.counter}
              </h5>
              <div className="menu-note">
                {CLOUD ? <Cloud size={14} /> : <HardDrive size={14} />}
                {CLOUD ? 'Cloud database — both counters live' : 'Saved on this computer only'}
                {saving && ' · saving…'}
              </div>
              <div className="sep" />
              <button onClick={() => go('appearance')}>
                <Palette className="ic" /> Appearance
              </button>
              <button onClick={() => go('settings/me')}>
                <KeyRound className="ic" /> Change my PIN
              </button>
              <button onClick={signOut}>
                <LogOut className="ic" /> Sign out
              </button>
              {CLOUD && (
                <button
                  onClick={async () => {
                    const { signOut: so } = await import('firebase/auth');
                    signOut();
                    so(await cloudAuth());
                  }}
                >
                  <Cloud className="ic" /> Disconnect this computer
                </button>
              )}
            </>
          )}
          {menu.id === 'new' && (
            <>
              <h5>New record</h5>
              <button onClick={() => go('pos/new')}>Bill</button>
              {can('stock') && <button onClick={() => go('stock/entry')}>Stock IN / OUT</button>}
              {can('khata') && <button onClick={() => go('khata/customers?pay=1')}>Khata payment</button>}
              {can('purchases') && <button onClick={() => go('purchases/orders?new=1')}>Purchase</button>}
              {can('expenses') && <button onClick={() => go('expenses/list?new=1')}>Expense</button>}
              {can('products.edit') && <button onClick={() => go('products/list?new=1')}>Product</button>}
            </>
          )}
          {menu.id === 'mods' && (
            <>
              <button onClick={() => go('home')}>Home</button>
              {NAV.filter((m) => (!m.need || can(m.need)) && m.tabs.some((t) => !t.need || can(t.need))).map((m) => (
                <button key={m.id} onClick={() => go(m.id)}>
                  {m.label}
                </button>
              ))}
              {mod && tabs.length > 1 && (
                <>
                  <div className="sep" />
                  <h5>{mod.label}</h5>
                  {tabs.map((t) => (
                    <button key={t.id} className={current === t.id ? 'on' : ''} onClick={() => go(`${mod.id}/${t.id}`)}>
                      {t.label}
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </header>
  );
}

/** The shop's mark: a wrench crossing a screwdriver, in the navbar's navy and red. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M21.5 4.5a6 6 0 0 0-5.6 8.2L5.6 23a2.1 2.1 0 0 0 3 3l10.3-10.3a6 6 0 0 0 7.8-7.3l-3.4 3.4-2.9-.7-.7-2.9 3.4-3.4a6 6 0 0 0-1.6-.3z" fill="#1F2456" />
      <path d="M5 6.5l3.5 1.2 7.6 7.6-2.2 2.2-7.6-7.6z" fill="#D7262E" />
    </svg>
  );
}
