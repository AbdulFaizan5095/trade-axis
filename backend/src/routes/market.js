// backend/src/routes/market.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const marketController = require('../controllers/marketController');

// These can be public or protected
router.get('/symbols', marketController.getSymbols);
router.get('/symbols/search', marketController.searchSymbols);
router.get('/quote/:symbol', marketController.getQuote);
router.post('/quotes', marketController.getQuotes);
router.get('/candles/:symbol', marketController.getCandles);

module.exports = router;