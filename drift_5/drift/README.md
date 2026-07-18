# drift

A small, minimal ecommerce storefront. People browse, add a few things to their
bag, and send it to your WhatsApp as a pre-written order — no payment
processing, no card details, just a normal shop that hands you the order and
gets out of the way.

## What's inside

- **Storefront** (`/`) — the shop everyone sees.
- **Admin panel** (`/admin`) — only for you. Add, edit, and remove items;
  change your shop name, currency, and WhatsApp number; change your password.
- **Backend** — plain Node.js, no npm packages to install, data saved to a
  JSON file on disk (`data/products.json`, `data/config.json`).

## Running it

You need [Node.js](https://nodejs.org) 18 or newer installed. Then:

```bash
cd drift
node server.js
```

Open **http://localhost:3000** for the shop, and **http://localhost:3000/admin**
for your admin panel.

## First-time setup (do this before sharing the link with anyone)

1. Go to `/admin`.
2. Sign in with the default password: **drift2026**
3. Go to **Settings** and:
   - Set your **WhatsApp number** — digits only, with country code, no `+`
     and no leading zero (e.g. a Ghana number `024 123 4567` becomes
     `233241234567`).
   - Set your shop name and currency symbol.
4. Go to **change password** on the same page and set a real password.
   The default one is public in this README — don't leave it as is.
5. Go to the **items** tab and delete the four sample products, then add
   your own (name, price, description, a photo or an image URL).

Every order placed on the storefront opens WhatsApp with the customer's
selected items, quantities, name, and note already typed into a message to
your number. Nothing is sent automatically — the customer still taps send
on their end, so there's no API key or business account needed to make this
work.

## Accepting online payments (optional)

By default, every order goes through WhatsApp — the customer picks items and
you settle payment however you like when you message them back. You can also
turn on **online payments**, powered by [Paystack](https://paystack.com),
so customers can pay by card, Mobile Money, or bank transfer right at
checkout — money lands in your bank account automatically, usually the next
morning. When this is on, customers see two choices in their bag: **pay
online now** or **pay on delivery** — they pick whichever they prefer.

Important to understand: no online payment system deposits money straight
into your bank account the instant someone pays. Every legitimate payment
gateway (Paystack included) collects the payment first, then settles it into
your bank account on a schedule — for Paystack that's typically the next
business morning. This is standard and true of every online shop, not a
limitation specific to this one.

### Setting it up

1. Sign up at [paystack.com](https://paystack.com) (free — they take a small
   percentage per transaction instead of a subscription fee).
2. In your Paystack dashboard, go to **Settings → API Keys & Webhooks**.
   Start with the **Test** keys while you try things out — no real money
   moves with test keys, and Paystack provides test card numbers on their
   site for exactly this purpose.
3. Go to `/admin` on your shop → **settings** tab → scroll to
   **online payments**:
   - Paste your **Public Key** and **Secret Key**
   - Choose your currency (GHS for Ghana, by default)
   - Check **enable online payments**
   - Save
4. Test a purchase yourself on the storefront using Paystack's test card
   details before telling customers it's live.
5. Once you're ready for real payments, go back to Paystack, complete their
   business verification if you haven't already, switch to your **Live**
   keys, and paste those into the same settings fields.

Every order — whether paid online or on delivery — still ends up as a
WhatsApp message to you, so your day-to-day workflow doesn't change; paid
orders just arrive marked as already paid, with the payment reference
included.

## Putting it online — for free

Right now this only runs on your own computer. To get a real, shareable link
that costs nothing, here's the setup: host the app on a free web service tier
(Render's free tier works), and store your product/settings data on
**Upstash** — a free hosted database — instead of a local disk. This matters
because free hosting tiers reset their local files whenever the app restarts
or wakes up from sleep; Upstash doesn't have that problem, and it's free
indefinitely, no credit card required.

### 1. Create a free Upstash database

1. Go to [upstash.com](https://upstash.com) and sign up (no card needed).
2. Create a new **Redis** database — any name, any nearby region.
3. On the database page, find the **REST API** section and copy two values:
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 2. Put the code on GitHub

- Create a free GitHub account if needed, make a new repository, upload this
  `drift` folder to it.

### 3. Deploy on Render's free tier

1. Go to [render.com](https://render.com), sign up, click **New → Web Service**.
2. Connect your GitHub repo.
3. Settings:
   - **Runtime:** Node
   - **Instance type:** Free
   - **Build command:** leave blank
   - **Start command:** `node server.js`
4. Before deploying, add two environment variables (**Advanced** section, or
   **Environment** tab after creating the service):
   - `UPSTASH_REDIS_REST_URL` → the value you copied from Upstash
   - `UPSTASH_REDIS_REST_TOKEN` → the value you copied from Upstash
5. Deploy. No disk needed — skip that step entirely.

That's it. Render gives you a free URL like `drift-abc123.onrender.com`.
Go to `/admin` right away, log in with `drift2026`, and change the password
and your WhatsApp number — those now live safely in Upstash, so they'll
still be there tomorrow, next week, and after every redeploy.

**One thing to know about free tiers:** Render's free web services sleep
after inactivity and take ~20–30 seconds to wake up on the next visit. That's
normal and fine for a small personal shop — it just means the first visitor
after a quiet spell waits a moment for the page to load.

## Putting it online — with a paid persistent disk instead

If you'd rather not depend on a third-party database, Render also supports
attaching your own persistent disk directly to the app — this costs roughly
$7/month minimum, since disks require a paid instance type.

1. In your Render service: **Disks** tab → **Add Disk**.
   - Mount path: e.g. `/var/data`
2. **Environment** tab → add `DATA_DIR` = `/var/data` (matching the mount path).
3. Redeploy.

The server automatically creates `products.json` and `config.json` at that
location on first boot, the same way it does locally.

## A couple of general notes

- Set the `PORT` environment variable if your host requires a specific port
  (most set this automatically).
- Whichever storage option you use, go to `/admin` immediately after your
  first deploy and change the default password (`drift2026`) — it's written
  in this README, which isn't a secret once you share the code.

## Notes on the design

The whole thing avoids the "AI template" look on purpose — no cream
background with an orange accent, no dark mode with neon green. The palette
is a warm paper background with a muted slate accent, prices are set in
monospace like little shipping tags, and the hero has a slow, barely-visible
drifting gradient that ties back to the name. Everything is responsive down
to a small phone screen, keyboard-navigable, and respects
`prefers-reduced-motion`.
