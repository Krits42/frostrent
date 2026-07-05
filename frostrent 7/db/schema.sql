-- FrostRent database schema (SQLite)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  trade_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  asset_id TEXT NOT NULL,              -- Steam inventory asset id
  market_hash_name TEXT NOT NULL,      -- e.g. "★ Falchion Knife | Lore (Field-Tested)"
  wear TEXT,
  float_value REAL,
  estimated_value REAL,
  list_type TEXT CHECK(list_type IN ('rent','sell','both')) NOT NULL,
  rent_price_7d REAL,                  -- USD estimate
  rent_price_7d_thb REAL,              -- actual THB amount charged via PromptPay
  sell_price REAL,
  status TEXT DEFAULT 'available',     -- available, rented, sold, delisted
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rentals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  renter_id INTEGER NOT NULL REFERENCES users(id),
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  due_at TEXT NOT NULL,
  returned_at TEXT,
  rent_amount REAL NOT NULL,           -- what the renter pays for the rental period
  deposit_amount REAL NOT NULL,        -- refundable, forfeited if not returned
  owner_payout REAL NOT NULL,          -- 50% of rent_amount
  platform_fee REAL NOT NULL,          -- 50% of rent_amount
  outbound_trade_offer_id TEXT,        -- bot -> renter (sending the skin)
  return_trade_offer_id TEXT,          -- bot -> renter (requesting it back)
  rent_payment_intent_id TEXT,         -- Stripe: charged immediately (if using card path)
  deposit_payment_intent_id TEXT,      -- Stripe: manual-capture hold (if using card path)
  payment_method TEXT DEFAULT 'promptpay',  -- 'promptpay' or 'card'
  payment_status TEXT DEFAULT 'pending',    -- pending, confirmed
  status TEXT DEFAULT 'active'         -- active, returned, forfeited, overdue
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status);
