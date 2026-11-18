# New Al-Aziz Traders CRM — POS & Inventory

Billing, stock, purchases, khata, cash book and profit reports for a mobile-repairing tools shop
with two counters. Built on the Property CRM stack and design (Next.js 16, React 19, TypeScript,
Firebase). The AI and hardware-integration modules from the proposal are left out.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in out/ — host anywhere (Vercel, Firebase Hosting)
```

## Client demo

Without Firebase keys, new browsers automatically receive sample data and these demo accounts:

| Person | Role | PIN |
|---|---|---|
| Demo Admin | Owner / Admin | 4444 |
| Saad | Manager | 2222 |
| Hassan | Cashier | 1111 |
| Umer | Cashier | 3333 |

Click a demo account on the login screen to fill the name and PIN, then click **Sign in**.
Each browser keeps its own data in IndexedDB. Existing browser data is preserved.
Demo buttons appear only for active accounts whose PIN still matches the sample PIN.
Set `NEXT_PUBLIC_DEMO_MODE=false` before building to disable automatic demo setup and
login shortcuts for a real shop. Cloud mode always disables these demo features.

## Where the data lives

| Mode | When | What it means |
|---|---|---|
| **Local** (amber “Local” badge) | no Firebase keys | Data is kept in this browser (IndexedDB). Open tabs stay in sync, so two windows act as two counters. Good for trials. |
| **Cloud** (green “Live” badge) | `.env.local` has Firebase keys | Both counters and the owner’s phone share one Firestore database, live. Works through short internet drops (offline cache). |

### Connecting the cloud (two counters)

1. Create a Firebase project → add a Web app → copy its config into `.env.local` (see `.env.local.example`).
2. Firestore Database → Create database.
3. Authentication → Email/Password → add one user, e.g. `shop@yourdomain.com` (the shop account).
4. Put that email in `firestore.rules` and publish the rules (`firebase deploy --only firestore:rules` or paste in the console).
5. `npm run build` and host `out/`. On each counter, sign in once with the shop account; staff then use their PINs.

## Modules

- **POS Billing** — scan (USB scanner works anywhere on the screen) or search, categories & top sellers, retail/wholesale price,
  line and bill discounts (cashier limit), Cash / Bank / JazzCash / Easypaisa / Khata / split payment, cash received & change,
  hold & resume bills, 80 mm / 58 mm slip or A4 invoice, WhatsApp bill (wa.me link), F2 / F9 shortcuts.
- **Sales & Returns** — every bill with filters, reprint, partial returns (back to shelf or damaged), cancel bill (owner).
- **Products** — catalogue with stock colours, margin, slow movers, CSV import/export, barcode labels (Code 128, A4 sheets), categories.
- **Stock IN / OUT** — stock in, out, damage; full movement history with running balance; stock count with gain/loss; stock value.
- **Purchases** — purchase orders, receive (partial), pay supplier, WhatsApp order; *What to buy* from sales speed and supplier delivery time.
- **Khata** — customer & supplier ledgers with running balance, credit limits, ageing, payments, WhatsApp reminders, printable statement.
- **Cash & Bank** — live balance of each account, cash book, transfers, owner capital/drawings, day closing with note counter.
- **Expenses**, **Reports** (P&L, day by day, products, categories, staff & counters, khata ageing), **Alerts**, **Dashboard**.
- **Settings** — shop & receipt, users with Owner / Manager / Cashier roles and PINs, lists, backup download / restore, daily snapshots, activity log.

## Colours

Green = profit, money in, in stock, paid · Red = loss, money out, out of stock, unpaid · Amber = low stock, discount, due ·
Purple = khata / credit · Violet = returns. Every module and every payment method keeps its own colour.

## How the numbers work

- Stock changes only through movements (sale, purchase, return, cancel, stock in/out, damage, count), each logged.
  Stock is changed with an atomic increment, so two counters selling the same item never overwrite each other.
- Cost is the weighted average of purchases; each bill line stores the cost at the moment of sale.
- Net sales = bill prices − discounts − returns. Gross profit = net sales − cost of goods sold.
  Net profit = gross profit − damaged/lost stock − expenses. Owner drawings and transfers are not expenses.
- Khata balances are worked out from bills, returns and payments — never typed in — so they cannot drift.
