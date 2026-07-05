const express = require('express');
const router = express.Router();
const rentalService = require('../services/rentalService');

/**
 * POST /api/rentals/promptpay — start a rental, get back a QR to pay
 * body: { listingId, renterId, renterTradeUrl }
 * Does NOT send the skin yet — see /confirm-payment below.
 */
router.post('/promptpay', async (req, res) => {
  try {
    const result = await rentalService.createRentalPromptPay(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/rentals/:id/confirm-payment — YOU call this after checking
 * your banking app and confirming the PromptPay transfer actually landed.
 * This is what actually triggers sending the skin.
 */
router.post('/:id/confirm-payment', async (req, res) => {
  try {
    const result = await rentalService.confirmPromptPayPayment(req.params.id);
    res.json({ status: 'confirmed', tradeOfferId: result.offerId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/rentals/card — card-based rental via Stripe. Only works once
 * STRIPE_SECRET_KEY is set and a real card-collection form exists on the
 * frontend. Not wired into the UI yet — kept here for when you're ready.
 * body: { listingId, renterId, renterTradeUrl, customerId, paymentMethodId }
 */
router.post('/card', async (req, res) => {
  try {
    const result = await rentalService.createRentalCard(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Manual trigger — normally the scheduler calls this automatically when due_at passes. */
router.post('/:id/request-return', async (req, res) => {
  try {
    const result = await rentalService.requestReturn(req.params.id);
    res.json({ returnTradeOfferId: result.offerId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Call this from the trade offer manager's 'sentOfferChanged' listener once the return offer is Accepted. */
router.post('/:id/confirm-return', async (req, res) => {
  try {
    const result = await rentalService.confirmReturn(req.params.id);
    res.json({ status: 'returned', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** Manual trigger — normally the scheduler calls this automatically after the grace period. */
router.post('/:id/forfeit', async (req, res) => {
  try {
    await rentalService.forfeitRental(req.params.id);
    res.json({ status: 'forfeited' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
