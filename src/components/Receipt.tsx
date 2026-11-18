'use client';

import React, { useState } from 'react';
import { Printer, MessageCircle, Copy, FileText, ShoppingCart, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Sale, Settings, DB } from '../lib/types';
import { rs, rsr, num, dFull, inWords, waLink, waNumber } from '../lib/format';
import { payOf, returnsFor, balances, shopContactText } from '../lib/logic';
import { Modal, MethodChip, Tag, Money } from './Shared';
import { Printable, printNow, type Paper } from './Print';
import { Logo } from './Shell';
import { BarcodeSVG } from './Barcode';
import { BillActionButtons } from './BillActions';

export function receiptText(s: Sale, st: Settings, owe?: number): string {
  const lines = [
    `*${st.shopName}*`,
    st.address,
    `Bill: *${s.no}*  ·  ${dFull(s.date)}`,
    s.customerName ? `Customer: ${s.customerName}` : '',
    '',
    ...s.items.map((i) => `${i.name}\n   ${num(i.qty)} × ${rsr(i.price)}${i.disc ? ` − ${rsr(i.disc)}` : ''} = *${rsr(i.price * i.qty - i.disc)}*`),
    '',
    s.discount ? `Discount: −${rsr(s.discount)}` : '',
    `*Total: ${rsr(s.total)}*`,
    ...s.payments.map((p) => `${p.method === 'Khata' ? 'On khata (credit)' : 'Paid by ' + p.method}: ${rsr(p.amount)}`),
    owe !== undefined && owe > 0 ? `Your khata balance now: ${rsr(owe)}` : '',
    '',
    st.receiptFooter,
    st.phone ? `📞 ${shopContactText(st)}` : '',
    st.whatsappUrl ? `WhatsApp: ${st.whatsappUrl}` : '',
  ];
  return lines.filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
}

export function ThermalSlip({ s, st, db, width }: { s: Sale; st: Settings; db: DB; width: '80mm' | '58mm' }) {
  const items = s.items.reduce((a, i) => a + i.qty, 0);
  const gross = s.items.reduce((a, i) => a + i.price * i.qty, 0);
  const saved = gross - s.total;
  const k = payOf(s, 'Khata');
  const owe = s.customerId ? balances(db).get(s.customerId)?.balance : undefined;
  return (
    <div className={`slip w${width}`}>
      <div className="slip-c">
        <b className="slip-co">{st.shopName}</b>
        <span>{st.tagline}</span>
        <span>{st.address}</span>
        <span>{shopContactText(st)}{st.whatsapp && st.whatsapp !== st.phone ? ` · WA ${st.whatsapp}` : ''}</span>
        {st.whatsappUrl && <span>WhatsApp: {st.whatsappUrl.replace('https://', '')}</span>}
        {st.ntn && <span>NTN {st.ntn}</span>}
      </div>
      <div className="slip-rule" />
      <div className="slip-row"><span>Bill</span><b>{s.no}</b></div>
      <div className="slip-row"><span>Date</span><b>{dFull(s.date)}</b></div>
      <div className="slip-row"><span>Counter</span><b>{s.counter} · {s.userName}</b></div>
      {s.customerName && <div className="slip-row"><span>Customer</span><b>{s.customerName}</b></div>}
      {s.status === 'void' && <div className="slip-void">CANCELLED</div>}
      <div className="slip-rule" />
      {s.items.map((i, n) => (
        <div key={n} className="slip-item">
          <div className="slip-in">{i.name}</div>
          <div className="slip-row">
            <span>{num(i.qty)} × {num(i.price)}{i.disc ? ` − ${num(i.disc)}` : ''}</span>
            <b>{num(i.price * i.qty - i.disc)}</b>
          </div>
        </div>
      ))}
      <div className="slip-rule" />
      <div className="slip-row"><span>Items</span><b>{num(items)}</b></div>
      <div className="slip-row"><span>Sub-total</span><b>{num(s.subtotal)}</b></div>
      {s.discount > 0 && <div className="slip-row"><span>Discount</span><b>−{num(s.discount)}</b></div>}
      <div className="slip-row slip-tot"><span>TOTAL Rs</span><b>{num(s.total)}</b></div>
      {s.payments.map((p, n) => (
        <div key={n} className="slip-row"><span>{p.method === 'Khata' ? 'On khata' : p.method}</span><b>{num(p.amount)}</b></div>
      ))}
      {!!s.cashReceived && s.cashReceived > 0 && <div className="slip-row"><span>Cash received</span><b>{num(s.cashReceived)}</b></div>}
      {!!s.change && s.change > 0 && <div className="slip-row"><span>Change</span><b>{num(s.change)}</b></div>}
      {k > 0 && owe !== undefined && <div className="slip-row"><span>Khata balance</span><b>{num(owe)}</b></div>}
      {saved > 0 && <div className="slip-save">You saved Rs {num(saved)}</div>}
      <div className="slip-words">{inWords(s.total)}</div>
      <div className="slip-bc">
        <BarcodeSVG value={s.no} height={34} showText={false} />
      </div>
      <div className="slip-c slip-foot">{st.receiptFooter}</div>
      <div className="slip-c slip-soft">{st.shopName} POS</div>
    </div>
  );
}

export function A4Invoice({ s, st, db }: { s: Sale; st: Settings; db: DB }) {
  const k = payOf(s, 'Khata');
  const owe = s.customerId ? balances(db).get(s.customerId)?.balance : undefined;
  const cust = s.customerId ? db.parties.find((p) => p.id === s.customerId) : undefined;
  return (
    <div className="a4inv">
      <div className="a4-h">
        <div className="a4-co">
          <Logo size={44} />
          <div>
            <b>{st.shopName}</b>
            <span>{st.tagline}</span>
            <span>{st.address}</span>
            <span>{shopContactText(st)}{st.ntn ? ` · NTN ${st.ntn}` : ''}</span>
            {st.whatsappUrl && <span><a href={st.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp: {st.whatsappUrl.replace('https://', '')}</a></span>}
          </div>
        </div>
        <div className="a4-t">
          <h2>{s.status === 'void' ? 'CANCELLED INVOICE' : k > 0 ? 'CREDIT INVOICE' : 'SALES INVOICE'}</h2>
          <span>No. <b>{s.no}</b></span>
          <span>{dFull(s.date)}</span>
        </div>
      </div>
      <div className="a4-to">
        <div>
          <small>Bill to</small>
          <b>{s.customerName || 'Walk-in customer'}</b>
          {(cust?.shop && cust.shop !== cust.name) && <span>{cust.shop}</span>}
          {cust?.city && <span>{cust.city}</span>}
          {s.customerPhone && <span>{s.customerPhone}</span>}
        </div>
        <div>
          <small>Served by</small>
          <b>{s.userName}</b>
          <span>{s.counter}</span>
        </div>
      </div>
      <table className="a4-tbl">
        <thead>
          <tr>
            <th>#</th><th>Item</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Discount</th><th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((i, n) => (
            <tr key={n}>
              <td>{n + 1}</td><td>{i.name}</td><td className="r">{num(i.qty)}</td><td className="r">{num(i.price)}</td><td className="r">{i.disc ? num(i.disc) : '—'}</td><td className="r">{num(i.price * i.qty - i.disc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="a4-sum">
        <div className="a4-words">
          <small>Amount in words</small>
          {inWords(s.total)}
          <div className="a4-pay">
            {s.payments.map((p, n) => (
              <span key={n}>{p.method === 'Khata' ? 'On khata (credit)' : `Paid by ${p.method}`}: <b>{rsr(p.amount)}</b></span>
            ))}
            {k > 0 && owe !== undefined && <span>Customer khata balance after this bill: <b>{rsr(owe)}</b></span>}
          </div>
        </div>
        <div className="a4-tot">
          <div><span>Sub-total</span><b>{rsr(s.subtotal)}</b></div>
          {s.discount > 0 && <div><span>Discount</span><b>−{rsr(s.discount)}</b></div>}
          <div className="g"><span>Total</span><b>{rsr(s.total)}</b></div>
        </div>
      </div>
      <div className="a4-foot">
        <span>{st.receiptFooter}</span>
        <span className="sig">Authorised signature</span>
      </div>
    </div>
  );
}

/** After a sale (or from the bills list): print, share on WhatsApp, copy. */
export function ReceiptModal({ saleId, fresh }: { saleId: string; fresh?: boolean }) {
  const { db, settings, closeModal, go, toast } = useApp();
  const s = db.sales.find((x) => x.id === saleId);
  const [paper, setPaper] = useState<Paper>(() => ((typeof window !== 'undefined' && (localStorage.getItem('mts-paper') as Paper)) || '80mm'));
  const [phone, setPhone] = useState(s?.customerPhone || '');
  const [copied, setCopied] = useState(false);
  if (!s) return null;
  const owe = s.customerId ? balances(db).get(s.customerId)?.balance : undefined;
  const text = receiptText(s, settings, owe);
  const rets = returnsFor(db, s.id);
  const setP = (p: Paper) => {
    setPaper(p);
    localStorage.setItem('mts-paper', p);
  };
  const doc = paper === 'A4' ? <A4Invoice s={s} st={settings} db={db} /> : <ThermalSlip s={s} st={settings} db={db} width={paper as '80mm' | '58mm'} />;

  return (
    <Modal
      size="wide"
      title={
        <>
          {fresh ? <span className="okmark"><Check size={16} /></span> : null} Bill {s.no} {s.status === 'void' && <Tag tone="bad">Cancelled</Tag>}
        </>
      }
      sub={fresh ? 'Sale saved · stock updated · ready to print' : `${dFull(s.date)} · ${s.counter} · ${s.userName}`}
      foot={
        <>
          {fresh && (
            <button className="btn pri" onClick={() => (closeModal(), go('pos/new'))} autoFocus>
              <ShoppingCart size={15} /> Next customer
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>
            Close
          </button>
        </>
      }
    >
      <div className="rcpt">
        <div className="rcpt-prev">
          <div className="seg" style={{ marginBottom: 12 }}>
            {(['80mm', '58mm', 'A4'] as Paper[]).map((p) => (
              <button key={p} aria-pressed={paper === p} onClick={() => setP(p)}>
                {p === 'A4' ? 'A4 invoice' : p + ' slip'}
              </button>
            ))}
          </div>
          <div className={`rcpt-paper ${paper === 'A4' ? 'a4' : ''}`}>{doc}</div>
        </div>
        <div className="rcpt-side">
          <div className="rcpt-total">
            <small>Total</small>
            <b>{rs(s.total)}</b>
            <div className="mchips">
              {s.payments.map((p, i) => (
                <MethodChip key={i} m={p.method} amount={p.amount} />
              ))}
            </div>
            {!!s.change && s.change > 0 && (
              <div className="change">
                Give change <b>{rs(s.change)}</b>
              </div>
            )}
          </div>
          <button className="btn pri big" onClick={() => printNow(paper)}>
            <Printer size={16} /> Print {paper === 'A4' ? 'invoice' : 'receipt'}
          </button>
          <div className="wa-box">
            <label className="fld">
              <span>Customer WhatsApp number</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" inputMode="tel" />
            </label>
            <a
              className={`btn wa big ${waNumber(phone).length < 11 ? 'disabled' : ''}`}
              href={waNumber(phone).length >= 11 ? waLink(phone, text) : undefined}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (waNumber(phone).length < 11) {
                  e.preventDefault();
                  toast('Enter the customer’s mobile number first.', 'warn');
                }
              }}
            >
              <MessageCircle size={16} /> Send bill on WhatsApp
            </a>
            <small className="muted">Opens WhatsApp with the bill typed out — just press send.</small>
          </div>
          <button
            className="btn"
            onClick={() => {
              navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy bill as text'}
          </button>
          {rets.length > 0 && (
            <div className="note">
              <FileText size={15} />
              <span>
                {rets.length} return{rets.length > 1 ? 's' : ''} on this bill: <Money v={-rets.reduce((a, r) => a + r.total, 0)} tone="bad" /> ({rets.map((r) => r.no).join(', ')})
              </span>
            </div>
          )}
          {!fresh && <BillActionButtons sale={s} />}
          {s.status === 'void' && (
            <div className="note bad">
              Cancelled by {s.voidedBy}: {s.voidReason}
            </div>
          )}
        </div>
      </div>
      <Printable>{doc}</Printable>
    </Modal>
  );
}
