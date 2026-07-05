const fetch = require('node-fetch');
require('dotenv').config();

const STEAM_API_KEY = process.env.STEAM_API_KEY;

/**
 * Parses a Steam trade URL into its partner id (32-bit) and token.
 * Trade URLs look like:
 * https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=AbCdEfGh
 */
function parseTradeUrl(tradeUrl) {
  const url = new URL(tradeUrl);
  const partner = url.searchParams.get('partner');
  const token = url.searchParams.get('token');
  if (!partner || !token) {
    throw new Error('Invalid trade URL — missing partner or token');
  }
  // Convert 32-bit partner id to a full SteamID64
  const steamId64 = (BigInt(partner) + BigInt('76561197960265728')).toString();
  return { steamId64, token };
}

/**
 * Basic public profile lookup — confirms the account is real and public
 * before we let someone list against it.
 */
async function getPlayerSummary(steamId64) {
  if (!STEAM_API_KEY) throw new Error('STEAM_API_KEY not set in .env');
  const res = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId64}`
  );
  const data = await res.json();
  return data.response?.players?.[0] || null;
}

/**
 * Fetches a user's public CS2 inventory (appid 730, contextid 2).
 * This endpoint is public and doesn't require the API key, but Steam
 * rate-limits it aggressively — cache results in production.
 */
async function getInventory(steamId64) {
  const res = await fetch(
    `https://steamcommunity.com/inventory/${steamId64}/730/2?l=english&count=500`
  );
  if (res.status === 403) {
    throw new Error('Inventory is private — ask the user to set it to public.');
  }
  if (!res.ok) {
    throw new Error(`Steam inventory fetch failed (${res.status})`);
  }
  const data = await res.json();
  if (!data?.assets || !data?.descriptions) return [];

  // Merge asset ownership records with their item descriptions
  const descMap = {};
  for (const d of data.descriptions) {
    descMap[`${d.classid}_${d.instanceid}`] = d;
  }

  return data.assets.map((a) => {
    const desc = descMap[`${a.classid}_${a.instanceid}`] || {};
    return {
      assetId: a.assetid,
      marketHashName: desc.market_hash_name,
      tradable: desc.tradable === 1,
      marketable: desc.marketable === 1,
      iconUrl: desc.icon_url
        ? `https://community.akamai.steamstatic.com/economy/image/${desc.icon_url}`
        : null,
      // Inspect link is needed to pull the real float from CSFloat
      inspectLink: (desc.actions || []).find((act) =>
        act.link?.includes('inspect')
      )?.link?.replace('%owner_steamid%', steamId64).replace('%assetid%', a.assetid),
    };
  });
}

module.exports = { parseTradeUrl, getPlayerSummary, getInventory };
