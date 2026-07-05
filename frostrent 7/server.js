require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const bot = require('./services/bot');
const { startScheduler } = require('./services/scheduler');
const { router: authRouter, passport } = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const listingsRoutes = require('./routes/listings');
const rentalsRoutes = require('./routes/rentals');
const ownersRoutes = require('./routes/owners');

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRouter);
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json({
    id: req.user.id,
    steamId: req.user.steam_id,
    displayName: req.user.display_name,
    tradeUrl: req.user.trade_url,
  });
});

app.use('/api/inventory', inventoryRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/rentals', rentalsRoutes);
app.use('/api/owners', ownersRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FrostRent running at http://localhost:${PORT}`);
  bot.initBot(); // no-ops safely if BOT_* env vars aren't set yet
  startScheduler();
});
