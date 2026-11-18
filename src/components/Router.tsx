'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { moduleOf } from '../lib/nav';
import { Page, Empty } from './Shared';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { SalesPage } from './pages/SalesPage';
import { ProductsPage } from './pages/ProductsPage';
import { StockPage } from './pages/StockPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { KhataPage } from './pages/KhataPage';
import { CashPage } from './pages/CashPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SearchPage } from './pages/SearchPage';
import { AppearancePage } from './pages/AppearancePage';

const PAGES: Record<string, React.ComponentType> = {
  home: HomePage, dashboard: DashboardPage, pos: PosPage, sales: SalesPage, products: ProductsPage, stock: StockPage,
  purchases: PurchasesPage, khata: KhataPage, cash: CashPage, expenses: ExpensesPage, reports: ReportsPage,
  settings: SettingsPage, search: SearchPage, appearance: AppearancePage,
};

/** The first tab of a module this user may open — used when the address names none. */
export function useTab(): string {
  const { page, tab, can } = useApp();
  const m = moduleOf(page);
  if (!m) return tab;
  const allowed = m.tabs.filter((t) => !t.need || can(t.need));
  return allowed.find((t) => t.id === tab)?.id || allowed[0]?.id || tab;
}

export function Router() {
  const { page, can, me } = useApp();
  const m = moduleOf(page);
  const tab = useTab();
  const t = m?.tabs.find((x) => x.id === tab);
  const blocked = (m?.need && !can(m.need)) || (t?.need && !can(t.need));
  if (blocked) {
    return (
      <Page title={m!.label}>
        <Empty title="Not available for your role" icon={<Lock size={34} />}>
          {me?.name} is signed in as <b>{me?.role}</b>. Ask the owner if you need access to {m!.label.toLowerCase()}.
        </Empty>
      </Page>
    );
  }
  const C = PAGES[page];
  if (!C)
    return (
      <Page title="Page not found">
        <Empty title="This page does not exist" />
      </Page>
    );
  return <C />;
}
