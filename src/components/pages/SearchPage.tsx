'use client';

import React, { useMemo } from 'react';
import { Package, Receipt, Users, Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Page, Panel, Empty, Money, StockQty, Tag } from '../Shared';
import { ReceiptModal } from '../Receipt';
import { ProductForm } from '../Forms';
import { balances } from '../../lib/logic';
import { dFull, rs } from '../../lib/format';

export function SearchPage() {
  const { db, params, go, openModal, can } = useApp();
  const q = (params.get('q') || '').trim().toLowerCase();
  const bal = useMemo(() => balances(db), [db]);
  const products = q ? db.products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q) || (p.brand || '').toLowerCase().includes(q)).slice(0, 20) : [];
  const bills = q ? db.sales.filter((s) => s.no.toLowerCase().includes(q) || (s.customerName || '').toLowerCase().includes(q) || (s.customerPhone || '').includes(q) || s.items.some((i) => i.barcode === q)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20) : [];
  const parties = q ? db.parties.filter((p) => p.name.toLowerCase().includes(q) || (p.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 20) : [];
  const none = !products.length && !bills.length && !parties.length;
  return (
    <Page title={`Search: “${params.get('q') || ''}”`} sub="Products, bills, customers and suppliers.">
      {none && <Empty title="Nothing found">Try part of a name, a phone number, a bill number or a barcode.</Empty>}
      <div className="grid c2">
        {products.length > 0 && (
          <Panel title={<><Package size={15} /> Products</>} sub={`${products.length}`} tight>
            <div className="mini">
              {products.map((p) => (
                <button key={p.id} className="mini-r" onClick={() => (can('products.edit') ? openModal(<ProductForm product={p} />) : go('products/list'))}>
                  <span><b>{p.name}</b><small className="mono">{p.barcode} · {p.category}</small></span>
                  <span className="mini-v"><b>{rs(p.price)}</b><StockQty p={p} /></span>
                </button>
              ))}
            </div>
          </Panel>
        )}
        {bills.length > 0 && (
          <Panel title={<><Receipt size={15} /> Bills</>} sub={`${bills.length}`} tight>
            <div className="mini">
              {bills.map((s) => (
                <button key={s.id} className={`mini-r ${s.status === 'void' ? 'void' : ''}`} onClick={() => openModal(<ReceiptModal saleId={s.id} />)}>
                  <span><b>{s.no}</b><small>{dFull(s.date)} · {s.customerName || 'Walk-in'}</small></span>
                  <span className="mini-v">{s.status === 'void' ? <Tag tone="bad">Cancelled</Tag> : <Money v={s.total} />}</span>
                </button>
              ))}
            </div>
          </Panel>
        )}
        {parties.length > 0 && (
          <Panel title={<><Users size={15} /> Customers & suppliers</>} sub={`${parties.length}`} tight>
            <div className="mini">
              {parties.map((p) => {
                const b = bal.get(p.id)?.balance || 0;
                return (
                  <button key={p.id} className="mini-r" onClick={() => go(`khata/${p.type === 'customer' ? 'customers' : 'suppliers'}?id=${p.id}`)}>
                    <span><b>{p.type === 'supplier' && <Truck size={12} />} {p.name}</b><small>{p.phone} {p.city && '· ' + p.city}</small></span>
                    <span className="mini-v">{Math.abs(b) > 0.5 ? <b className={p.type === 'customer' ? 'info' : 'bad'}>{rs(b)}</b> : <Tag tone="good">clear</Tag>}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}
      </div>
    </Page>
  );
}
