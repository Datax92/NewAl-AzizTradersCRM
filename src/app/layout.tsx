import { SHOP_DETAILS } from '../lib/shop-details';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import Script from 'next/script';
import { EARLY_APPLY_SCRIPT } from '../lib/appearance';

export const metadata: Metadata = {
  title: `${SHOP_DETAILS.shopName} — POS & Inventory`,
  description: 'Billing, stock, purchases, khata, cash book and profit reports for New Al-Aziz Traders, mobile parts wholesale dealer in Rawalpindi.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1F2456' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="signature" data-icons="classic" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* The saved theme and icon pack go on the page before it is drawn, so a reload never flashes the default colours. */}
        <Script id="saved-look" strategy="beforeInteractive">
          {EARLY_APPLY_SCRIPT}
        </Script>
      </body>
    </html>
  );
}
