const cron = require('node-cron');
const rentalService = require('./rentalService');

function startScheduler() {
  // Runs every hour — checks for rentals whose due date has passed and
  // rentals that blew past the grace period without being returned.
  cron.schedule('0 * * * *', async () => {
    try {
      const dueForReturn = rentalService.findDueForReturn();
      for (const { id } of dueForReturn) {
        try {
          await rentalService.requestReturn(id);
          console.log(`[scheduler] Requested return for rental #${id}`);
        } catch (err) {
          console.error(`[scheduler] Failed to request return for rental #${id}:`, err.message);
        }
      }

      const dueForForfeit = rentalService.findDueForForfeit();
      for (const { id } of dueForForfeit) {
        try {
          await rentalService.forfeitRental(id);
          console.log(`[scheduler] Forfeited deposit for rental #${id}`);
        } catch (err) {
          console.error(`[scheduler] Failed to forfeit rental #${id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[scheduler] Run failed:', err.message);
    }
  });

  console.log('[scheduler] Started — checking rentals hourly.');
}

module.exports = { startScheduler };
