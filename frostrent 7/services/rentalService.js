const db = require('../db/db');
const bot = require('./bot');
const payments = require('./payments');
const promptpay = require('./promptpay');
const { usdToThb } = require('./currency');
const { parseTradeUrl } = require('./steamApi');

const RENTAL_DAYS = 7;
const PLATFORM_SPLIT = 0.5; // you keep 50%, owner keeps 50%
const GRACE_HOURS = 48; // how long a renter has to accept the return offer

/**
 * There's no login system yet, so a renter is identified purely by their
 * trade URL — same pattern the rest of the site already uses. First time
 * we see a given SteamID64, we create a lightweight user row for them.
 */
function findOrCreateUserByTradeUrl(tradeUrl) {
  const { steamId64 } = parseTradeUrl(tradeUrl);
  let user = db.prepare('SELECT * FROM users WHERE steam_id = ?').get(steamId64);
  if (!user) {
    const result = db.prepare('INSERT INTO users (steam_id, trade_url) VALUES (?, ?)').run(steamId64, tradeUrl);
    user = { id: result.lastInsertRowid, steam_id: steamId64, trade_url: tradeUrl };
  } else if (user.trade_url !== tradeUrl) {
    db.prepare('UPDATE users SET trade_url = ? WHERE id = ?').run(tradeUrl, user.id);
  }
  return user;
}

/**
 * Starts a rental paid via PromptPay QR (the working payment path for now).
 * Because PromptPay gives individual accounts no way to auto-confirm a
 * payment landed, this does NOT send the trade offer yet — it just
 * generates the QR and creates the rental as 'pending_payment'. You check
 * your banking app and call confirmPromptPayPayment() once the money's
 * actually in, which is what triggers sending the skin.
 */
async function createRentalPromptPay({ listingId, renterTradeUrl }) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing || listing.status !== 'available') {
    throw new Error('Listing not available');
  }
  const renter = findOrCreateUserByTradeUrl(renterTradeUrl);

  const rentAmountThb = listing.rent_price_7d_thb;
  const depositAmountThb = usdToThb(listing.estimated_value);
  const totalThb = rentAmountThb + depositAmountThb;
  const ownerPayout = +(rentAmountThb * PLATFORM_SPLIT).toFixed(2);
  const platformFee = +(rentAmountThb * PLATFORM_SPLIT).toFixed(2);
  const dueAt = new Date(Date.now() + RENTAL_DAYS * 86400000).toISOString();

  const qrCodeDataUrl = await promptpay.generateQrCode(totalThb);

  const result = db.prepare(`
    INSERT INTO rentals
      (listing_id, renter_id, due_at, rent_amount, deposit_amount, owner_payout, platform_fee,
       payment_method, payment_status, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'promptpay', 'pending', 'pending_payment')
  `).run(listingId, renter.id, dueAt, rentAmountThb, depositAmountThb, ownerPayout, platformFee);

  return { rentalId: result.lastInsertRowid, qrCodeDataUrl, totalThb, dueAt };
}

/**
 * You call this yourself after checking your banking app and seeing the
 * PromptPay transfer actually came in. Only then does the skin get sent.
 */
async function confirmPromptPayPayment(rentalId) {
  const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId);
  if (!rental) throw new Error('Rental not found');
  if (rental.payment_status === 'confirmed') throw new Error('Already confirmed');

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(rental.listing_id);
  const renter = db.prepare('SELECT * FROM users WHERE id = ?').get(rental.renter_id);

  const offerResult = await bot.sendRentalOffer({
    renterTradeUrl: renter.trade_url,
    assetId: listing.asset_id,
  });

  db.prepare(`
    UPDATE rentals SET payment_status = 'confirmed', status = 'active', outbound_trade_offer_id = ?
    WHERE id = ?
  `).run(offerResult.offerId, rentalId);
  db.prepare(`UPDATE listings SET status = 'rented' WHERE id = ?`).run(listing.id);

  return offerResult;
}

/**
 * Card-based rental (Stripe) — available once STRIPE_SECRET_KEY is set and
 * a Stripe Elements form exists on the frontend to collect a card. Not the
 * active path right now, but left in place for later.
 */
async function createRentalCard({ listingId, renterId, renterTradeUrl, customerId, paymentMethodId }) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing || listing.status !== 'available') {
    throw new Error('Listing not available');
  }

  const rentAmount = listing.rent_price_7d;
  const depositAmount = listing.estimated_value;
  const ownerPayout = +(rentAmount * PLATFORM_SPLIT).toFixed(2);
  const platformFee = +(rentAmount * PLATFORM_SPLIT).toFixed(2);
  const dueAt = new Date(Date.now() + RENTAL_DAYS * 86400000).toISOString();

  const rentCharge = await payments.chargeRent({ amountUsd: rentAmount, customerId, paymentMethodId });
  const depositHold = await payments.holdDeposit({ amountUsd: depositAmount, customerId, paymentMethodId });

  let offerResult;
  try {
    offerResult = await bot.sendRentalOffer({ renterTradeUrl, assetId: listing.asset_id });
  } catch (err) {
    await payments.releaseDeposit(depositHold.id).catch(() => {});
    throw new Error(`Payment succeeded but trade offer failed: ${err.message}. Deposit hold released — refund the rent charge (${rentCharge.id}) manually.`);
  }

  const result = db.prepare(`
    INSERT INTO rentals
      (listing_id, renter_id, due_at, rent_amount, deposit_amount, owner_payout, platform_fee,
       outbound_trade_offer_id, rent_payment_intent_id, deposit_payment_intent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    listingId, renterId, dueAt, rentAmount, depositAmount, ownerPayout, platformFee,
    offerResult.offerId, rentCharge.id, depositHold.id
  );

  db.prepare(`UPDATE listings SET status = 'rented' WHERE id = ?`).run(listingId);

  return { rentalId: result.lastInsertRowid, dueAt, tradeOfferId: offerResult.offerId };
}

/** Fires when due_at passes — asks the renter for the item back. */
async function requestReturn(rentalId) {
  const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId);
  if (!rental) throw new Error('Rental not found');
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(rental.listing_id);
  const renter = db.prepare('SELECT * FROM users WHERE id = ?').get(rental.renter_id);

  const offerResult = await bot.requestReturnOffer({
    renterSteamId: renter.steam_id,
    assetId: listing.asset_id,
  });

  db.prepare(`UPDATE rentals SET return_trade_offer_id = ?, status = 'overdue' WHERE id = ?`)
    .run(offerResult.offerId, rentalId);

  return offerResult;
}

/**
 * Renter accepted the return offer — release/refund their deposit, re-list
 * the item. For card payments Stripe just cancels the hold automatically.
 * For PromptPay there's no hold to release — the deposit money is already
 * sitting in your bank account, so returning it is a manual transfer you
 * send back to the renter's PromptPay yourself. This function tells you
 * that's needed rather than pretending it happened automatically.
 */
async function confirmReturn(rentalId) {
  const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId);
  if (!rental) throw new Error('Rental not found');

  let depositRefundNote = null;
  if (rental.payment_method === 'card' && rental.deposit_payment_intent_id) {
    await payments.releaseDeposit(rental.deposit_payment_intent_id);
  } else {
    depositRefundNote = `Manually send ฿${rental.deposit_amount} back to the renter's PromptPay — it was never held, just paid up front.`;
  }

  db.prepare(`UPDATE rentals SET status = 'returned', returned_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(rentalId);
  db.prepare(`UPDATE listings SET status = 'available' WHERE id = ?`).run(rental.listing_id);

  return { depositRefundNote };
}

/** Renter never accepted the return offer past the grace period — keep the deposit. */
async function forfeitRental(rentalId) {
  const rental = db.prepare('SELECT * FROM rentals WHERE id = ?').get(rentalId);
  if (!rental) throw new Error('Rental not found');

  // Card: actually capture the held amount. PromptPay: money's already in
  // your account from the upfront payment, so there's nothing to capture —
  // forfeiting just means you keep what was already paid.
  if (rental.payment_method === 'card' && rental.deposit_payment_intent_id) {
    await payments.captureDeposit(rental.deposit_payment_intent_id);
  }

  db.prepare(`UPDATE rentals SET status = 'forfeited' WHERE id = ?`).run(rentalId);
  // Listing stays 'rented' — the item is gone for good, someone needs to
  // manually resolve this listing (mark delisted, pursue the renter, etc.)
}

/** Used by the scheduler to find rentals that need action. */
function findDueForReturn() {
  return db.prepare(`SELECT id FROM rentals WHERE status = 'active' AND due_at <= datetime('now')`).all();
}

function findDueForForfeit() {
  return db.prepare(`
    SELECT id FROM rentals
    WHERE status = 'overdue' AND due_at <= datetime('now', '-${GRACE_HOURS} hours')
  `).all();
}

module.exports = {
  createRentalPromptPay, confirmPromptPayPayment, createRentalCard,
  requestReturn, confirmReturn, forfeitRental, findOrCreateUserByTradeUrl,
  findDueForReturn, findDueForForfeit, GRACE_HOURS,
};
