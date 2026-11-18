'use client';

import React, { useState } from 'react';
import { Undo2, Ban } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { PayMethod, Sale } from '../lib/types';
import { buildReturn, buildVoid, returnedQty, returnsFor, lineNet, payOf } from '../lib/logic';
import { rs, num, round2 } from '../lib/format';
import { Modal, NumInput, Field, Money } from './Shared';

export function BillActionButtons({ sale }: { sale: Sale }) {
  const { can, openModal, confirm, commit, me, db, closeModal } = useApp();
  if (sale.status === 'void') return null;
  const anyLeft = sale.items.some((i) => i.qty - returnedQty(db, sale.id, i.productId) > 0);
  const hasReturns = returnsFor(db, sale.id).length > 0;
  const cancel = async () => {
    let reason = '';
    const ok = await confirm({
      title: `Cancel bill ${sale.no}?`,
      danger: true,
      ok: 'Cancel bill',
      body: (
        <div>
          <p>The bill stays on record marked <b>Cancelled</b>. Items go back into stock{payOf(sale, 'Khata') ? ' and the khata amount is removed' : ''}. Give back {rs(sale.total - payOf(sale, 'Khata'))} to the customer.</p>
          <label className="fld">
            <span>Reason</span>
            <input autoFocus onChange={(e) => (reason = e.target.value)} placeholder="e.g. wrong item billed" />
          </label>
        </div>
      ),
    });
    if (!ok) return;
    if (await commit(buildVoid(db, me!, sale, reason || 'No reason given'), `Bill ${sale.no} cancelled — stock returned`)) closeModal();
  };
  return (
    <div className="billacts">
      {can('returns') && anyLeft && (
        <button className="btn" onClick={() => openModal(<ReturnForm sale={sale} />)}>
          <Undo2 size={15} /> Return items
        </button>
      )}
      {can('void') && !hasReturns && (
        <button className="btn gh bad-t" onClick={cancel} title="Owner only">
          <Ban size={15} /> Cancel bill
        </button>
      )}
    </div>
  );
}

export function ReturnForm({ sale }: { sale: Sale }) {
  const { db, me, commit, closeModal } = useApp();
  const left = sale.items.map((i) => ({ ...i, left: i.qty - returnedQty(db, sale.id, i.productId) }));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [damaged, setDamaged] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<PayMethod>(payOf(sale, 'Khata') > 0 && sale.customerId ? 'Khata' : 'Cash');
  const [reason, setReason] = useState('');
  const sub = sale.subtotal || 1;
  const unit = (i: (typeof left)[number]) => (lineNet(i) - (sale.discount * lineNet(i)) / sub) / i.qty;
  const total = round2(left.reduce((a, i) => a + unit(i) * (qty[i.productId] || 0), 0));
  const save = async () => {
    const lines = left.filter((i) => (qty[i.productId] || 0) > 0).map((i) => ({ productId: i.productId, qty: Math.min(i.left, qty[i.productId]), restock: !damaged[i.productId] }));
    if (!lines.length) return;
    const { ret, ops } = buildReturn(db, me!, sale, lines, method, reason);
    if (await commit(ops, `Return ${ret.no} saved — ${rs(ret.total)} ${method === 'Khata' ? 'taken off khata' : 'refunded in ' + method}`)) closeModal();
  };
  return (
    <Modal
      size="wide"
      title={`Return items from ${sale.no}`}
      sub={`${sale.customerName || 'Walk-in'} · refunds use the price actually paid, after discounts`}
      foot={
        <>
          <span className="spacer" />
          <button className="btn" onClick={closeModal}>Cancel</button>
          <button className="btn pri" onClick={save} disabled={total <= 0}>
            <Undo2 size={15} /> Return {total > 0 ? rs(total) : ''}
          </button>
        </>
      }
    >
      <table className="tbl">
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Sold</th>
            <th className="r">Can return</th>
            <th className="r">Paid per unit</th>
            <th className="r">Return qty</th>
            <th>Condition</th>
            <th className="r">Refund</th>
          </tr>
        </thead>
        <tbody>
          {left.map((i) => (
            <tr key={i.productId} className={i.left <= 0 ? 'dim' : ''}>
              <td>{i.name}</td>
              <td className="r">{num(i.qty)}</td>
              <td className="r">{num(i.left)}</td>
              <td className="r">{rs(unit(i))}</td>
              <td className="r">
                {i.left > 0 ? (
                  <span className="qtybox sm">
                    <NumInput value={qty[i.productId] || 0} onChange={(n) => setQty((q) => ({ ...q, [i.productId]: Math.max(0, Math.min(i.left, Math.floor(n))) }))} min={0} max={i.left} />
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {i.left > 0 && (
                  <span className="seg">
                    <button aria-pressed={!damaged[i.productId]} className="g" onClick={() => setDamaged((d) => ({ ...d, [i.productId]: false }))}>
                      Good — back to shelf
                    </button>
                    <button aria-pressed={!!damaged[i.productId]} className="r" onClick={() => setDamaged((d) => ({ ...d, [i.productId]: true }))}>
                      Damaged
                    </button>
                  </span>
                )}
              </td>
              <td className="r">{qty[i.productId] ? <Money v={-unit(i) * qty[i.productId]} tone="bad" /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="formgrid" style={{ marginTop: 16 }}>
        <Field label="Refund by">
          <select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {sale.customerId && <option value="Khata">Take off customer’s khata</option>}
            <option>Cash</option>
            <option>Bank</option>
            <option>JazzCash</option>
            <option>Easypaisa</option>
          </select>
        </Field>
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong model, faulty" />
        </Field>
      </div>
      <p className="muted small">Damaged items are not put back in stock; their cost shows as a loss in Profit & loss.</p>
    </Modal>
  );
}
