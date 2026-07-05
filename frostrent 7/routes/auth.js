const express = require('express');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const db = require('../db/db');
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    done(null, user || false);
  } catch (err) {
    done(err);
  }
});

passport.use(new SteamStrategy(
  {
    returnURL: `${BASE_URL}/auth/steam/return`,
    realm: BASE_URL,
    apiKey: process.env.STEAM_API_KEY,
  },
  (identifier, profile, done) => {
    try {
      const steamId = profile.id;
      let user = db.prepare('SELECT * FROM users WHERE steam_id = ?').get(steamId);
      if (!user) {
        const result = db.prepare('INSERT INTO users (steam_id, display_name) VALUES (?, ?)')
          .run(steamId, profile.displayName);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
      } else if (user.display_name !== profile.displayName) {
        db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(profile.displayName, user.id);
        user.display_name = profile.displayName;
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  }
));

const router = express.Router();

router.get('/steam', passport.authenticate('steam'));

router.get(
  '/steam/return',
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

router.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

module.exports = { router, passport };
