require('dotenv').config();
const Stripe = require('stripe');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function requireStripe() {
  if (!stripe) throw new Error('STRIPE_SECRET_KEY not set in .env');
  return stripe;
}

/** Charges the rental fee immediately — this money is not refundable. */
async function chargeRent({ amountUsd, customerId, paymentMethodId }) {
  const s = requireStripe();
  return s.paymentIntents.create({
    amount: Math.round(amountUsd * 100),
    currency: 'usd',
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    description: 'FrostRent — weekly rental fee',
  });
}

/**
 * Holds the deposit as an authorization, not a charge — capture_method:
 * 'manual' means the card is only actually charged if we call
 * captureDeposit() later. releaseDeposit() cancels it with nothing charged.
 *
 * Note: card networks generally only guarantee an uncaptured auth hold for
 * about 7 days. That lines up with the 7-day rental window here, but if
 * you ever add longer rentals you'll need to re-authorize partway through
 * instead of relying on one hold for the whole period.
 */
async function holdDeposit({ amountUsd, customerId, paymentMethodId }) {
  const s = requireStripe();
  return s.paymentIntents.create({
    amount: Math.round(amountUsd * 100),
    currency: 'usd',
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    capture_method: 'manual',
    description: 'FrostRent — refundable rental deposit hold',
  });
}

/** Item was returned — release the hold, renter is charged nothing extra. */
async function releaseDeposit(paymentIntentId) {
  const s = requireStripe();
  return s.paymentIntents.cancel(paymentIntentId);
}

/** Item was never returned — actually capture the held deposit. */
async function captureDeposit(paymentIntentId) {
  const s = requireStripe();
  return s.paymentIntents.capture(paymentIntentId);
}

module.exports = { chargeRent, holdDeposit, releaseDeposit, captureDeposit };
