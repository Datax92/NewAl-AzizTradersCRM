/* Every record the shop keeps. Dates are ISO strings so they travel unchanged
   between the browser, IndexedDB, Firestore and a backup file. */

export type Role = 'owner' | 'manager' | 'cashier';
export type Account = 'Cash' | 'Bank' | 'JazzCash' | 'Easypaisa';
export type PayMethod = Account | 'Khata';

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  pinHash: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  category: string;
  brand?: string;
  unit: string;
  cost: number; // weighted average purchase cost
  price: number; // retail price
  wholesale?: number; // price for bulk / technician buyers
  minStock: number;
  stock: number;
  supplierId?: string;
  shelf?: string;
  warranty?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Party {
  id: string;
  type: 'customer' | 'supplier';
  name: string;
  phone?: string;
  shop?: string;
  city?: string;
  address?: string;
  opening: number; // customer: they owe us · supplier: we owe them
  creditLimit?: number;
  leadDays?: number; // supplier delivery time, for reorder suggestions
  notes?: string;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  barcode?: string;
  qty: number;
  price: number; // unit price charged
  cost: number; // unit cost at the moment of sale
  disc: number; // line discount in rupees
}

export interface PayLine {
  method: PayMethod;
  amount: number;
}

export interface Sale {
  id: string;
  no: string;
  date: string;
  counter: string;
  userId: string;
  userName: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal: number; // after line discounts
  discount: number; // bill discount
  total: number;
  payments: PayLine[];
  cashReceived?: number;
  change?: number;
  priceType: 'retail' | 'wholesale';
  status: 'completed' | 'void';
  voidReason?: string;
  voidedBy?: string;
  note?: string;
}

export interface ReturnItem {
  productId: string;
  name: string;
  qty: number;
  price: number; // refund per unit (net of discounts)
  cost: number;
  restock: boolean; // false = damaged, written off
}

export interface SaleReturn {
  id: string;
  no: string;
  date: string;
  saleId: string;
  saleNo: string;
  customerId?: string;
  customerName?: string;
  items: ReturnItem[];
  total: number;
  refundMethod: PayMethod; // Khata = reduce what the customer owes
  reason?: string;
  userName: string;
  counter: string;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  qty: number;
  cost: number;
  received: number;
}

export interface Purchase {
  id: string;
  no: string;
  date: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  total: number; // ordered value
  status: 'ordered' | 'partial' | 'received' | 'cancelled';
  ref?: string; // supplier's bill number
  note?: string;
  userName: string;
  receivedAt?: string;
}

/** Money paid to or received from a customer / supplier outside a bill. */
export interface Payment {
  id: string;
  date: string;
  partyId: string;
  partyType: 'customer' | 'supplier';
  partyName: string;
  dir: 'in' | 'out';
  amount: number;
  method: Account;
  purchaseId?: string;
  note?: string;
  userName: string;
  counter?: string;
}

export type MoveType = 'sale' | 'purchase' | 'return' | 'void' | 'in' | 'out' | 'damage' | 'adjust' | 'opening';

export interface StockMove {
  id: string;
  date: string;
  productId: string;
  productName: string;
  type: MoveType;
  qty: number; // signed
  cost: number; // unit cost used to value the movement
  balance: number; // stock after the movement, as seen by this counter
  ref?: string;
  note?: string;
  userName: string;
  counter?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  method: Account;
  payee?: string;
  note?: string;
  userName: string;
}

/** Money moved between the shop's own accounts, or put in / taken out by the owner. */
export interface CashTx {
  id: string;
  date: string;
  kind: 'transfer' | 'capital' | 'drawing';
  from?: Account;
  to?: Account;
  amount: number;
  note?: string;
  userName: string;
}

export interface DayClose {
  id: string;
  date: string; // YYYY-MM-DD
  counter: string;
  expected: number;
  counted: number;
  diff: number;
  note?: string;
  userName: string;
  closedAt: string;
}

export interface Held {
  id: string;
  date: string;
  counter: string;
  userName: string;
  label: string;
  cart: any;
}

export interface AuditEntry {
  id: string;
  date: string;
  userName: string;
  action: string;
  detail: string;
  tone?: 'good' | 'bad' | 'warn' | 'info';
}

export interface Settings {
  id: 'shop';
  shopName: string;
  contactName?: string;
  secondaryContactName?: string;
  secondaryPhone?: string;
  tagline: string;
  address: string;
  phone: string;
  whatsapp: string;
  whatsappUrl?: string;
  ntn?: string;
  receiptFooter: string;
  counters: string[];
  categories: string[];
  expenseCategories: string[];
  units: string[];
  cashierDiscountLimit: number; // percent
  bigDiscountAlert: number; // percent
  overdueDays: number;
  opening: Record<Account, number>;
  lastBackupAt?: string;
}

export interface DB {
  settings: Settings[];
  users: User[];
  products: Product[];
  parties: Party[];
  sales: Sale[];
  returns: SaleReturn[];
  purchases: Purchase[];
  payments: Payment[];
  moves: StockMove[];
  expenses: Expense[];
  cashtx: CashTx[];
  closes: DayClose[];
  held: Held[];
  audit: AuditEntry[];
}

export type Coll = keyof DB;
export const COLLS: Coll[] = [
  'settings', 'users', 'products', 'parties', 'sales', 'returns', 'purchases',
  'payments', 'moves', 'expenses', 'cashtx', 'closes', 'held', 'audit',
];

export interface Session {
  userId: string;
  name: string;
  role: Role;
  counter: string;
}
