# FrostRent

CS2 skin rental marketplace — frontend + backend combined into one app.

## What's real vs. what's a placeholder

**Real, working code:**
- Trade URL parsing (SteamID64 decoding)
- Steam public inventory fetch
- CSFloat float value + market price lookup
- SQLite listings/rentals database
- Steam trade offer bot (send rental, request return)
- **PromptPay QR payments** — the working payment path for now. Generates a
  real scannable QR for rent + deposit in THB. Renter scans it in their
  banking app; you confirm the transfer landed by checking your own app and
  calling one endpoint, which is what actually triggers sending the skin.
- The "List your skin" form is fully wired — scan → set price in USD and
  THB → creates a real listing → shows up in the marketplace
- **Real Steam sign-in** — "Sign in" now goes through actual Steam OpenID
  login (`passport-steam`), not a dead link. Requires `BASE_URL` to be set
  correctly (see below) or the redirect back from Steam will fail.
- Hourly scheduler: auto-requests the item back when `due_at` passes, and
  auto-forfeits the deposit if the renter ignores the return offer for 48
  hours

**Why PromptPay confirmation is manual:** individual (non-merchant)
PromptPay accounts don't get a webhook or API to confirm a transfer landed
— only registered business accounts through a payment gateway (2C2P,
Omise/Opn, etc.) get that. At single-listing scale, checking your banking
app and tapping one button is genuinely fine. Deposit refunds on a
successful return are the same story — the money already landed as a
normal transfer, so sending it back is a manual PromptPay payment you make
to the renter, not an automatic reversal (there's no such thing on Steam or
on PromptPay).

**Stripe card payments** are also built (`services/payments.js`,
`createRentalCard`) for whenever you want to accept international renters,
but nothing on the frontend collects a card yet, and it's not the active
path — PromptPay is.

**You still need to build:**
- A Stripe Elements/Checkout form on the frontend, if/when you want card
  payments — the backend route (`POST /api/rentals/card`) is ready for it
- Steam login (Steam OpenID) — right now users are identified purely by
  trade URL, which is fine for a single-listing MVP but won't scale
- A `sentOfferChanged` listener on the bot that calls
  `POST /api/rentals/:id/confirm-return` automatically when a return offer
  is accepted (right now that route exists but nothing calls it yet)

## Setup

```bash
npm install
cp .env.example .env
```

Then fill in `.env`:

| Variable | How to get it |
|---|---|
| `STEAM_API_KEY` | Free & instant: https://steamcommunity.com/dev/apikey |
| `CSFLOAT_API_KEY` | Sign up at https://csfloat.com → account settings → API |
| `PROMPTPAY_ID` | Your PromptPay-linked phone number (format: `66812345678`, no +/dashes) or 13-digit national ID |
| `BASE_URL` | Your real public URL — required for Steam login to redirect correctly. On Railway: Settings → Public Networking → your generated domain |
| `BOT_STEAM_USERNAME/PASSWORD` | A **dedicated** Steam account, not your main |
| `BOT_SHARED_SECRET` / `BOT_IDENTITY_SECRET` | Set the bot account up with [Steam Desktop Authenticator](https://github.com/Jessecar96/SteamDesktopAuthenticator) instead of the phone app — it shows you both secrets during setup |
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com/apikeys |

Steam Guard must be active on the bot account for **15+ days** before it can
send/receive trades without restriction — do this early.

```bash
npm start
```

Visit `http://localhost:3000`. The marketplace and scanner work with demo
data out of the box; they switch to live data automatically once listings
exist in the database and the trade URL entered is a real one.

## Why returns need a deposit

Steam trades can't be reversed once accepted — the trade lock only stops the
renter from re-trading the item elsewhere, it doesn't let the bot recall it.
Getting the skin back requires the renter to accept a return trade offer, so
every rental charges a refundable deposit (~the item's value) that's
forfeited if they don't return it. See the comment at the top of
`services/bot.js` for the full explanation.

## Deploying for real

This needs to run as an always-on process (the bot has to stay logged into
Steam), so it can't live in a serverless function. A small VPS (Hetzner,
DigitalOcean, ~$6/mo) running `pm2 start server.js` works well.
