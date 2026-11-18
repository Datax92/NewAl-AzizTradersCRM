'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, UserRound, Store, Mail } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { store, cloudAuth, DEMO_MODE, type Op } from '../lib/db';
import { DEFAULT_SETTINGS, ROLE_LABEL, shopContactText } from '../lib/logic';
import { hashPin } from '../lib/format';
import { buildDemo, DEMO_ACCOUNTS } from '../lib/seed';
import type { User } from '../lib/types';
import { COLLS } from '../lib/types';
import CursorGrid from './effects/CursorGrid';
import { Logo } from './Shell';

/** The same sign-in card as Property CRM: cursor grid, drifting colour, one white card. */
function LoginFrame({ badge, title, en, ur, children }: { badge: string; title: string; en: string; ur: string; children: React.ReactNode }) {
  const { settings } = useApp();
  return (
    <div className="property-login-viewport">
      <CursorGrid color="#1F2456" cellSize={65} radius={180} gridOpacity={0.045} fillOpacity={0.03} maxOpacity={0.7} clickPulse={true} />
      <div className="property-drift-blob blob-1" aria-hidden="true" />
      <div className="property-drift-blob blob-2" aria-hidden="true" />
      <div className="property-login-card">
        <div className="property-brand-header">
          <div className="shop-banner">
            <span className="shop-banner-mark">
              <Logo size={40} />
            </span>
            <span className="shop-banner-t">
              <b>{settings.shopName}</b>
              <small>{settings.tagline}</small>
            </span>
          </div>
          <div className="property-role-badge">
            <ShieldCheck size={14} className="badge-icon" />
            <span>{badge}</span>
          </div>
          <h1 className="property-portal-title">{title}</h1>
          <div className="property-portal-subtitles">
            <p className="sub-en">{en}</p>
            <p className="sub-ur" dir="rtl">
              {ur}
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { db, settings, signIn } = useApp();
  const users = db.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name));
  const [counter, setCounter] = useState<string>(() => (typeof window !== 'undefined' && localStorage.getItem('mts-counter')) || settings.counters[0]);
  const [uid, setUid] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [fails, setFails] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);

  const [demoLogins, setDemoLogins] = useState<(typeof DEMO_ACCOUNTS[number] & { id: string })[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!DEMO_MODE) return;
    Promise.all(DEMO_ACCOUNTS.map(async (account) => {
      const user = db.users.find((u) => u.active && u.username === account.username && u.role === account.role);
      return user && user.pinHash === await hashPin(account.username, account.pin)
        ? { ...account, id: user.id } : null;
    })).then((accounts) => {
      if (!cancelled) setDemoLogins(accounts.filter((a) => a !== null));
    });
    return () => { cancelled = true; };
  }, [db.users]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find((u) => u.id === uid);
    if (!user || !pin) return setErr('Choose your name and enter your PIN / اپنا نام چنیں اور پن درج کریں');
    if (Date.now() < lockUntil) return setErr(`Too many attempts. Try again in ${Math.ceil((lockUntil - Date.now()) / 1000)} seconds.`);
    setBusy(true);
    const ok = (await hashPin(user.username, pin)) === user.pinHash;
    setBusy(false);
    if (ok) {
      localStorage.setItem('mts-counter', counter);
      signIn({ userId: user.id, name: user.name, role: user.role, counter }, remember);
      return;
    }
    const f = fails + 1;
    setPin('');
    if (f >= 5) {
      setFails(0);
      setLockUntil(Date.now() + 30000);
      setErr('Wrong PIN 5 times — locked for 30 seconds.');
    } else {
      setFails(f);
      setErr('Incorrect PIN / پن درست نہیں ہے');
    }
  };

  return (
    <LoginFrame badge="STAFF SIGN-IN" title="Point of Sale & Inventory" en="Choose your counter and name, then enter your PIN" ur="اپنا کاؤنٹر اور نام چنیں، پھر پن درج کریں">
      {err && (
        <div className="property-auth-alert error" role="alert">
          {err}
        </div>
      )}
      {demoLogins.length > 0 && (
        <section className="demo-logins" aria-label="Demo accounts">
          <b>Try a demo account</b>
          <p>Choose a person to fill the login fields, then click Sign in. Sample data is saved only in this browser.</p>
          <div className="demo-login-buttons">
            {demoLogins.map((account) => (
              <button key={account.id} type="button" aria-pressed={uid === account.id}
                onClick={() => { setUid(account.id); setPin(account.pin); setErr(''); }}>
                <strong>{account.role === 'owner' ? 'Admin / Owner' : ROLE_LABEL[account.role]}</strong>
                <span>{account.name} · PIN {account.pin}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <form onSubmit={submit} className="property-login-form" noValidate>
        <div className="property-input-field">
          <label className="property-field-label">
            <span>Counter</span>
            <span className="ur-hint" dir="rtl">(کاؤنٹر)</span>
          </label>
          <div className="seg full">
            {settings.counters.map((c) => (
              <button type="button" key={c} aria-pressed={counter === c} onClick={() => setCounter(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="property-input-field">
          <label className="property-field-label" htmlFor="login-user">
            <span>Name</span>
            <span className="ur-hint" dir="rtl">(نام)</span>
          </label>
          <div className="property-input-wrap">
            <UserRound className="input-left-icon" size={17} />
            <select id="login-user" className="property-text-input" value={uid} onChange={(e) => (setUid(e.target.value), setErr(''))} autoFocus>
              <option value="">Choose…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {ROLE_LABEL[u.role]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="property-input-field">
          <label className="property-field-label" htmlFor="login-pin">
            <span>PIN</span>
            <span className="ur-hint" dir="rtl">(پن)</span>
          </label>
          <div className="property-input-wrap">
            <Lock className="input-left-icon" size={17} />
            <input id="login-pin" type="password" inputMode="numeric" autoComplete="current-password" className="property-text-input" placeholder="••••" value={pin} onChange={(e) => (setPin(e.target.value.replace(/\D/g, '').slice(0, 6)), setErr(''))} />
          </div>
        </div>
        <label className="chk login-keep">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in on this computer
        </label>
        <button type="submit" className="property-submit-btn" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <div className="property-card-footer">
        <span className="property-footer-note">{settings.address}<br />{shopContactText(settings)}{settings.whatsappUrl && <><br /><a href={settings.whatsappUrl} target="_blank" rel="noreferrer">Contact on WhatsApp</a></>}<br />Forgot your PIN? The owner can reset it under Admin → Users & roles.</span>
      </div>
    </LoginFrame>
  );
}

export function Setup() {
  const { signIn } = useApp();
  const [shop, setShop] = useState(DEFAULT_SETTINGS.shopName);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('owner');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr('Enter the owner’s name.');
    if (!/^[a-z0-9._-]{3,}$/i.test(username)) return setErr('Username: at least 3 letters or numbers, no spaces.');
    if (!/^\d{4,6}$/.test(pin)) return setErr('PIN must be 4 to 6 digits.');
    if (pin !== pin2) return setErr('The two PINs do not match.');
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const owner: User = { id: 'u-owner', name: name.trim(), username: username.trim().toLowerCase(), role: 'owner', pinHash: await hashPin(username, pin), active: true, createdAt: now };
      const ops: Op[] = [];
      if (demo) {
        const { db } = await buildDemo(owner.name);
        db.settings[0].shopName = shop.trim() || DEFAULT_SETTINGS.shopName;
        db.users.unshift(owner);
        COLLS.forEach((c) => (db as any)[c].forEach((d: any) => ops.push({ t: 'put', c, d })));
      } else {
        ops.push({ t: 'put', c: 'settings', d: { ...DEFAULT_SETTINGS, shopName: shop.trim() || DEFAULT_SETTINGS.shopName } });
        ops.push({ t: 'put', c: 'users', d: owner });
        ops.push({ t: 'put', c: 'audit', d: { id: 'a-setup', date: now, userName: owner.name, action: 'Shop set up', detail: 'Owner account created', tone: 'info' } });
      }
      await store.commit(ops);
      signIn({ userId: owner.id, name: owner.name, role: 'owner', counter: DEFAULT_SETTINGS.counters[0] }, false);
    } catch (e: any) {
      setErr(e?.message || 'Could not set up the shop.');
      setBusy(false);
    }
  };

  const input = (id: string, label: string, ur: string, v: string, set: (s: string) => void, Icon: any, type = 'text', ph = '') => (
    <div className="property-input-field">
      <label className="property-field-label" htmlFor={id}>
        <span>{label}</span>
        <span className="ur-hint" dir="rtl">
          ({ur})
        </span>
      </label>
      <div className="property-input-wrap">
        <Icon className="input-left-icon" size={17} />
        <input id={id} type={type} inputMode={type === 'password' ? 'numeric' : undefined} className="property-text-input" placeholder={ph} value={v} onChange={(e) => (set(type === 'password' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value), setErr(''))} />
      </div>
    </div>
  );

  return (
    <LoginFrame badge="FIRST-TIME SETUP" title="Set up your shop" en="Create the owner account. Everything can be changed later." ur="مالک کا اکاؤنٹ بنائیں۔ بعد میں سب کچھ بدلا جا سکتا ہے۔">
      {err && (
        <div className="property-auth-alert error" role="alert">
          {err}
        </div>
      )}
      <form onSubmit={submit} className="property-login-form" noValidate>
        {input('s-shop', 'Shop name', 'دکان کا نام', shop, setShop, Store)}
        {input('s-name', 'Owner’s name', 'مالک کا نام', name, setName, UserRound, 'text', 'e.g. Ahmed Raza')}
        {input('s-user', 'Username', 'یوزر نیم', username, setUsername, Mail)}
        <div className="setup-pins">
          {input('s-pin', 'PIN (4–6 digits)', 'پن', pin, setPin, Lock, 'password', '••••')}
          {input('s-pin2', 'PIN again', 'دوبارہ', pin2, setPin2, Lock, 'password', '••••')}
        </div>
        <label className="chk login-keep">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Fill with sample data to try it out
        </label>
        {demo && <p className="setup-hint">Sample tools, customers, suppliers and two months of bills. Staff: manager / 2222, hassan / 1111, umer / 3333. Clear it from Admin → Backup before going live.</p>}
        <button type="submit" className="property-submit-btn" disabled={busy}>
          {busy ? 'Setting up...' : 'Create shop & sign in'}
        </button>
      </form>
    </LoginFrame>
  );
}

export function CloudSignIn() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(await cloudAuth(), email.trim(), pass);
    } catch (e: any) {
      setErr(e?.code === 'auth/network-request-failed' ? 'No internet connection / انٹرنیٹ کنکشن دستیاب نہیں' : 'Incorrect email or password / ای میل یا پاس ورڈ درست نہیں ہے');
      setBusy(false);
    }
  };
  return (
    <LoginFrame badge="CONNECT THIS COMPUTER" title="Shop account" en="Sign in once with the shop’s account; staff then use their PIN" ur="دکان کے اکاؤنٹ سے ایک بار سائن اِن کریں">
      {err && (
        <div className="property-auth-alert error" role="alert">
          {err}
        </div>
      )}
      <form onSubmit={submit} className="property-login-form" noValidate>
        <div className="property-input-field">
          <label className="property-field-label" htmlFor="c-email">
            <span>Email</span>
            <span className="ur-hint" dir="rtl">(ای میل)</span>
          </label>
          <div className="property-input-wrap">
            <Mail className="input-left-icon" size={17} />
            <input id="c-email" type="email" className="property-text-input" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
        </div>
        <div className="property-input-field">
          <label className="property-field-label" htmlFor="c-pass">
            <span>Password</span>
            <span className="ur-hint" dir="rtl">(پاس ورڈ)</span>
          </label>
          <div className="property-input-wrap">
            <Lock className="input-left-icon" size={17} />
            <input id="c-pass" type="password" className="property-text-input" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
        </div>
        <button type="submit" className="property-submit-btn" disabled={busy}>
          {busy ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </LoginFrame>
  );
}
