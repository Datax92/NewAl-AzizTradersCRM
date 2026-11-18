import { SHOP_DETAILS } from './shop-details';
/* Every figure the shop sees is worked out here from the records — nothing is typed
   in twice, so the dashboard, reports, khata and cash book can never disagree. */

import type {
  Account, DB, Expense, MoveType, Party, Payment, PayMethod, Product, Purchase, Role, Sale, SaleItem,
  SaleReturn, Session, Settings, StockMove,
} from './types';
import type { Op } from './db';
import { Range, inRange, uid, round2, ymd, daysAgo, addDays, startOfDay, rs } from './format';

export const ACCOUNTS: Account[] = ['Cash', 'Bank', 'JazzCash', 'Easypaisa'];
export const METHODS: PayMethod[] = ['Cash', 'Bank', 'JazzCash', 'Easypaisa', 'Khata'];

export const DEFAULT_SETTINGS: Settings = {
  id: 'shop',
  ...SHOP_DETAILS,
  ntn: '',
  receiptFooter: 'Thank you for shopping with us! Tools once sold can be exchanged within 7 days with the bill.',
  counters: ['Counter 1', 'Counter 2'],
  categories: [
    'Soldering', 'Hot Air & Rework', 'Screwdrivers', 'Tweezers & Hand Tools', 'Microscopes & Lights',
    'Testing & Meters', 'Power Supplies', 'Consumables', 'Opening & LCD Tools', 'Programmers & Boxes',
  ],
  expenseCategories: ['Rent', 'Salaries', 'Electricity', 'Internet & Phone', 'Tea & Refreshment', 'Transport & Delivery', 'Packing Material', 'Repairs & Maintenance', 'Marketing', 'Other'],
  units: ['pc', 'set', 'box', 'roll', 'pack', 'bottle', 'meter'],
  cashierDiscountLimit: 10,
  bigDiscountAlert: 15,
  overdueDays: 30,
  opening: { Cash: 0, Bank: 0, JazzCash: 0, Easypaisa: 0 },
};

export function settingsOf(db: DB): Settings {
  const s = db.settings[0];
  return s ? { ...DEFAULT_SETTINGS, ...s, opening: { ...DEFAULT_SETTINGS.opening, ...(s.opening || {}) } } : DEFAULT_SETTINGS;
}

/** Named business contacts for receipts, statements and outgoing bill text. */
export function shopContactText(st: Settings): string {
  return [
    [st.contactName, st.phone].filter(Boolean).join(': '),
    [st.secondaryContactName, st.secondaryPhone].filter(Boolean).join(': '),
  ].filter(Boolean).join(' · ');
}

/* ------------------------------ permissions ------------------------------ */

export type Perm =
  | 'pos' | 'returns' | 'stock' | 'khata' | 'products.edit' | 'prices' | 'cost.view' | 'bigDiscount'
  | 'profit' | 'void' | 'purchases' | 'expenses' | 'cashbook' | 'settings' | 'users' | 'backup' | 'reports';

const PERMS: Record<Role, Perm[]> = {
  owner: ['pos', 'returns', 'stock', 'khata', 'products.edit', 'prices', 'cost.view', 'bigDiscount', 'profit', 'void', 'purchases', 'expenses', 'cashbook', 'settings', 'users', 'backup', 'reports'],
  manager: ['pos', 'returns', 'stock', 'khata', 'products.edit', 'prices', 'cost.view', 'bigDiscount', 'purchases', 'expenses', 'cashbook', 'reports'],
  cashier: ['pos', 'returns', 'stock', 'khata'],
};

export function can(role: Role | undefined, p: Perm): boolean {
  return !!role && PERMS[role].includes(p);
}

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier' };

/* ------------------------------ products & stock ------------------------------ */

export type StockState = 'out' | 'low' | 'ok';

export function stockState(p: Product): StockState {
  if (p.stock <= 0) return 'out';
  if (p.stock <= p.minStock) return 'low';
  return 'ok';
}

export const STOCK_LABEL: Record<StockState, string> = { out: 'Out of stock', low: 'Low stock', ok: 'In stock' };

export function margin(p: { cost: number; price: number }): number {
  return p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
}

export function activeSales(db: DB, r?: Range): Sale[] {
  return db.sales.filter((s) => s.status !== 'void' && (!r || inRange(s.date, r)));
}

export function lineNet(i: SaleItem): number {
  return i.price * i.qty - (i.disc || 0);
}

export function saleCost(s: Sale): number {
  return s.items.reduce((a, i) => a + i.cost * i.qty, 0);
}

export function saleProfit(s: Sale): number {
  return s.total - saleCost(s);
}

export function payOf(s: Sale, m: PayMethod): number {
  return s.payments.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0);
}

export function returnedQty(db: DB, saleId: string, productId: string): number {
  return db.returns
    .filter((r) => r.saleId === saleId)
    .reduce((a, r) => a + r.items.filter((i) => i.productId === productId).reduce((b, i) => b + i.qty, 0), 0);
}

export function returnsFor(db: DB, saleId: string): SaleReturn[] {
  return db.returns.filter((r) => r.saleId === saleId);
}

/** Units on purchase orders not yet received. */
export function onOrder(db: DB, productId: string): number {
  return db.purchases
    .filter((p) => p.status === 'ordered' || p.status === 'partial')
    .reduce((a, p) => a + p.items.filter((i) => i.productId === productId).reduce((b, i) => b + Math.max(0, i.qty - i.received), 0), 0);
}

export interface ProductStat {
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  bills: number;
  lastSold?: string;
}

/** Net units sold, revenue and profit for each product in the range (returns taken off). */
export function productStats(db: DB, r?: Range): Map<string, ProductStat> {
  const m = new Map<string, ProductStat>();
  const get = (id: string) => {
    let x = m.get(id);
    if (!x) m.set(id, (x = { qty: 0, revenue: 0, cost: 0, profit: 0, bills: 0 }));
    return x;
  };
  activeSales(db, r).forEach((s) => {
    // The bill discount is shared over the lines by value, so product profit adds up to the bill's.
    const sub = s.subtotal || 1;
    s.items.forEach((i) => {
      const x = get(i.productId);
      const net = lineNet(i) - (s.discount * lineNet(i)) / sub;
      x.qty += i.qty;
      x.revenue += net;
      x.cost += i.cost * i.qty;
      x.bills += 1;
      if (!x.lastSold || s.date > x.lastSold) x.lastSold = s.date;
    });
  });
  db.returns
    .filter((rt) => !r || inRange(rt.date, r))
    .forEach((rt) =>
      rt.items.forEach((i) => {
        const x = get(i.productId);
        x.qty -= i.qty;
        x.revenue -= i.price * i.qty;
        x.cost -= i.cost * i.qty;
      })
    );
  m.forEach((x) => (x.profit = x.revenue - x.cost));
  return m;
}

export function lastSoldMap(db: DB): Map<string, string> {
  const m = new Map<string, string>();
  db.sales.forEach((s) => {
    if (s.status === 'void') return;
    s.items.forEach((i) => {
      const cur = m.get(i.productId);
      if (!cur || s.date > cur) m.set(i.productId, s.date);
    });
  });
  return m;
}

export interface Suggestion {
  product: Product;
  perDay: number;
  daysLeft: number; // Infinity when it is not selling
  lead: number;
  onOrder: number;
  suggest: number;
  urgency: 'now' | 'soon' | 'plan';
  supplier?: Party;
}

/** What to buy: sales speed over 30 days, supplier delivery time and two weeks of cover. */
export function reorderSuggestions(db: DB): Suggestion[] {
  const r30 = { key: '30d' as const, from: addDays(startOfDay(new Date()), -29), to: addDays(startOfDay(new Date()), 1), label: '' };
  const stats = productStats(db, r30);
  const parties = new Map(db.parties.map((p) => [p.id, p]));
  const out: Suggestion[] = [];
  db.products.forEach((p) => {
    if (!p.active) return;
    const sold = Math.max(0, stats.get(p.id)?.qty || 0);
    const perDay = sold / 30;
    const sup = p.supplierId ? parties.get(p.supplierId) : undefined;
    const lead = sup?.leadDays ?? 3;
    const oo = onOrder(db, p.id);
    const reorderPoint = Math.max(p.minStock, Math.ceil(perDay * lead));
    const daysLeft = perDay > 0 ? p.stock / perDay : Infinity;
    if (p.stock + oo > reorderPoint && p.stock > p.minStock) return;
    const target = Math.max(p.minStock * 2, Math.ceil(perDay * (lead + 14)));
    const suggest = Math.max(0, target - p.stock - oo);
    if (suggest <= 0) return;
    const urgency = p.stock <= 0 || daysLeft <= lead ? 'now' : daysLeft <= lead + 4 || p.stock <= p.minStock ? 'soon' : 'plan';
    out.push({ product: p, perDay, daysLeft, lead, onOrder: oo, suggest, urgency, supplier: sup });
  });
  const rank = { now: 0, soon: 1, plan: 2 };
  return out.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.daysLeft - b.daysLeft);
}

/* ------------------------------ khata (credit ledger) ------------------------------ */

export interface LedgerRow {
  id: string;
  date: string;
  kind: 'opening' | 'bill' | 'return' | 'payment' | 'purchase' | 'refund';
  ref: string;
  detail: string;
  debit: number; // increases the balance
  credit: number; // reduces the balance
  balance: number;
}

/** Customer: balance = what they owe us. Supplier: balance = what we owe them. */
export function ledger(db: DB, party: Party): LedgerRow[] {
  const rows: Omit<LedgerRow, 'balance'>[] = [];
  if (party.opening) {
    rows.push({ id: 'open', date: party.createdAt, kind: 'opening', ref: '—', detail: 'Opening balance', debit: Math.max(0, party.opening), credit: Math.max(0, -party.opening) });
  }
  if (party.type === 'customer') {
    db.sales.forEach((s) => {
      if (s.customerId !== party.id || s.status === 'void') return;
      const k = payOf(s, 'Khata');
      if (k <= 0) return;
      rows.push({ id: s.id, date: s.date, kind: 'bill', ref: s.no, detail: `Credit bill · total ${rs(s.total)}${s.total > k ? `, paid ${rs(s.total - k)} at counter` : ''}`, debit: k, credit: 0 });
    });
    db.returns.forEach((r) => {
      if (r.customerId !== party.id || r.refundMethod !== 'Khata') return;
      rows.push({ id: r.id, date: r.date, kind: 'return', ref: r.no, detail: `Goods returned from bill ${r.saleNo}`, debit: 0, credit: r.total });
    });
  } else {
    db.purchases.forEach((p) => {
      if (p.supplierId !== party.id || p.status === 'cancelled') return;
      const v = purchaseReceivedValue(p);
      if (v <= 0) return;
      rows.push({ id: p.id, date: p.receivedAt || p.date, kind: 'purchase', ref: p.no, detail: `Goods received${p.ref ? ` · supplier bill ${p.ref}` : ''}${p.status === 'partial' ? ' (partly)' : ''}`, debit: v, credit: 0 });
    });
  }
  db.payments.forEach((p) => {
    if (p.partyId !== party.id) return;
    // A customer paying us, or us paying a supplier, reduces the balance.
    const reduces = (party.type === 'customer' && p.dir === 'in') || (party.type === 'supplier' && p.dir === 'out');
    rows.push({
      id: p.id, date: p.date, kind: reduces ? 'payment' : 'refund', ref: p.method,
      detail: (reduces ? (party.type === 'customer' ? 'Payment received' : 'Payment made') : party.type === 'customer' ? 'Money paid back to customer' : 'Refund from supplier') + (p.note ? ` · ${p.note}` : ''),
      debit: reduces ? 0 : p.amount, credit: reduces ? p.amount : 0,
    });
  });
  rows.sort((a, b) => (a.kind === 'opening' ? -1 : b.kind === 'opening' ? 1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let bal = 0;
  return rows.map((r) => ((bal = round2(bal + r.debit - r.credit)), { ...r, balance: bal }));
}

export function purchaseReceivedValue(p: Purchase): number {
  return p.items.reduce((a, i) => a + i.received * i.cost, 0);
}

export function purchasePaid(db: DB, p: Purchase): number {
  return db.payments.filter((x) => x.purchaseId === p.id && x.dir === 'out').reduce((a, x) => a + x.amount, 0);
}

export interface PartyBalance {
  balance: number;
  lastPay?: string;
  lastBill?: string;
  ageDays: number; // days since the oldest unpaid amount was charged (first-in, first-out)
  overLimit: boolean;
}

export function balances(db: DB): Map<string, PartyBalance> {
  const m = new Map<string, PartyBalance>();
  db.parties.forEach((p) => {
    const rows = ledger(db, p);
    const balance = rows.length ? rows[rows.length - 1].balance : 0;
    // FIFO age: payments settle the oldest charges first.
    let credits = rows.reduce((a, r) => a + r.credit, 0);
    let oldest: string | undefined;
    for (const r of rows) {
      if (r.debit <= 0) continue;
      if (credits >= r.debit) credits -= r.debit;
      else {
        oldest = r.date;
        break;
      }
    }
    const pays = rows.filter((r) => r.kind === 'payment');
    const bills = rows.filter((r) => r.kind === 'bill' || r.kind === 'purchase');
    m.set(p.id, {
      balance,
      lastPay: pays.length ? pays[pays.length - 1].date : undefined,
      lastBill: bills.length ? bills[bills.length - 1].date : undefined,
      ageDays: balance > 0 && oldest ? daysAgo(oldest) : 0,
      overLimit: !!p.creditLimit && p.creditLimit > 0 && balance > p.creditLimit,
    });
  });
  return m;
}

/* ------------------------------ cash & bank ------------------------------ */

export interface AccountRow {
  id: string;
  date: string;
  account: Account;
  amount: number; // signed
  kind: string;
  ref: string;
  detail: string;
  counter?: string;
}

/** Every rupee that entered or left an account, newest last. */
export function accountRows(db: DB): AccountRow[] {
  const rows: AccountRow[] = [];
  db.sales.forEach((s) => {
    if (s.status === 'void') return;
    s.payments.forEach((p, i) => {
      if (p.method === 'Khata' || !p.amount) return;
      rows.push({ id: `${s.id}-${i}`, date: s.date, account: p.method, amount: p.amount, kind: 'Sale', ref: s.no, detail: s.customerName || 'Walk-in customer', counter: s.counter });
    });
  });
  db.returns.forEach((r) => {
    if (r.refundMethod === 'Khata') return;
    rows.push({ id: r.id, date: r.date, account: r.refundMethod as Account, amount: -r.total, kind: 'Refund', ref: r.no, detail: `Return on ${r.saleNo}`, counter: r.counter });
  });
  db.payments.forEach((p) => {
    rows.push({
      id: p.id, date: p.date, account: p.method, amount: p.dir === 'in' ? p.amount : -p.amount,
      kind: p.partyType === 'customer' ? (p.dir === 'in' ? 'Khata received' : 'Paid to customer') : p.dir === 'out' ? 'Supplier paid' : 'Supplier refund',
      ref: p.partyName, detail: p.note || '', counter: p.counter,
    });
  });
  db.expenses.forEach((e) => rows.push({ id: e.id, date: e.date, account: e.method, amount: -e.amount, kind: 'Expense', ref: e.category, detail: e.payee || e.note || '' }));
  db.cashtx.forEach((t) => {
    if (t.kind === 'transfer' && t.from && t.to) {
      rows.push({ id: t.id + '-o', date: t.date, account: t.from, amount: -t.amount, kind: 'Transfer out', ref: `to ${t.to}`, detail: t.note || '' });
      rows.push({ id: t.id + '-i', date: t.date, account: t.to, amount: t.amount, kind: 'Transfer in', ref: `from ${t.from}`, detail: t.note || '' });
    } else if (t.kind === 'capital' && t.to) {
      rows.push({ id: t.id, date: t.date, account: t.to, amount: t.amount, kind: 'Owner put in', ref: 'Capital', detail: t.note || '' });
    } else if (t.kind === 'drawing' && t.from) {
      rows.push({ id: t.id, date: t.date, account: t.from, amount: -t.amount, kind: 'Owner took out', ref: 'Drawings', detail: t.note || '' });
    }
  });
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function accountBalances(db: DB, before?: Date): Record<Account, number> {
  const s = settingsOf(db);
  const out = { ...s.opening } as Record<Account, number>;
  accountRows(db).forEach((r) => {
    if (before && new Date(r.date) >= before) return;
    out[r.account] = round2((out[r.account] || 0) + r.amount);
  });
  return out;
}

/** Cash a counter should hold at the end of a day: its cash sales and receipts less its cash paid out. */
export function counterCash(db: DB, day: string, counter: string) {
  const rows = accountRows(db).filter((r) => r.account === 'Cash' && ymd(r.date) === day && r.counter === counter);
  const cin = rows.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const cout = rows.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0);
  return { cin, cout, net: cin - cout, rows };
}

/* ------------------------------ profit & loss ------------------------------ */

export interface PnL {
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  stockLoss: number;
  expenses: number;
  netProfit: number;
  bills: number;
  items: number;
  avgBill: number;
  grossMargin: number;
  netMargin: number;
  expenseBy: Record<string, number>;
  byMethod: Record<PayMethod, number>;
}

const LOSS_TYPES: MoveType[] = ['damage', 'adjust', 'out'];

export function pnl(db: DB, r: Range): PnL {
  const sales = activeSales(db, r);
  let grossSales = 0, discounts = 0, cogs = 0, items = 0;
  const byMethod = { Cash: 0, Bank: 0, JazzCash: 0, Easypaisa: 0, Khata: 0 } as Record<PayMethod, number>;
  sales.forEach((s) => {
    s.items.forEach((i) => {
      grossSales += i.price * i.qty;
      discounts += i.disc || 0;
      cogs += i.cost * i.qty;
      items += i.qty;
    });
    discounts += s.discount || 0;
    s.payments.forEach((p) => (byMethod[p.method] = (byMethod[p.method] || 0) + p.amount));
  });
  let returns = 0, returnCost = 0, damagedReturn = 0;
  db.returns.filter((x) => inRange(x.date, r)).forEach((x) => {
    returns += x.total;
    x.items.forEach((i) => {
      returnCost += i.cost * i.qty;
      if (!i.restock) damagedReturn += i.cost * i.qty;
    });
  });
  cogs -= returnCost;
  const netSales = grossSales - discounts - returns;
  const grossProfit = netSales - cogs;
  const moveLoss = db.moves
    .filter((m) => LOSS_TYPES.includes(m.type) && inRange(m.date, r))
    .reduce((a, m) => a - m.qty * m.cost, 0);
  const stockLoss = moveLoss + damagedReturn;
  const expenseBy: Record<string, number> = {};
  let expenses = 0;
  db.expenses.filter((e) => inRange(e.date, r)).forEach((e) => {
    expenses += e.amount;
    expenseBy[e.category] = (expenseBy[e.category] || 0) + e.amount;
  });
  const netProfit = grossProfit - stockLoss - expenses;
  return {
    grossSales: round2(grossSales), discounts: round2(discounts), returns: round2(returns), netSales: round2(netSales),
    cogs: round2(cogs), grossProfit: round2(grossProfit), stockLoss: round2(stockLoss), expenses: round2(expenses),
    netProfit: round2(netProfit), bills: sales.length, items, avgBill: sales.length ? netSales / sales.length : 0,
    grossMargin: netSales ? (grossProfit / netSales) * 100 : 0, netMargin: netSales ? (netProfit / netSales) * 100 : 0,
    expenseBy, byMethod,
  };
}

export interface DayRow {
  day: string;
  sales: number;
  profit: number; // gross profit
  expenses: number;
  net: number;
  bills: number;
}

export function daily(db: DB, days: string[]): DayRow[] {
  const m = new Map<string, DayRow>(days.map((d) => [d, { day: d, sales: 0, profit: 0, expenses: 0, net: 0, bills: 0 }]));
  db.sales.forEach((s) => {
    if (s.status === 'void') return;
    const x = m.get(ymd(s.date));
    if (!x) return;
    x.sales += s.total;
    x.profit += saleProfit(s);
    x.bills += 1;
  });
  db.returns.forEach((rt) => {
    const x = m.get(ymd(rt.date));
    if (!x) return;
    x.sales -= rt.total;
    x.profit -= rt.items.reduce((a, i) => a + (i.price - (i.restock ? i.cost : 0)) * i.qty, 0);
  });
  db.moves.forEach((mv) => {
    if (!LOSS_TYPES.includes(mv.type)) return;
    const x = m.get(ymd(mv.date));
    if (x) x.profit += mv.qty * mv.cost;
  });
  db.expenses.forEach((e) => {
    const x = m.get(ymd(e.date));
    if (x) x.expenses += e.amount;
  });
  m.forEach((x) => (x.net = x.profit - x.expenses));
  return days.map((d) => m.get(d)!);
}

export function categoryStats(db: DB, r: Range) {
  const ps = productStats(db, r);
  const byCat = new Map<string, { revenue: number; profit: number; qty: number; stockCost: number; stockRetail: number; items: number }>();
  db.products.forEach((p) => {
    const c = p.category || 'Uncategorised';
    let x = byCat.get(c);
    if (!x) byCat.set(c, (x = { revenue: 0, profit: 0, qty: 0, stockCost: 0, stockRetail: 0, items: 0 }));
    const st = ps.get(p.id);
    if (st) {
      x.revenue += st.revenue;
      x.profit += st.profit;
      x.qty += st.qty;
    }
    if (p.stock > 0) {
      x.stockCost += p.stock * p.cost;
      x.stockRetail += p.stock * p.price;
    }
    x.items += 1;
  });
  return [...byCat.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);
}

export function stockValue(db: DB) {
  let cost = 0, retail = 0, units = 0;
  db.products.forEach((p) => {
    if (p.stock > 0 && p.active) {
      cost += p.stock * p.cost;
      retail += p.stock * p.price;
      units += p.stock;
    }
  });
  return { cost, retail, units, potential: retail - cost };
}

/* ------------------------------ alerts ------------------------------ */

export interface Alert {
  id: string;
  level: 'high' | 'med' | 'low' | 'good';
  group: 'Stock' | 'Khata' | 'Suppliers' | 'Sales' | 'System';
  title: string;
  detail: string;
  go: string;
  need?: Perm;
}

export function alerts(db: DB): Alert[] {
  const s = settingsOf(db);
  const out: Alert[] = [];
  const active = db.products.filter((p) => p.active);
  const outs = active.filter((p) => p.stock <= 0);
  const lows = active.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  outs.slice(0, 12).forEach((p) => out.push({ id: 'out-' + p.id, level: 'high', group: 'Stock', title: `${p.name} is out of stock`, detail: `Minimum level ${p.minStock}. Customers asking for it will be turned away.`, go: 'purchases/suggest' }));
  if (outs.length > 12) out.push({ id: 'out-more', level: 'high', group: 'Stock', title: `${outs.length - 12} more items are out of stock`, detail: 'See the full list in Products.', go: 'products/list' });
  lows.slice(0, 12).forEach((p) => out.push({ id: 'low-' + p.id, level: 'med', group: 'Stock', title: `${p.name} is running low`, detail: `Only ${p.stock} ${p.unit} left (minimum ${p.minStock}).`, go: 'purchases/suggest' }));
  if (lows.length > 12) out.push({ id: 'low-more', level: 'med', group: 'Stock', title: `${lows.length - 12} more items are running low`, detail: 'See purchase suggestions.', go: 'purchases/suggest' });

  const bal = balances(db);
  db.parties.forEach((p) => {
    const b = bal.get(p.id);
    if (!b || b.balance <= 0.5) return;
    if (p.type === 'customer') {
      if (b.overLimit) out.push({ id: 'lim-' + p.id, level: 'high', group: 'Khata', title: `${p.name} is over the credit limit`, detail: `Owes ${rs(b.balance)} — limit ${rs(p.creditLimit || 0)}.`, go: 'khata/customers?id=' + p.id });
      else if (b.ageDays >= s.overdueDays) out.push({ id: 'due-' + p.id, level: 'med', group: 'Khata', title: `${p.name} owes ${rs(b.balance)}`, detail: `Oldest unpaid amount is ${b.ageDays} days old. Send a reminder.`, go: 'khata/customers?id=' + p.id });
    } else if (b.ageDays >= s.overdueDays) {
      out.push({ id: 'sup-' + p.id, level: 'med', group: 'Suppliers', title: `Payment due to ${p.name}`, detail: `We owe ${rs(b.balance)}; the oldest part is ${b.ageDays} days old.`, go: 'khata/suppliers?id=' + p.id, need: 'purchases' });
    }
  });

  db.purchases.forEach((p) => {
    if (p.status !== 'ordered' && p.status !== 'partial') return;
    const sup = db.parties.find((x) => x.id === p.supplierId);
    const lead = sup?.leadDays ?? 3;
    if (daysAgo(p.date) > lead + 2) out.push({ id: 'po-' + p.id, level: 'low', group: 'Suppliers', title: `Order ${p.no} from ${p.supplierName} is late`, detail: `Ordered ${daysAgo(p.date)} days ago; delivery usually takes ${lead} days.`, go: 'purchases/orders', need: 'purchases' });
  });

  const today = ymd();
  db.sales.forEach((x) => {
    if (x.status === 'void' || ymd(x.date) !== today) return;
    const gross = x.items.reduce((a, i) => a + i.price * i.qty, 0);
    const disc = gross - x.total;
    if (gross > 0 && (disc / gross) * 100 >= s.bigDiscountAlert) out.push({ id: 'disc-' + x.id, level: 'med', group: 'Sales', title: `Large discount on bill ${x.no}`, detail: `${((disc / gross) * 100).toFixed(0)}% (${rs(disc)}) given by ${x.userName} at ${x.counter}.`, go: 'sales/bills?id=' + x.id, need: 'profit' });
  });

  db.closes.filter((c) => daysAgo(c.date) <= 7 && Math.abs(c.diff) >= 1).forEach((c) =>
    out.push({ id: 'close-' + c.id, level: c.diff < 0 ? 'high' : 'low', group: 'Sales', title: `Cash ${c.diff < 0 ? 'short' : 'over'} by ${rs(Math.abs(c.diff))} at ${c.counter}`, detail: `Day closing of ${c.date} by ${c.userName}.`, go: 'cash/closing', need: 'cashbook' })
  );

  const last = s.lastBackupAt;
  if (!last || daysAgo(last) >= 1) out.push({ id: 'backup', level: last && daysAgo(last) < 3 ? 'low' : 'med', group: 'System', title: last ? `Last backup was ${daysAgo(last)} days ago` : 'No backup file downloaded yet', detail: 'Download a backup file from Settings → Backup and keep it on a USB / Google Drive.', go: 'settings/backup', need: 'backup' });
  return out;
}

/* ------------------------------ actions → operations ------------------------------ */

function audit(userName: string, action: string, detail: string, tone?: 'good' | 'bad' | 'warn' | 'info'): Op {
  return { t: 'put', c: 'audit', d: { id: uid('a'), date: new Date().toISOString(), userName, action, detail, tone } };
}

function move(p: Product, type: MoveType, qty: number, cost: number, me: Session, ref?: string, note?: string, balance?: number): Op {
  const d: StockMove = {
    id: uid('m'), date: new Date().toISOString(), productId: p.id, productName: p.name, type, qty, cost: round2(cost),
    balance: balance ?? round2(p.stock + qty), ref, note, userName: me.name, counter: me.counter,
  };
  return { t: 'put', c: 'moves', d };
}

export function counterCode(counter: string): string {
  const m = counter.match(/(\d+)/);
  return m ? `C${m[1]}` : counter.replace(/[^A-Z]/gi, '').slice(0, 2).toUpperCase() || 'C';
}

export function nextNo(list: { no: string }[], prefix: string, pad = 5): string {
  let max = 0;
  list.forEach((x) => {
    if (x.no?.startsWith(prefix)) {
      const n = parseInt(x.no.slice(prefix.length), 10);
      if (n > max) max = n;
    }
  });
  return prefix + String(max + 1).padStart(pad, '0');
}

export interface CartLine {
  productId: string;
  qty: number;
  price: number;
  disc: number;
}

export function buildSale(
  db: DB,
  me: Session,
  input: { lines: CartLine[]; discount: number; payments: { method: PayMethod; amount: number }[]; customer?: Party; customerName?: string; customerPhone?: string; cashReceived?: number; priceType: 'retail' | 'wholesale'; note?: string }
): { sale: Sale; ops: Op[] } {
  const pm = new Map(db.products.map((p) => [p.id, p]));
  const items: SaleItem[] = input.lines.map((l) => {
    const p = pm.get(l.productId)!;
    return { productId: p.id, name: p.name, barcode: p.barcode, qty: l.qty, price: l.price, cost: p.cost, disc: round2(l.disc || 0) };
  });
  const subtotal = round2(items.reduce((a, i) => a + lineNet(i), 0));
  const total = round2(subtotal - (input.discount || 0));
  const payments = input.payments.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: round2(p.amount) }));
  const cash = payments.filter((p) => p.method === 'Cash').reduce((a, p) => a + p.amount, 0);
  const sale: Sale = {
    id: uid('s'),
    no: nextNo(db.sales, counterCode(me.counter) + '-'),
    date: new Date().toISOString(),
    counter: me.counter,
    userId: me.userId,
    userName: me.name,
    customerId: input.customer?.id,
    customerName: input.customer?.name || input.customerName || undefined,
    customerPhone: input.customer?.phone || input.customerPhone || undefined,
    items, subtotal, discount: round2(input.discount || 0), total, payments,
    cashReceived: input.cashReceived && input.cashReceived > 0 ? input.cashReceived : cash || undefined,
    change: input.cashReceived && input.cashReceived > cash ? round2(input.cashReceived - cash) : 0,
    priceType: input.priceType,
    status: 'completed',
    note: input.note || undefined,
  };
  const ops: Op[] = [{ t: 'put', c: 'sales', d: sale }];
  const running = new Map<string, number>();
  items.forEach((i) => {
    const p = pm.get(i.productId)!;
    const before = running.has(p.id) ? running.get(p.id)! : p.stock;
    running.set(p.id, before - i.qty);
    ops.push({ t: 'inc', c: 'products', id: p.id, field: 'stock', by: -i.qty });
    ops.push(move(p, 'sale', -i.qty, p.cost, me, sale.no, undefined, before - i.qty));
  });
  return { sale, ops };
}

export function buildVoid(db: DB, me: Session, sale: Sale, reason: string): Op[] {
  const pm = new Map(db.products.map((p) => [p.id, p]));
  const ops: Op[] = [{ t: 'put', c: 'sales', d: { ...sale, status: 'void', voidReason: reason, voidedBy: me.name } }];
  sale.items.forEach((i) => {
    const p = pm.get(i.productId);
    const back = i.qty - returnedQty(db, sale.id, i.productId);
    if (!p || back <= 0) return;
    ops.push({ t: 'inc', c: 'products', id: p.id, field: 'stock', by: back });
    ops.push(move(p, 'void', back, i.cost, me, sale.no, 'Bill cancelled'));
  });
  ops.push(audit(me.name, 'Bill cancelled', `${sale.no} (${rs(sale.total)}) — ${reason}`, 'bad'));
  return ops;
}

export function buildReturn(db: DB, me: Session, sale: Sale, lines: { productId: string; qty: number; restock: boolean }[], refundMethod: PayMethod, reason: string): { ret: SaleReturn; ops: Op[] } {
  const pm = new Map(db.products.map((p) => [p.id, p]));
  const sub = sale.subtotal || 1;
  const items = lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const it = sale.items.find((i) => i.productId === l.productId)!;
      // Refund what was actually paid per unit: line discount and a share of the bill discount taken off.
      const unitNet = (lineNet(it) - (sale.discount * lineNet(it)) / sub) / it.qty;
      return { productId: it.productId, name: it.name, qty: l.qty, price: round2(unitNet), cost: it.cost, restock: l.restock };
    });
  const total = round2(items.reduce((a, i) => a + i.price * i.qty, 0));
  const ret: SaleReturn = {
    id: uid('r'), no: nextNo(db.returns, 'RT-', 4), date: new Date().toISOString(), saleId: sale.id, saleNo: sale.no,
    customerId: sale.customerId, customerName: sale.customerName, items, total, refundMethod, reason: reason || undefined,
    userName: me.name, counter: me.counter,
  };
  const ops: Op[] = [{ t: 'put', c: 'returns', d: ret }];
  items.forEach((i) => {
    const p = pm.get(i.productId);
    if (p && i.restock) {
      ops.push({ t: 'inc', c: 'products', id: p.id, field: 'stock', by: i.qty });
      ops.push(move(p, 'return', i.qty, i.cost, me, ret.no, `Returned from ${sale.no}`));
    }
  });
  ops.push(audit(me.name, 'Return', `${ret.no} on ${sale.no}: ${rs(total)} refunded by ${refundMethod}`, 'warn'));
  return { ret, ops };
}

export function buildStockMove(me: Session, p: Product, type: MoveType, qty: number, note: string, cost?: number): Op[] {
  if (!qty) return [];
  const ops: Op[] = [{ t: 'inc', c: 'products', id: p.id, field: 'stock', by: qty }];
  // Stock brought in at a different cost moves the average cost, like a purchase does.
  if (type === 'in' && cost && cost > 0 && qty > 0) {
    const newCost = p.stock > 0 ? (p.stock * p.cost + qty * cost) / (p.stock + qty) : cost;
    ops.push({ t: 'put', c: 'products', d: { id: p.id, cost: round2(newCost), updatedAt: new Date().toISOString() } });
  }
  ops.push(move(p, type, qty, type === 'in' && cost ? cost : p.cost, me, undefined, note));
  ops.push(audit(me.name, 'Stock ' + MOVE_LABEL[type].toLowerCase(), `${p.name}: ${qty > 0 ? '+' : ''}${qty} ${p.unit}${note ? ' — ' + note : ''}`, qty > 0 ? 'good' : 'warn'));
  return ops;
}

/** Goods arrived: stock goes up and the average cost takes in the new price. */
export function buildReceive(db: DB, me: Session, po: Purchase, qtys: Record<string, number>): Op[] {
  const pm = new Map(db.products.map((p) => [p.id, { ...p }]));
  const items = po.items.map((i) => ({ ...i }));
  const ops: Op[] = [];
  items.forEach((i) => {
    const q = Math.max(0, Math.min(qtys[i.productId] || 0, i.qty - i.received));
    if (!q) return;
    const p = pm.get(i.productId);
    i.received += q;
    if (!p) return;
    const newCost = p.stock > 0 ? (p.stock * p.cost + q * i.cost) / (p.stock + q) : i.cost;
    ops.push({ t: 'inc', c: 'products', id: p.id, field: 'stock', by: q });
    ops.push({ t: 'put', c: 'products', d: { id: p.id, cost: round2(newCost), updatedAt: new Date().toISOString() } });
    ops.push(move(p, 'purchase', q, i.cost, me, po.no, `From ${po.supplierName}`));
    p.stock += q;
    p.cost = newCost;
  });
  if (!ops.length) return [];
  const all = items.every((i) => i.received >= i.qty);
  const any = items.some((i) => i.received > 0);
  ops.unshift({ t: 'put', c: 'purchases', d: { ...po, items, status: all ? 'received' : any ? 'partial' : 'ordered', receivedAt: new Date().toISOString() } });
  ops.push(audit(me.name, 'Goods received', `${po.no} from ${po.supplierName}`, 'good'));
  return ops;
}

export function buildPayment(me: Session, party: Party, dir: 'in' | 'out', amount: number, method: Account, note?: string, purchaseId?: string, date?: string): Op[] {
  const d: Payment = {
    id: uid('p'), date: date || new Date().toISOString(), partyId: party.id, partyType: party.type, partyName: party.name, dir,
    amount: round2(amount), method, note: note || undefined, purchaseId, userName: me.name, counter: me.counter,
  };
  return [
    { t: 'put', c: 'payments', d },
    audit(me.name, dir === 'in' ? 'Payment received' : 'Payment made', `${party.name}: ${rs(amount)} by ${method}`, dir === 'in' ? 'good' : 'info'),
  ];
}

export function buildExpense(me: Session, e: Omit<Expense, 'id' | 'userName'>): Op[] {
  const d: Expense = { ...e, id: uid('e'), amount: round2(e.amount), userName: me.name };
  return [{ t: 'put', c: 'expenses', d }, audit(me.name, 'Expense', `${e.category}: ${rs(e.amount)} from ${e.method}`, 'info')];
}

export { audit as auditOp, move as moveOp };

export const MOVE_LABEL: Record<MoveType, string> = {
  sale: 'Sale', purchase: 'Purchase', return: 'Return', void: 'Bill cancelled', in: 'Stock IN', out: 'Stock OUT',
  damage: 'Damage / loss', adjust: 'Count correction', opening: 'Opening stock',
};

export function newBarcode(db: DB): string {
  // 13 digits starting 200 (the range set aside for in-store codes), unique in this shop.
  const used = new Set(db.products.map((p) => p.barcode));
  for (;;) {
    const body = '200' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    const sum = body.split('').reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
    const code = body + ((10 - (sum % 10)) % 10);
    if (!used.has(code)) return code;
  }
}

export function find<T extends { id: string }>(list: T[], id?: string): T | undefined {
  return id ? list.find((x) => x.id === id) : undefined;
}

export function sameDay(a: string, b: string) {
  return ymd(a) === ymd(b);
}
