// Rough display-only conversion. PromptPay payments are always charged in
// the listing's actual THB price — this is only used to show a $ estimate
// alongside it (CSFloat pricing data comes back in USD). Not fetched live;
// update the constant occasionally, or swap in a live FX API later.
const USD_TO_THB = 33.5;

function usdToThb(usd) {
  return Math.round(usd * USD_TO_THB);
}

function thbToUsd(thb) {
  return +(thb / USD_TO_THB).toFixed(2);
}

module.exports = { USD_TO_THB, usdToThb, thbToUsd };
