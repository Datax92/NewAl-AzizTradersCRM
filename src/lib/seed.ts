/* Sample shop for trying the system: a mobile-repair tools catalogue, suppliers,
   technician customers on khata and two months of trading. Every figure is
   consistent — stock on hand equals opening + received − sold + returned. */

import type { DB, Party, Product, Purchase, Sale, SaleReturn, Payment, StockMove, Expense, User, CashTx } from './types';
import { DEFAULT_SETTINGS, counterCode, lineNet } from './logic';
import { hashPin, round2 } from './format';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// name, category, brand, unit, cost, price, minStock, popularity (relative sales weight)
const CATALOGUE: [string, string, string, string, number, number, number, number][] = [
  ['Quick 861DW Hot Air Rework Station', 'Hot Air & Rework', 'Quick', 'pc', 20500, 24500, 3, 2],
  ['Sugon 8620DX Hot Air Station', 'Hot Air & Rework', 'Sugon', 'pc', 17800, 21500, 3, 2],
  ['Quick 857DW+ Hot Air Gun', 'Hot Air & Rework', 'Quick', 'pc', 9800, 12000, 4, 3],
  ['Mechanic Preheater Platform 200W', 'Hot Air & Rework', 'Mechanic', 'pc', 5200, 6800, 3, 2],
  ['Quick 236 Soldering Station', 'Soldering', 'Quick', 'pc', 6400, 7900, 4, 3],
  ['Sugon T26 Soldering Station', 'Soldering', 'Sugon', 'pc', 14500, 17500, 2, 1.5],
  ['Atten ST-60 Soldering Iron', 'Soldering', 'Atten', 'pc', 3100, 3950, 5, 3],
  ['Soldering Iron Tip 900M-T (set of 5)', 'Soldering', 'Quick', 'set', 650, 950, 10, 6],
  ['Solder Wire 0.3mm 100g', 'Consumables', 'Mechanic', 'roll', 780, 1050, 15, 9],
  ['Solder Wire 0.5mm 50g', 'Consumables', 'Relife', 'roll', 420, 600, 15, 8],
  ['Mechanic Solder Paste 183°C', 'Consumables', 'Mechanic', 'pc', 520, 750, 20, 10],
  ['Amtech NC-559 Flux', 'Consumables', 'Amtech', 'pc', 380, 550, 20, 11],
  ['Relife RL-422 Flux Paste', 'Consumables', 'Relife', 'pc', 450, 650, 15, 7],
  ['Desoldering Wick 2.5mm', 'Consumables', 'Goot', 'roll', 210, 320, 25, 9],
  ['B-7000 Glue 50ml', 'Consumables', 'Generic', 'bottle', 95, 160, 40, 18],
  ['T-7000 Black Glue 50ml', 'Consumables', 'Generic', 'bottle', 110, 180, 40, 16],
  ['IPA Cleaner 500ml', 'Consumables', 'Generic', 'bottle', 380, 550, 12, 8],
  ['Copper Jumper Wire 0.02mm', 'Consumables', 'Mechanic', 'roll', 260, 400, 15, 6],
  ['2UUL Precision Screwdriver Set', 'Screwdrivers', '2UUL', 'set', 1850, 2500, 6, 4],
  ['Qianli 3D Screwdriver Set', 'Screwdrivers', 'Qianli', 'set', 2400, 3200, 5, 3],
  ['Kaisi 25-in-1 Screwdriver Kit', 'Screwdrivers', 'Kaisi', 'set', 750, 1100, 10, 7],
  ['Pentalobe P2 Screwdriver', 'Screwdrivers', 'Generic', 'pc', 120, 220, 30, 12],
  ['Vetus ST-14 Tweezers', 'Tweezers & Hand Tools', 'Vetus', 'pc', 260, 400, 25, 12],
  ['Vetus ST-15 Curved Tweezers', 'Tweezers & Hand Tools', 'Vetus', 'pc', 260, 400, 25, 11],
  ['Mechanic Chip Removal Blade Set', 'Tweezers & Hand Tools', 'Mechanic', 'set', 520, 800, 10, 5],
  ['Anti-Static Brush (set of 3)', 'Tweezers & Hand Tools', 'Generic', 'set', 140, 250, 20, 7],
  ['Kaisi Repair Mat 45×30cm', 'Tweezers & Hand Tools', 'Kaisi', 'pc', 1300, 1800, 6, 3],
  ['Relife RL-064 Microscope Stand', 'Microscopes & Lights', 'Relife', 'pc', 23000, 27500, 1, 0.6],
  ['Trinocular Microscope 7-45X', 'Microscopes & Lights', 'Mechanic', 'pc', 52000, 61000, 1, 0.3],
  ['LED Ring Light for Microscope', 'Microscopes & Lights', 'Generic', 'pc', 1500, 2200, 4, 2],
  ['Magnifier Lamp 5X', 'Microscopes & Lights', 'Generic', 'pc', 2100, 2900, 3, 1.5],
  ['UNI-T UT33D Multimeter', 'Testing & Meters', 'UNI-T', 'pc', 2300, 3000, 5, 3],
  ['Fluke 101 Digital Multimeter', 'Testing & Meters', 'Fluke', 'pc', 8800, 10800, 2, 1],
  ['USB Tester Meter C/Lightning', 'Testing & Meters', 'Generic', 'pc', 650, 950, 8, 5],
  ['Thermal Camera Qianli Super Cam X', 'Testing & Meters', 'Qianli', 'pc', 44000, 52000, 1, 0.3],
  ['Mechanic DC Power Supply 15V 3A', 'Power Supplies', 'Mechanic', 'pc', 7200, 8900, 3, 1.5],
  ['Sugon 3005D Power Supply 30V 5A', 'Power Supplies', 'Sugon', 'pc', 11500, 14000, 2, 1],
  ['Power Supply Boot Cable (iPhone)', 'Power Supplies', 'Generic', 'pc', 450, 700, 10, 5],
  ['LCD Separator Machine 7 inch', 'Opening & LCD Tools', 'Generic', 'pc', 4800, 6200, 2, 1.2],
  ['Suction Cup Opening Tool', 'Opening & LCD Tools', 'Generic', 'pc', 90, 180, 30, 12],
  ['Metal Spudger Pry Tool Set', 'Opening & LCD Tools', 'Generic', 'set', 210, 350, 20, 9],
  ['Cutting Wire 0.08mm Molybdenum', 'Opening & LCD Tools', 'Generic', 'roll', 300, 480, 15, 6],
  ['Back Glass Laser Machine Fiber 20W', 'Opening & LCD Tools', 'Mechanic', 'pc', 165000, 189000, 1, 0.1],
  ['JC V1S Pro Programmer', 'Programmers & Boxes', 'JC', 'pc', 15500, 18500, 2, 1],
  ['iBox / iCopy Programmer', 'Programmers & Boxes', 'Qianli', 'pc', 9500, 11800, 2, 0.8],
  ['UFI Box (eMMC Programmer)', 'Programmers & Boxes', 'UFI', 'pc', 48000, 54000, 1, 0.2],
  ['BGA Reballing Stencil Kit', 'Hot Air & Rework', 'Amaoe', 'set', 1900, 2600, 5, 3],
  ['Solder Balls 0.3mm Bottle', 'Consumables', 'Generic', 'bottle', 330, 500, 12, 5],
];

const SUPPLIERS: [string, string, string, string, number][] = [
  ['Hall Road Electronics Wholesale', '0301-4455661', 'Lahore', 'Shop 44, Hall Road', 2],
  ['Saddar Tools Importers', '0321-2299883', 'Karachi', 'Star City Mall, Saddar', 4],
  ['Shenzhen Repair Supply Co.', '+86 138 0000 1122', 'Shenzhen', 'Huaqiangbei, Futian', 12],
  ['Raja Bazar Mobile Accessories', '0333-5150077', 'Rawalpindi', 'Raja Bazar Main', 1],
];

const CUSTOMERS: [string, string, string, number][] = [
  ['Ali Mobile Repairing', '0300-5123456', 'Saddar, Rawalpindi', 60000],
  ['Bilal Cell Care', '0312-5566778', 'Commercial Market, RWP', 40000],
  ['Hamza Phone Lab', '0345-9988776', 'Blue Area, Islamabad', 80000],
  ['Usman Telecom', '0331-2233445', 'Murree Road, RWP', 30000],
  ['Faisal Mobile Zone', '0302-7788990', 'G-9 Markaz, Islamabad', 50000],
  ['Zain Mobile Clinic', '0315-1122334', 'Chandni Chowk, RWP', 25000],
  ['Imran Repairing Center', '0322-4455667', 'F-10 Markaz, Islamabad', 70000],
  ['Kashif Cell Point', '0346-6677889', 'Bahria Town Phase 4', 35000],
  ['Shahid Mobile Doctor', '0300-9090901', 'Taxila', 30000],
  ['Noman Tech Solutions', '0313-8080807', 'Wah Cantt', 45000],
];

const WALKINS = ['Ahmed', 'Sana', 'Tariq', 'Rizwan', 'Waqas', 'Asif', 'Kamran', 'Sohail', 'Nadeem', 'Junaid'];

export const DEMO_ACCOUNTS = [
  { name: 'Demo Admin', username: 'demo-admin', pin: '4444', role: 'owner' as const },
  { name: 'Saad (Manager)', username: 'manager', pin: '2222', role: 'manager' as const },
  { name: 'Hassan', username: 'hassan', pin: '1111', role: 'cashier' as const },
  { name: 'Umer', username: 'umer', pin: '3333', role: 'cashier' as const },
];

export async function buildDemo(ownerName: string): Promise<{ db: DB; demoUsers: { name: string; username: string; pin: string; role: string }[] }> {
  const rand = rng(20261117);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const now = new Date();
  const DAYS = 60;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS);
  const at = (dayOffset: number, h: number, m: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, Math.floor(rand() * 60), 0);
    return d;
  };
  const iso = (d: Date) => d.toISOString();
  const openIso = iso(at(0, 9, 0));

  const demoUsers = DEMO_ACCOUNTS.filter((u) => u.role !== 'owner');
  const users: User[] = [];
  for (const u of demoUsers) {
    users.push({ id: 'u-' + u.username, name: u.name, username: u.username, role: u.role, pinHash: await hashPin(u.username, u.pin), active: true, createdAt: openIso });
  }

  const suppliers: Party[] = SUPPLIERS.map(([name, phone, city, address, lead], i) => ({
    id: 'sup' + (i + 1), type: 'supplier', name, phone, city, address, opening: i === 1 ? 45000 : 0, leadDays: lead, createdAt: openIso,
  }));
  const customers: Party[] = CUSTOMERS.map(([name, phone, city, limit], i) => ({
    id: 'cus' + (i + 1), type: 'customer', name, phone, city, shop: name, opening: i === 2 ? 18000 : i === 6 ? 9500 : 0, creditLimit: limit, createdAt: openIso,
  }));

  const products: Product[] = CATALOGUE.map(([name, category, brand, unit, cost, price, minStock], i) => ({
    id: 'p' + String(i + 1).padStart(3, '0'),
    name, category, brand, unit, cost, price,
    wholesale: Math.round((cost + (price - cost) * 0.55) / 10) * 10,
    minStock, stock: 0,
    barcode: '200' + String(100000000 + i * 7919).slice(0, 9) + '0',
    supplierId: suppliers[cost > 12000 ? 2 : i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : 3].id,
    shelf: `${String.fromCharCode(65 + (i % 6))}-${1 + (i % 8)}`,
    warranty: cost > 5000 ? (cost > 30000 ? '1 year' : '6 months') : '',
    active: true, createdAt: openIso, updatedAt: openIso,
  }));
  // A valid check digit on each demo barcode.
  products.forEach((p) => {
    const body = p.barcode.slice(0, 12);
    const sum = body.split('').reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
    p.barcode = body + ((10 - (sum % 10)) % 10);
  });
  const weights = CATALOGUE.map((c) => c[7]);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const pickProduct = () => {
    let r = rand() * wsum;
    for (let i = 0; i < products.length; i++) {
      r -= weights[i];
      if (r <= 0) return products[i];
    }
    return products[products.length - 1];
  };

  /* ---- sales ---- */
  const sales: Sale[] = [];
  const sold = new Map<string, number>();
  const counters = DEFAULT_SETTINGS.counters;
  const seq: Record<string, number> = {};
  for (let d = 1; d <= DAYS; d++) {
    const date = at(d, 0, 0);
    if (date.getDay() === 0 && rand() < 0.7) continue; // most Sundays closed
    const weekend = date.getDay() === 6;
    const n = Math.floor(9 + rand() * 12 + (weekend ? 5 : 0) + d * 0.08);
    for (let b = 0; b < n; b++) {
      const counter = rand() < 0.55 ? counters[0] : counters[1];
      const cashier = counter === counters[0] ? users[1] : users[2];
      const lines: Sale['items'] = [];
      const k = 1 + Math.floor(rand() * rand() * 4);
      const isTech = rand() < 0.35;
      const customer = isTech ? pick(customers) : undefined;
      for (let j = 0; j < k; j++) {
        const p = pickProduct();
        if (lines.find((l) => l.productId === p.id)) continue;
        const qty = p.price < 1000 ? 1 + Math.floor(rand() * (isTech ? 5 : 3)) : 1;
        const price = isTech && p.wholesale ? p.wholesale : p.price;
        lines.push({ productId: p.id, name: p.name, barcode: p.barcode, qty, price, cost: p.cost, disc: 0 });
        sold.set(p.id, (sold.get(p.id) || 0) + qty);
      }
      if (!lines.length) continue;
      const subtotal = lines.reduce((a, l) => a + lineNet(l), 0);
      const discount = subtotal > 5000 && rand() < 0.35 ? Math.round((subtotal * (0.01 + rand() * 0.03)) / 50) * 50 : 0;
      const total = subtotal - discount;
      const r = rand();
      let payments: Sale['payments'];
      if (customer && r < 0.55) {
        const part = rand() < 0.4 ? Math.round((total * 0.4) / 100) * 100 : 0;
        payments = part ? [{ method: 'Cash', amount: part }, { method: 'Khata', amount: total - part }] : [{ method: 'Khata', amount: total }];
      } else if (r < 0.62) payments = [{ method: 'Cash', amount: total }];
      else if (r < 0.78) payments = [{ method: 'JazzCash', amount: total }];
      else if (r < 0.9) payments = [{ method: 'Easypaisa', amount: total }];
      else payments = [{ method: 'Bank', amount: total }];
      const code = counterCode(counter);
      seq[code] = (seq[code] || 0) + 1;
      const t = at(d, 10 + Math.floor((b / n) * 10), Math.floor(rand() * 60));
      const cash = payments.find((p) => p.method === 'Cash')?.amount || 0;
      const received = cash ? Math.ceil(cash / 500) * 500 : 0;
      sales.push({
        id: `s-${d}-${b}`, no: `${code}-${String(seq[code]).padStart(5, '0')}`, date: iso(t), counter, userId: cashier.id, userName: cashier.name,
        customerId: customer?.id, customerName: customer?.name || (rand() < 0.3 ? pick(WALKINS) : undefined), customerPhone: customer?.phone,
        items: lines, subtotal, discount, total, payments, cashReceived: received || undefined, change: received ? received - cash : 0,
        priceType: isTech ? 'wholesale' : 'retail', status: 'completed',
      });
    }
  }
  // One cancelled bill to show how voids look.
  const v = sales[Math.floor(sales.length * 0.6)];
  v.status = 'void';
  v.voidReason = 'Customer changed mind before leaving the counter';
  v.voidedBy = ownerName;
  v.items.forEach((i) => sold.set(i.productId, (sold.get(i.productId) || 0) - i.qty));

  /* ---- returns ---- */
  const returns: SaleReturn[] = [];
  const back = new Map<string, number>();
  [0.2, 0.45, 0.7, 0.9].forEach((f, i) => {
    const s = sales[Math.floor(sales.length * f)];
    if (s.status === 'void') return;
    const it = s.items[0];
    const restock = i !== 2;
    const unit = (lineNet(it) - (s.discount * lineNet(it)) / s.subtotal) / it.qty;
    const rt: SaleReturn = {
      id: 'r' + i, no: 'RT-' + String(i + 1).padStart(4, '0'), date: iso(new Date(new Date(s.date).getTime() + 86400000 * (1 + i))), saleId: s.id, saleNo: s.no,
      customerId: s.customerId, customerName: s.customerName, items: [{ productId: it.productId, name: it.name, qty: 1, price: round2(unit), cost: it.cost, restock }],
      total: round2(unit), refundMethod: s.customerId && s.payments.some((p) => p.method === 'Khata') ? 'Khata' : 'Cash',
      reason: restock ? 'Customer bought wrong model' : 'Faulty piece — sent back to supplier', userName: s.userName, counter: s.counter,
    };
    returns.push(rt);
    if (restock) back.set(it.productId, (back.get(it.productId) || 0) + 1);
  });

  /* ---- purchases (two rounds of restocking per supplier) ---- */
  const purchases: Purchase[] = [];
  const bought = new Map<string, number>();
  let poN = 0;
  [18, 40].forEach((day) => {
    suppliers.forEach((sup) => {
      const items = products
        .filter((p) => p.supplierId === sup.id && (sold.get(p.id) || 0) > 0)
        .map((p) => ({ productId: p.id, name: p.name, qty: Math.max(2, Math.ceil((sold.get(p.id) || 0) * 0.45)), cost: p.cost, received: 0 }));
      if (!items.length) return;
      items.forEach((i) => {
        i.received = i.qty;
        bought.set(i.productId, (bought.get(i.productId) || 0) + i.qty);
      });
      poN++;
      const d = at(day + (poN % 3), 12, 30);
      purchases.push({
        id: 'po' + poN, no: 'PO-' + String(poN).padStart(4, '0'), date: iso(d), supplierId: sup.id, supplierName: sup.name, items,
        total: items.reduce((a, i) => a + i.qty * i.cost, 0), status: 'received', ref: 'INV-' + (3100 + poN * 7), userName: ownerName, receivedAt: iso(new Date(d.getTime() + 86400000 * Math.min(sup.leadDays || 2, 5))),
      });
    });
  });
  // An open order still on its way.
  const pending = products.filter((p) => p.supplierId === 'sup2').slice(0, 4);
  purchases.push({
    id: 'po-open', no: 'PO-' + String(++poN).padStart(4, '0'), date: iso(at(DAYS - 2, 11, 0)), supplierId: 'sup2', supplierName: suppliers[1].name,
    items: pending.map((p) => ({ productId: p.id, name: p.name, qty: Math.max(5, p.minStock * 2), cost: p.cost, received: 0 })),
    total: pending.reduce((a, p) => a + Math.max(5, p.minStock * 2) * p.cost, 0), status: 'ordered', userName: ownerName,
  });

  /* ---- opening stock so the closing stock lands where we want it ---- */
  const moves: StockMove[] = [];
  products.forEach((p, i) => {
    const s = sold.get(p.id) || 0;
    const b = bought.get(p.id) || 0;
    const r = back.get(p.id) || 0;
    // Most items healthy, a few low, a couple out of stock, for a realistic alert list.
    const target = i % 13 === 5 ? 0 : i % 9 === 4 ? Math.max(1, p.minStock - 1) : p.minStock + 2 + Math.floor(rand() * p.minStock * 2.5);
    const opening = Math.max(0, target - b - r + s);
    p.stock = opening + b + r - s;
    moves.push({ id: 'mo' + p.id, date: openIso, productId: p.id, productName: p.name, type: 'opening', qty: opening, cost: p.cost, balance: opening, note: 'Opening stock', userName: ownerName });
  });
  // Movement log for the last week of sales, purchases and returns (older history stays in the bills).
  const recent = new Date(now.getTime() - 7 * 86400000);
  const stockNow = new Map(products.map((p) => [p.id, p.stock]));
  type Ev = { date: string; productId: string; qty: number; type: StockMove['type']; ref: string; cost: number; user: string; counter?: string };
  const evs: Ev[] = [];
  sales.forEach((s) => s.status === 'completed' && s.items.forEach((i) => evs.push({ date: s.date, productId: i.productId, qty: -i.qty, type: 'sale', ref: s.no, cost: i.cost, user: s.userName, counter: s.counter })));
  purchases.forEach((p) => p.status === 'received' && p.items.forEach((i) => evs.push({ date: p.receivedAt!, productId: i.productId, qty: i.received, type: 'purchase', ref: p.no, cost: i.cost, user: ownerName })));
  returns.forEach((r) => r.items.forEach((i) => i.restock && evs.push({ date: r.date, productId: i.productId, qty: i.qty, type: 'return', ref: r.no, cost: i.cost, user: r.userName, counter: r.counter })));
  evs.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first, walking the balance backwards
  const bal = new Map(stockNow);
  evs.forEach((e, k) => {
    const after = bal.get(e.productId) || 0;
    bal.set(e.productId, after - e.qty);
    if (new Date(e.date) < recent) return;
    const p = products.find((x) => x.id === e.productId)!;
    moves.push({ id: 'mv' + k, date: e.date, productId: e.productId, productName: p.name, type: e.type, qty: e.qty, cost: e.cost, balance: after, ref: e.ref, userName: e.user, counter: e.counter });
  });
  const dmg = products[10];
  moves.push({ id: 'mdmg', date: iso(at(DAYS - 3, 17, 10)), productId: dmg.id, productName: dmg.name, type: 'damage', qty: -1, cost: dmg.cost, balance: dmg.stock, note: 'Syringe dried out', userName: users[0].name, counter: counters[0] });
  dmg.stock -= 1;
  moves[moves.length - 1].balance = dmg.stock;

  /* ---- khata payments ---- */
  const payments: Payment[] = [];
  let pn = 0;
  customers.forEach((c) => {
    const owed = sales.filter((s) => s.customerId === c.id && s.status === 'completed').reduce((a, s) => a + (s.payments.find((p) => p.method === 'Khata')?.amount || 0), 0) + c.opening;
    // Some customers pay most of it, some are slow (to show overdue reminders).
    const share = ['cus4', 'cus9'].includes(c.id) ? 0.1 : 0.55 + rand() * 0.35;
    let left = Math.round((owed * share) / 500) * 500;
    let day = 8;
    let paidSoFar = 0;
    while (left > 0 && day < DAYS) {
      // Never pay more than has been charged by that day.
      const cutoff = iso(at(day, 15, 0));
      const charged = c.opening + sales.filter((s) => s.customerId === c.id && s.status === 'completed' && s.date < cutoff).reduce((a, s) => a + (s.payments.find((p) => p.method === 'Khata')?.amount || 0), 0);
      const room = Math.floor((charged - paidSoFar) / 500) * 500;
      const amt = Math.min(left, room, Math.round((5000 + rand() * 25000) / 500) * 500);
      if (amt >= 500) {
        left -= amt;
        paidSoFar += amt;
        payments.push({ id: 'pay' + ++pn, date: cutoff, partyId: c.id, partyType: 'customer', partyName: c.name, dir: 'in', amount: amt, method: rand() < 0.6 ? 'Cash' : 'JazzCash', userName: users[1].name, counter: counters[0] });
      }
      day += 6 + Math.floor(rand() * 10);
    }
  });
  purchases.forEach((p) => {
    if (p.status !== 'received') return;
    const paid = p.supplierId === 'sup3' ? p.total : Math.round((p.total * (p.date < iso(at(30, 0, 0)) ? 1 : 0.6)) / 1000) * 1000;
    payments.push({ id: 'pay' + ++pn, date: p.receivedAt!, partyId: p.supplierId, partyType: 'supplier', partyName: p.supplierName, dir: 'out', amount: paid, method: 'Bank', purchaseId: p.id, note: 'Against ' + p.no, userName: ownerName });
  });

  /* ---- expenses ---- */
  const expenses: Expense[] = [];
  let en = 0;
  const addExp = (day: number, category: string, amount: number, payee: string, method: Expense['method'] = 'Cash') =>
    expenses.push({ id: 'e' + ++en, date: iso(at(day, 18, 0)), category, amount, method, payee, userName: ownerName });
  [1, 31].forEach((d) => {
    addExp(d, 'Rent', 85000, 'Plaza owner', 'Bank');
    addExp(d + 4, 'Electricity', 18500 + Math.floor(rand() * 4000), 'IESCO bill', 'Bank');
    addExp(d + 5, 'Internet & Phone', 4500, 'Nayatel');
    addExp(d + 2, 'Salaries', 45000, 'Hassan, Umer (cashiers)', 'Bank');
    addExp(d + 2, 'Salaries', 55000, 'Saad (manager)', 'Bank');
  });
  for (let d = 1; d <= DAYS; d += 1) {
    if (rand() < 0.75) addExp(d, 'Tea & Refreshment', 300 + Math.floor(rand() * 500), 'Tea boy');
    if (rand() < 0.15) addExp(d, 'Transport & Delivery', 800 + Math.floor(rand() * 2000), 'TCS / Leopards');
  }
  addExp(25, 'Packing Material', 6500, 'Shoppers & boxes');
  addExp(47, 'Repairs & Maintenance', 3800, 'AC service');

  const cashtx: CashTx[] = [
    { id: 'ct1', date: iso(at(15, 19, 0)), kind: 'transfer', from: 'Cash', to: 'Bank', amount: 500000, note: 'Deposited in Meezan Bank', userName: ownerName },
    { id: 'ct2', date: iso(at(20, 19, 0)), kind: 'transfer', from: 'JazzCash', to: 'Bank', amount: 300000, note: 'JazzCash to bank', userName: ownerName },
    { id: 'ct3', date: iso(at(35, 19, 0)), kind: 'transfer', from: 'Easypaisa', to: 'Bank', amount: 300000, note: 'Easypaisa to bank', userName: ownerName },
    { id: 'ct4', date: iso(at(45, 19, 0)), kind: 'transfer', from: 'Cash', to: 'Bank', amount: 550000, note: 'Deposited in Meezan Bank', userName: ownerName },
    { id: 'ct5', date: iso(at(50, 19, 0)), kind: 'transfer', from: 'JazzCash', to: 'Bank', amount: 250000, note: 'JazzCash to bank', userName: ownerName },
    { id: 'ct6', date: iso(at(55, 19, 0)), kind: 'transfer', from: 'Cash', to: 'Bank', amount: 400000, note: 'Deposited in Meezan Bank', userName: ownerName },
    { id: 'ct7', date: iso(at(30, 20, 0)), kind: 'drawing', from: 'Cash', amount: 50000, note: 'Home expenses', userName: ownerName },
  ];

  const db: DB = {
    settings: [{ ...DEFAULT_SETTINGS, opening: { Cash: 150000, Bank: 900000, JazzCash: 20000, Easypaisa: 10000 } }],
    users, products, parties: [...suppliers, ...customers], sales, returns, purchases, payments, moves, expenses, cashtx,
    closes: [], held: [],
    audit: [{ id: 'a0', date: new Date().toISOString(), userName: ownerName, action: 'Demo data loaded', detail: `${products.length} products, ${sales.length} bills, ${customers.length} customers, ${suppliers.length} suppliers`, tone: 'info' }],
  };
  return { db, demoUsers: demoUsers.map((u) => ({ ...u })) };
}
