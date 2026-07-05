const express = require('express');
const router = express.Router();
const db = require('../db/db');

const MIN_LISTING_VALUE = 80;

/** GET /api/listings — public marketplace feed */
router.get('/', (req, res) => {
  const { category } = req.query;
  let rows;
  if (category && category !== 'all') {
    rows = db
      .prepare(
        `SELECT * FROM listings WHERE status = 'available' AND market_hash_name LIKE ?
         ORDER BY created_at DESC`
      )
      .all(`%${category}%`);
  } else {
    rows = db
      .prepare(`SELECT * FROM listings WHERE status = 'available' ORDER BY created_at DESC`)
      .all();
  }
  res.json(rows);
});

/**
 * POST /api/listings — create a listing from a scanned item
 * body: { ownerId, assetId, marketHashName, wear, floatValue, estimatedValue, listType, rentPrice7d, rentPrice7dThb, sellPrice }
 */
router.post('/', (req, res) => {
  const {
    ownerId, assetId, marketHashName, wear, floatValue,
    estimatedValue, listType, rentPrice7d, rentPrice7dThb, sellPrice,
  } = req.body;

  if (!ownerId || !assetId || !marketHashName || !listType) {
    return res.status(400).json({ error: 'Missing required listing fields' });
  }
  if (estimatedValue < MIN_LISTING_VALUE) {
    return res.status(400).json({ error: `Items must be worth at least $${MIN_LISTING_VALUE} to list` });
  }

  const stmt = db.prepare(`
    INSERT INTO listings
      (owner_id, asset_id, market_hash_name, wear, float_value, estimated_value, list_type, rent_price_7d, rent_price_7d_thb, sell_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    ownerId, assetId, marketHashName, wear || null, floatValue || null,
    estimatedValue, listType, rentPrice7d || null, rentPrice7dThb || null, sellPrice || null
  );

  res.status(201).json({ id: result.lastInsertRowid });
});

module.exports = router;
