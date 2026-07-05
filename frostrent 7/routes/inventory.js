const express = require('express');
const router = express.Router();
const steamApi = require('../services/steamApi');
const csfloat = require('../services/csfloat');

const MIN_LISTING_VALUE = 80;

/**
 * POST /api/scan
 * body: { tradeUrl }
 * Real pipeline: trade URL -> steamId -> public inventory -> per-item
 * float + market value via CSFloat -> filter to items worth listing.
 */
router.post('/scan', async (req, res) => {
  try {
    const { tradeUrl } = req.body;
    if (!tradeUrl) return res.status(400).json({ error: 'tradeUrl is required' });

    const { steamId64 } = steamApi.parseTradeUrl(tradeUrl);
    const items = await steamApi.getInventory(steamId64);

    const results = [];
    for (const item of items) {
      if (!item.tradable || !item.marketHashName) continue;
      try {
        const price = await csfloat.getMarketPrice(item.marketHashName);
        if (!price || price.low < MIN_LISTING_VALUE) continue;

        let floatInfo = null;
        if (item.inspectLink) {
          floatInfo = await csfloat.getFloatFromInspectLink(item.inspectLink).catch(() => null);
        }

        results.push({
          assetId: item.assetId,
          marketHashName: item.marketHashName,
          iconUrl: item.iconUrl,
          estimatedValue: price.low,
          floatValue: floatInfo?.floatValue ?? null,
          wearName: floatInfo?.wearName ?? null,
          suggestedRent7d: csfloat.suggestWeeklyRent(price.low),
        });
      } catch {
        // Skip items we can't price — don't fail the whole scan for one item
        continue;
      }
    }

    res.json({ steamId64, eligibleCount: results.length, items: results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
