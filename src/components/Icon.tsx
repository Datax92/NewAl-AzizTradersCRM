'use client';

import React from 'react';
import {
  ShoppingCart, LayoutDashboard, Receipt, Package, ArrowDownUp, Truck, BookOpen, Landmark, Wallet,
  ChartColumn, Settings, Bell, Circle, House,
} from 'lucide-react';

const MAP: Record<string, React.ComponentType<any>> = {
  ShoppingCart, LayoutDashboard, Receipt, Package, ArrowDownUp, Truck, BookOpen, Landmark, Wallet, ChartColumn, Settings, Bell, House,
};

/** Module icon by name, so module definitions can stay plain data. */
export function Icon({ name, size = 18, ...rest }: { name: string; size?: number; strokeWidth?: number; className?: string }) {
  const C = MAP[name] || Circle;
  return <C size={size} {...rest} />;
}
