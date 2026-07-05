const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');
require('dotenv').config();

const PROMPTPAY_ID = process.env.PROMPTPAY_ID;

/**
 * Generates a PromptPay QR code (base64 PNG) for a specific THB amount.
 * The renter scans it in their banking app and the amount is pre-filled —
 * they just confirm the transfer.
 *
 * Important limitation: PromptPay doesn't give individual (non-merchant)
 * accounts any API to auto-confirm a payment landed — that level of
 * automation needs a registered business account with a payment gateway
 * (2C2P, Omise/Opn, etc). For now, confirming payment is a manual step:
 * you check your banking app and call confirmPromptPayPayment() yourself.
 * See services/rentalService.js.
 */
async function generateQrCode(amountThb) {
  if (!PROMPTPAY_ID) throw new Error('PROMPTPAY_ID not set in .env');
  const payload = generatePayload(PROMPTPAY_ID, { amount: amountThb });
  return QRCode.toDataURL(payload, {
    width: 400,
    margin: 2,
    color: { dark: '#0A1524', light: '#EAF6FF' },
  });
}

module.exports = { generateQrCode };
