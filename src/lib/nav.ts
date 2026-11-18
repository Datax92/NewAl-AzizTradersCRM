import type { Perm } from './logic';

export interface NavTab {
  id: string;
  label: string;
  need?: Perm;
}

export interface NavModule {
  id: string;
  label: string;
  urdu: string;
  need?: Perm;
  tabs: NavTab[];
}

/** The modules, each with its own menu in the navbar — the same pattern as Property CRM. */
export const NAV: NavModule[] = [
  { id: 'dashboard', label: 'Dashboard', urdu: 'ڈیش بورڈ', tabs: [{ id: 'overview', label: 'Dashboard' }, { id: 'alerts', label: 'Alerts' }] },
  { id: 'pos', label: 'Billing', urdu: 'بلنگ', need: 'pos', tabs: [{ id: 'new', label: 'New bill' }, { id: 'held', label: 'Held bills' }] },
  { id: 'sales', label: 'Sales', urdu: 'فروخت', tabs: [{ id: 'bills', label: 'Sales register' }, { id: 'returns', label: 'Returns' }] },
  { id: 'products', label: 'Products', urdu: 'مصنوعات', tabs: [{ id: 'list', label: 'Products' }, { id: 'labels', label: 'Barcode labels' }, { id: 'categories', label: 'Categories' }] },
  { id: 'stock', label: 'Stock', urdu: 'اسٹاک', need: 'stock', tabs: [{ id: 'entry', label: 'Stock IN / OUT' }, { id: 'log', label: 'Stock movements' }, { id: 'count', label: 'Stock count' }, { id: 'value', label: 'Stock value', need: 'cost.view' }] },
  { id: 'purchases', label: 'Purchases', urdu: 'خریداری', need: 'purchases', tabs: [{ id: 'orders', label: 'Purchase register' }, { id: 'suggest', label: 'What to buy' }] },
  { id: 'khata', label: 'Khata', urdu: 'کھاتہ', need: 'khata', tabs: [{ id: 'customers', label: 'Customers' }, { id: 'suppliers', label: 'Suppliers', need: 'purchases' }] },
  { id: 'cash', label: 'Bank & Cash', urdu: 'بینک و نقد', need: 'cashbook', tabs: [{ id: 'accounts', label: 'Accounts' }, { id: 'book', label: 'Account statement' }, { id: 'closing', label: 'Day closing' }] },
  { id: 'expenses', label: 'Expenses', urdu: 'اخراجات', need: 'expenses', tabs: [{ id: 'list', label: 'Expenses' }, { id: 'summary', label: 'By category' }] },
  { id: 'reports', label: 'Reports', urdu: 'رپورٹس', need: 'reports', tabs: [{ id: 'pnl', label: 'Profit & loss', need: 'profit' }, { id: 'daily', label: 'Day by day' }, { id: 'products', label: 'Product sales' }, { id: 'staff', label: 'Staff & counters' }, { id: 'khata', label: 'Khata ageing' }] },
  { id: 'settings', label: 'Admin', urdu: 'انتظام', tabs: [{ id: 'shop', label: 'Shop & receipt', need: 'settings' }, { id: 'users', label: 'Users & roles', need: 'users' }, { id: 'lists', label: 'Lists', need: 'settings' }, { id: 'backup', label: 'Backup', need: 'backup' }, { id: 'audit', label: 'Audit trail', need: 'settings' }, { id: 'me', label: 'My PIN' }] },
];

export function moduleOf(id: string) {
  return NAV.find((m) => m.id === id);
}

export interface Tile {
  id: string;
  icon: string; // AppIcons artwork
  label: string;
  go: string;
  need?: Perm;
}

/** Home screen icons: one per thing the shop does, like Property CRM's launcher. */
export const TILES: Tile[] = [
  { id: 'dash', icon: 'dashboard', label: 'Dashboard', go: 'dashboard/overview' },
  { id: 'pos', icon: 'pos', label: 'New Bill', go: 'pos/new', need: 'pos' },
  { id: 'sales', icon: 'sales', label: 'Sales Register', go: 'sales/bills' },
  { id: 'returns', icon: 'returns', label: 'Returns', go: 'sales/returns' },
  { id: 'products', icon: 'inventory', label: 'Products', go: 'products/list' },
  { id: 'stock', icon: 'stock', label: 'Stock IN / OUT', go: 'stock/entry', need: 'stock' },
  { id: 'purchases', icon: 'truck', label: 'Purchases', go: 'purchases/orders', need: 'purchases' },
  { id: 'suggest', icon: 'suggest', label: 'What to Buy', go: 'purchases/suggest', need: 'purchases' },
  { id: 'khata', icon: 'khata', label: 'Customer Khata', go: 'khata/customers', need: 'khata' },
  { id: 'payables', icon: 'receivables', label: 'Supplier Khata', go: 'khata/suppliers', need: 'purchases' },
  { id: 'cash', icon: 'cash', label: 'Cash in Hand', go: 'cash/accounts', need: 'cashbook' },
  { id: 'expenses', icon: 'expenses', label: 'Expenses', go: 'expenses/list', need: 'expenses' },
  { id: 'pnl', icon: 'pnl', label: 'Profit & Loss', go: 'reports/pnl', need: 'profit' },
  { id: 'daily', icon: 'net', label: 'Day by Day', go: 'reports/daily', need: 'reports' },
  { id: 'psales', icon: 'gross', label: 'Product Sales', go: 'reports/products', need: 'reports' },
  { id: 'closing', icon: 'closing', label: 'Day Closing', go: 'cash/closing', need: 'cashbook' },
  { id: 'labels', icon: 'labels', label: 'Barcode Labels', go: 'products/labels' },
  { id: 'count', icon: 'count', label: 'Stock Count', go: 'stock/count', need: 'stock' },
  { id: 'value', icon: 'value', label: 'Stock Value', go: 'stock/value', need: 'cost.view' },
  { id: 'staff', icon: 'agents', label: 'Staff & Counters', go: 'reports/staff', need: 'reports' },
  { id: 'alerts', icon: 'alerts', label: 'Alerts', go: 'dashboard/alerts' },
  { id: 'admin', icon: 'admin', label: 'Admin', go: 'settings/shop', need: 'settings' },
  { id: 'backup', icon: 'backup', label: 'Backup', go: 'settings/backup', need: 'backup' },
  { id: 'appearance', icon: 'appearance', label: 'Appearance', go: 'appearance' },
  { id: 'account', icon: 'account', label: 'My Account', go: 'settings/me' },
];
