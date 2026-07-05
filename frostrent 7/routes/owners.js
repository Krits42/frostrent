const express = require('express');
const router = express.Router();
const { findOrCreateUserByTradeUrl } = require('../services/rentalService');

/** POST /api/owners/from-trade-url — resolves (or creates) a user id for a given trade URL. */
router.post('/from-trade-url', (req, res) => {
  try {
    const { tradeUrl } = req.body;
    if (!tradeUrl) return res.status(400).json({ error: 'tradeUrl is required' });
    const user = findOrCreateUserByTradeUrl(tradeUrl);
    res.json({ id: user.id, steamId: user.steam_id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
