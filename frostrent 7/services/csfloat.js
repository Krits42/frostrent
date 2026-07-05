const fetch = require('node-fetch');
require('dotenv').config();

const CSFLOAT_API_KEY = process.env.CSFLOAT_API_KEY;
const BASE = 'https://csfloat.com/api/v1';

/**
 * Reads the real float value + paint seed for an item via its inspect link.
 * This is what makes wear/float shown on a listing trustworthy instead of
 * just copying whatever the seller claims.
 */
async function getFloatFromInspectLink(inspectLink) {
  if (!CSFLOAT_API_KEY) throw new Error('CSFLOAT_API_KEY not set in .env');
  if (!inspectLink) throw new Error('Item has no inspect link (not CS2 tradable/marketable)');

  const res = await fetch(
    `${BASE}/inspect?url=${encodeURIComponent(inspectLink)}`,
    { headers: { Authorization: CSFLOAT_API_KEY } }
  );
  if (!res.ok) throw new Error(`CSFloat inspect failed (${res.status})`);
  const data = await res.json();

  return {
    floatValue: data.floatvalue,
    paintSeed: data.paintseed,
    paintIndex: data.paintindex,
    wearName: data.wear_name,
  };
}

/**
 * Pulls a current market price estimate for a given market_hash_name so
 * we can suggest a rent price and enforce the $80 minimum listing value.
 */
async function getMarketPrice(marketHashName) {
  if (!CSFLOAT_API_KEY) throw new Error('CSFLOAT_API_KEY not set in .env');
  const res = await fetch(
    `${BASE}/listings?market_hash_name=${encodeURIComponent(marketHashName)}&sort_by=lowest_price&limit=5`,
    { headers: { Authorization: CSFLOAT_API_KEY } }
  );
  if (!res.ok) throw new Error(`CSFloat pricing failed (${res.status})`);
  const data = await res.json();
  const prices = (data?.data || []).map((l) => l.price / 100); // cents -> usd
  if (!prices.length) return null;
  return { low: Math.min(...prices), sample: prices };
}

/** Suggested weekly rent: rough industry rule of thumb, ~5% of value per week. */
function suggestWeeklyRent(estimatedValue) {
  return Math.max(5, Math.round(estimatedValue * 0.05));
}

module.exports = { getFloatFromInspectLink, getMarketPrice, suggestWeeklyRent };
