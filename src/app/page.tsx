'use client';

import { AppProvider } from '../context/AppContext';
import { Shell } from '../components/Shell';
import { AppearanceProvider } from '../context/AppearanceContext';

export default function Home() {
  return (
    <AppProvider>
      <AppearanceProvider>
        <Shell />
      </AppearanceProvider>
    </AppProvider>
  );
}
