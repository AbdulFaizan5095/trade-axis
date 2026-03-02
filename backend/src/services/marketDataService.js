// backend/src/services/marketDataService.js
const { supabase } = require('../config/supabase');
const kiteService = require('./kiteService');

class MarketDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 1500; // 1.5s
  }

  // ✅ Quote is read from DB. Kite stream updates DB continuously.
  async getQuote(symbol) {
    const sym = String(symbol || '').toUpperCase();
    const cacheKey = `quote_${sym}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    const { data, error } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', sym)
      .single();

    if (error || !data) return null;

    // Keep response shape compatible with your frontend
    const quote = {
      symbol: data.symbol,
      displayName: data.display_name,
      exchange: data.exchange,
      category: data.category,

      lastPrice: Number(data.last_price || 0),
      bid: Number(data.bid || 0),
      ask: Number(data.ask || 0),

      open: Number(data.open_price ?? data.open ?? 0),
      high: Number(data.high_price ?? data.high ?? 0),
      low: Number(data.low_price ?? data.low ?? 0),
      close: Number(data.close ?? 0),
      previousClose: Number(data.previous_close ?? 0),

      change: Number(data.change_value || 0),
      changePercent: Number(data.change_percent || 0),
      volume: Number(data.volume || 0),

      lotSize: Number(data.lot_size || 1),
      tickSize: Number(data.tick_size || 0.05),
      tradingHours: data.trading_hours || null,

      timestamp: Date.now(),
      source: data.kite_instrument_token ? 'kite' : 'db',
    };

    this.cache.set(cacheKey, { data: quote, timestamp: Date.now() });
    return quote;
  }

  async getQuotes(symbols) {
    const out = {};
    for (const s of symbols || []) {
      const q = await this.getQuote(s);
      if (q) out[String(s).toUpperCase()] = q;
    }
    return out;
  }

  // ✅ Candles: try Kite first; fallback to simulated candles
  async getCandles(symbol, timeframe = '1h', count = 100) {
    const sym = String(symbol || '').toUpperCase();

    // Try Kite historical
    try {
      const candles = await kiteService.getHistoricalCandles(sym, timeframe, Number(count) || 100);
      if (candles && candles.length) return candles;
    } catch (e) {
      // ignore and fallback
    }

    // Fallback: generate simulated candles from DB
    const { data: symbolData } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', sym)
      .single();

    if (!symbolData) return [];
    return this.generateCandles(symbolData, timeframe, parseInt(count));
  }

  // ---------- Simulation fallback (kept from your existing file) ----------
  simulatePriceMovement(symbol) {
    const volatility = this.getVolatility(symbol.category);
    const lastPrice = parseFloat(symbol.last_price);

    const movement = (Math.random() - 0.5) * 2 * volatility * lastPrice;
    const newPrice = Math.max(0.01, lastPrice + movement);

    const spreadPercent = this.getSpread(symbol.category);
    const spread = newPrice * spreadPercent;

    const bid = newPrice - spread / 2;
    const ask = newPrice + spread / 2;

    const previousClose = parseFloat(symbol.previous_close) || newPrice;
    const change = newPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: symbol.symbol,
      displayName: symbol.display_name,
      exchange: symbol.exchange,
      category: symbol.category,
      lastPrice: parseFloat(newPrice.toFixed(4)),
      bid: parseFloat(bid.toFixed(4)),
      ask: parseFloat(ask.toFixed(4)),
      open: parseFloat(symbol.open_price || symbol.open || newPrice),
      high: parseFloat(symbol.high_price || symbol.high || newPrice * 1.01),
      low: parseFloat(symbol.low_price || symbol.low || newPrice * 0.99),
      previousClose: previousClose,
      change: parseFloat(change.toFixed(4)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: symbol.volume,
      lotSize: symbol.lot_size,
      tickSize: symbol.tick_size,
      tradingHours: symbol.trading_hours,
      timestamp: Date.now(),
      source: 'simulated',
    };
  }

  getVolatility(category) {
    const volatilities = {
      equity: 0.001,
      index: 0.0005,
      commodity: 0.002,
      currency: 0.0003,

      index_futures: 0.0005,
      stock_futures: 0.001,
      commodity_futures: 0.002,
      sensex_futures: 0.0005,
    };
    return volatilities[String(category || '').toLowerCase()] || 0.001;
  }

  getSpread(category) {
    const spreads = {
      equity: 0.001,
      index: 0.0002,
      commodity: 0.002,
      currency: 0.0001,

      index_futures: 0.0002,
      stock_futures: 0.001,
      commodity_futures: 0.002,
      sensex_futures: 0.0002,
    };
    return spreads[String(category || '').toLowerCase()] || 0.001;
  }

  async updateAllPrices() {
    const { data: symbols } = await supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true);

    if (!symbols) return;

    for (const symbol of symbols) {
      const quote = this.simulatePriceMovement(symbol);

      await supabase
        .from('symbols')
        .update({
          last_price: quote.lastPrice,
          bid: quote.bid,
          ask: quote.ask,
          change_value: quote.change,
          change_percent: quote.changePercent,
          last_update: new Date().toISOString(),
        })
        .eq('id', symbol.id);
    }
  }

  generateCandles(symbol, timeframe = '1h', count = 100) {
    const candles = [];
    let price = parseFloat(symbol.last_price) || 100;
    const now = Date.now();

    const intervals = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '30m': 1800000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000,
    };

    const interval = intervals[timeframe] || 3600000;
    const volatility = this.getVolatility(symbol.category) * 5;

    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - i * interval;
      const open = price;
      const change = (Math.random() - 0.5) * 2 * volatility * price;
      const close = Math.max(0.01, open + change);
      const high = Math.max(open, close) + Math.random() * volatility * price;
      const low = Math.min(open, close) - Math.random() * volatility * price;

      candles.push({
        time: Math.floor(timestamp / 1000),
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(Math.max(0.01, low).toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(Math.random() * 100000),
      });

      price = close;
    }

    return candles;
  }
}

module.exports = new MarketDataService();