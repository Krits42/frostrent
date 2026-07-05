const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamTotp = require('steam-totp');
require('dotenv').config();

/**
 * IMPORTANT — how skin return actually works on Steam:
 *
 * There is no API call that "reverses" or force-recalls a trade that has
 * already been accepted. Once the renter accepts the incoming trade offer,
 * the item is theirs. Steam's trade lock only blocks THEM from re-trading
 * it elsewhere during the hold — it gives the bot no special recall power.
 *
 * Getting the skin back at the end of a rental therefore requires the
 * renter's cooperation: the bot sends a NEW trade offer requesting the
 * item back, and the renter has to accept it. That's why every rental
 * charges a refundable deposit (see routes/rentals.js) — it's the
 * incentive that makes returns actually happen. Don't remove the deposit
 * step; without it there is no enforcement mechanism at all.
 */

let client = null;
let manager = null;
let community = null;

function initBot() {
  const {
    BOT_STEAM_USERNAME,
    BOT_STEAM_PASSWORD,
    BOT_SHARED_SECRET,
    BOT_IDENTITY_SECRET,
  } = process.env;

  if (!BOT_STEAM_USERNAME || !BOT_STEAM_PASSWORD || !BOT_SHARED_SECRET) {
    console.warn('[bot] Bot credentials missing — running in API-only mode (no trading).');
    return;
  }

  client = new SteamUser();
  community = new SteamCommunity();
  manager = new TradeOfferManager({
    steam: client,
    community,
    language: 'en',
  });

  client.logOn({
    accountName: BOT_STEAM_USERNAME,
    password: BOT_STEAM_PASSWORD,
    twoFactorCode: SteamTotp.generateAuthCode(BOT_SHARED_SECRET),
  });

  client.on('loggedOn', () => {
    console.log('[bot] Logged into Steam.');
    client.setPersona(SteamUser.EPersonaState.Online);
  });

  client.on('webSession', (sessionId, cookies) => {
    manager.setCookies(cookies);
    community.setCookies(cookies);
    if (BOT_IDENTITY_SECRET) {
      community.startConfirmationChecker(10000, BOT_IDENTITY_SECRET);
    }
  });

  client.on('error', (err) => console.error('[bot] Steam client error:', err));
}

/** Bot -> renter: sends the rented item. */
function sendRentalOffer({ renterTradeUrl, assetId }) {
  return new Promise((resolve, reject) => {
    if (!manager) return reject(new Error('Bot not initialized — set BOT_* credentials in .env'));
    const offer = manager.createOffer(renterTradeUrl);
    offer.addMyItem({ appid: 730, contextid: 2, assetid: assetId });
    offer.setMessage('Your FrostRent rental — enjoy! This item will be requested back automatically when your rental ends.');
    offer.send((err, status) => {
      if (err) return reject(err);
      resolve({ offerId: offer.id, status });
    });
  });
}

/** Bot -> renter: requests the item back at the end of the rental period. */
function requestReturnOffer({ renterSteamId, assetId }) {
  return new Promise((resolve, reject) => {
    if (!manager) return reject(new Error('Bot not initialized — set BOT_* credentials in .env'));
    const offer = manager.createOffer(renterSteamId);
    offer.addTheirItem({ appid: 730, contextid: 2, assetid: assetId });
    offer.setMessage('Your FrostRent rental period has ended — please accept this offer to return the item and get your deposit back.');
    offer.send((err, status) => {
      if (err) return reject(err);
      resolve({ offerId: offer.id, status });
    });
  });
}

module.exports = { initBot, sendRentalOffer, requestReturnOffer };
