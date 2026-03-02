// backend/src/services/kiteService.js
const { KiteConnect } = require('kiteconnect');
const { DateTime } = require('luxon');
const { supabase } = require('../config/supabase');

class KiteService {
  constructor() {
    this.apiKey = process.env.KITE_API_KEY;
    this.apiSecret = process.env.KITE_API_SECRET;
    this.kc = null;
    this.accessToken = null;
    this.initialized = false;
  }

  isConfigured() {
    return !!(this.apiKey && this.apiSecret);
  }

  async init() {
    if (this.initialized) return;
    if (!this.isConfigured()) {
      console.log('ℹ️ Kite not configured. Using simulated prices.');
      this.initialized = true;
      return;
    }

    this.kc = new KiteConnect({ api_key: this.apiKey });
    this.accessToken = await this.getAccessTokenFromDB();

    if (this.accessToken) {
      this.kc.setAccessToken(this.accessToken);
      console.log('✅ Kite access token loaded from DB.');
    } else {
      console.log('ℹ️ Kite access token not set yet.');
    }

    this.initialized = true;
  }

  async getAccessTokenFromDB() {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'kite_access_token')
        .single();

      if (error) return null;
      const token = (data?.value || '').trim();
      return token || null;
    } catch {
      return null;
    }
  }

  async saveAccessTokenToDB(token) {
    const now = new Date().toISOString();
    await supabase
      .from('app_settings')
      .upsert({ key: 'kite_access_token', value: token, updated_at: now });
  }

  isSessionReady() {
    return !!(this.kc && this.accessToken);
  }

  getLoginURL() {
    if (!this.kc) return null;
    return this.kc.getLoginURL();
  }

  async generateSession(requestToken) {
    await this.init();
    if (!this.kc) throw new Error('Kite not initialized');
    if (!requestToken) throw new Error('requestToken is required');

    const session = await this.kc.generateSession(requestToken, this.apiSecret);
    this.accessToken = session.access_token;
    this.kc.setAccessToken(this.accessToken);

    await this.saveAccessTokenToDB(this.accessToken);

    return {
      accessToken: this.accessToken,
      userId: session.user_id,
      createdAt: session.created_at,
    };
  }

  // ============ IMPROVED SYMBOL SYNC ============

  /**
   * Month names for display
   */
  getMonthName(date) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                     'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[new Date(date).getMonth()];
  }

  getFullMonthName(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
    return months[new Date(date).getMonth()];
  }

  /**
   * Create a readable display name from instrument
   * e.g., "RELIANCE 27MAR25 FUT" → "RELIANCE MAR 2025 FUT"
   */
  createDisplayName(instrument) {
    const name = String(instrument.name || '').toUpperCase();
    const expiry = instrument.expiry;

    if (!expiry) return `${name} FUT`;

    const expiryDate = new Date(expiry);
    const month = this.getMonthName(expiry);
    const year = expiryDate.getFullYear();
    const day = expiryDate.getDate();

    return `${name} ${day}${month}${year} FUT`;
  }

  /**
   * Create a short display name
   * e.g., "RELIANCE MAR FUT"
   */
  createShortDisplayName(instrument) {
    const name = String(instrument.name || '').toUpperCase();
    const expiry = instrument.expiry;

    if (!expiry) return `${name} FUT`;

    const month = this.getMonthName(expiry);
    const year = new Date(expiry).getFullYear().toString().slice(-2);

    return `${name} ${month}${year} FUT`;
  }

  /**
   * Returns FUT instruments from NFO / MCX / BFO only.
   */
  async fetchFuturesInstruments() {
    await this.init();
    if (!this.isSessionReady()) throw new Error('Kite session not ready');

    const [nfo, mcx, bfo] = await Promise.all([
      this.kc.getInstruments('NFO').catch(() => []),
      this.kc.getInstruments('MCX').catch(() => []),
      this.kc.getInstruments('BFO').catch(() => []),
    ]);

    const all = [...nfo, ...mcx, ...bfo];

    // Filter FUT only (no options)
    return all.filter((i) => String(i.instrument_type).toUpperCase() === 'FUT');
  }

  /**
   * Sync ALL FUT instruments to Supabase symbols table.
   * Creates:
   *  1. Each actual contract: RELIANCE25MARFUT, NIFTY25MARFUT etc.
   *  2. Rolling aliases: RELIANCE-I (front), RELIANCE-II (next), RELIANCE-III (far)
   */
  async syncSymbolsToDB() {
    const instruments = await this.fetchFuturesInstruments();

    console.log(`📊 Fetched ${instruments.length} FUT instruments from Kite`);

    // Categorize by exchange/underlying
    const indexSet = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']);
    const sensexSet = new Set(['SENSEX', 'BANKEX']);

    // Group by underlying for alias creation
    const byUnderlying = new Map();

    const rows = [];

    // 1) Create a row for EACH actual contract
    for (const inst of instruments) {
      const tradingsymbol = String(inst.tradingsymbol).toUpperCase();
      const underlying = String(inst.name || '').toUpperCase();
      const exchange = String(inst.exchange || '').toUpperCase();

      if (!underlying) continue;

      // Determine category
      let category = 'stock_futures';
      if (exchange === 'MCX') category = 'commodity_futures';
      else if (sensexSet.has(underlying)) category = 'sensex_futures';
      else if (indexSet.has(underlying)) category = 'index_futures';

      // Create readable display name
      const displayName = this.createShortDisplayName(inst);
      const expiryDate = inst.expiry
        ? new Date(inst.expiry).toISOString().slice(0, 10)
        : null;

      rows.push({
        symbol: tradingsymbol,
        display_name: displayName,
        exchange: exchange === 'NFO' ? 'NSE' : exchange === 'BFO' ? 'BSE' : 'MCX',
        category,
        segment: exchange,
        instrument_type: 'FUT',
        lot_size: Number(inst.lot_size || 1),
        tick_size: Number(inst.tick_size || 0.05),
        kite_exchange: exchange,
        kite_tradingsymbol: tradingsymbol,
        kite_instrument_token: inst.instrument_token,
        expiry_date: expiryDate,
        underlying,
        series: null,
        is_active: true,
      });

      // Group for alias
      if (!byUnderlying.has(underlying)) byUnderlying.set(underlying, []);
      byUnderlying.get(underlying).push(inst);
    }

    // 2) Create rolling aliases: UNDERLYING-I / II / III
    const seriesNames = ['I', 'II', 'III'];
    const seriesLabels = ['Near Month', 'Next Month', 'Far Month'];

    for (const [underlying, list] of byUnderlying.entries()) {
      // Sort by expiry (nearest first)
      const sorted = [...list].sort(
        (a, b) => new Date(a.expiry) - new Date(b.expiry)
      );

      // Filter out expired contracts
      const now = new Date();
      const active = sorted.filter(
        (i) => new Date(i.expiry) >= now
      );

      const picks = active.slice(0, 3);

      for (let idx = 0; idx < picks.length; idx++) {
        const inst = picks[idx];
        const series = seriesNames[idx];
        const aliasSymbol = `${underlying}-${series}`;
        const exchange = String(inst.exchange || '').toUpperCase();

        let category = 'stock_futures';
        if (exchange === 'MCX') category = 'commodity_futures';
        else if (sensexSet.has(underlying)) category = 'sensex_futures';
        else if (indexSet.has(underlying)) category = 'index_futures';

        const month = this.getMonthName(inst.expiry);
        const year = new Date(inst.expiry).getFullYear().toString().slice(-2);

        rows.push({
          symbol: aliasSymbol,
          display_name: `${underlying} ${seriesLabels[idx]} (${month}${year})`,
          exchange: exchange === 'NFO' ? 'NSE' : exchange === 'BFO' ? 'BSE' : 'MCX',
          category,
          segment: exchange,
          instrument_type: 'FUT',
          lot_size: Number(inst.lot_size || 1),
          tick_size: Number(inst.tick_size || 0.05),
          kite_exchange: exchange,
          kite_tradingsymbol: String(inst.tradingsymbol).toUpperCase(),
          kite_instrument_token: inst.instrument_token,
          expiry_date: inst.expiry
            ? new Date(inst.expiry).toISOString().slice(0, 10)
            : null,
          underlying,
          series,
          is_active: true,
        });
      }
    }

    console.log(`📝 Upserting ${rows.length} symbols (${byUnderlying.size} underlyings)...`);

    // First, mark all existing symbols as inactive
    await supabase
      .from('symbols')
      .update({ is_active: false })
      .eq('instrument_type', 'FUT');

    // Upsert in chunks
    const chunkSize = 500;
    let upsertedCount = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('symbols')
        .upsert(chunk, { onConflict: 'symbol' });

      if (error) {
        console.error('❌ syncSymbolsToDB chunk error:', error.message);
        throw error;
      }
      upsertedCount += chunk.length;
    }

    // Clean up old inactive symbols (optional - keeps DB clean)
    const { error: cleanupError } = await supabase
      .from('symbols')
      .delete()
      .eq('is_active', false)
      .eq('instrument_type', 'FUT')
      .lt('last_update', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (cleanupError) {
      console.warn('⚠️ Cleanup warning:', cleanupError.message);
    }

    console.log(`✅ Synced ${upsertedCount} symbols from ${byUnderlying.size} underlyings`);

    return {
      count: upsertedCount,
      underlyings: byUnderlying.size,
      contracts: instruments.length,
      aliases: upsertedCount - instruments.length,
    };
  }

  // ============ HISTORICAL CANDLES ============
  async getHistoricalCandles(appSymbol, timeframe = '15m', count = 300) {
    await this.init();
    if (!this.isSessionReady()) return null;

    const { data: sym, error } = await supabase
      .from('symbols')
      .select('kite_instrument_token')
      .eq('symbol', String(appSymbol).toUpperCase())
      .single();

    if (error || !sym?.kite_instrument_token) return null;

    const intervalMap = {
      '1m': 'minute',
      '5m': '5minute',
      '15m': '15minute',
      '30m': '30minute',
      '1h': '60minute',
      '4h': '60minute',
      '1d': 'day',
      '1w': 'day',
      '1M': 'day',
    };

    const interval = intervalMap[timeframe] || '15minute';

    const now = DateTime.now().setZone('Asia/Kolkata');
    let from;

    switch (timeframe) {
      case '1m':
      case '5m':
        from = now.minus({ days: 5 });
        break;
      case '15m':
      case '30m':
        from = now.minus({ days: 15 });
        break;
      case '1h':
      case '4h':
        from = now.minus({ days: 60 });
        break;
      case '1d':
        from = now.minus({ days: 365 });
        break;
      case '1w':
      case '1M':
        from = now.minus({ years: 3 });
        break;
      default:
        from = now.minus({ days: 30 });
    }

    try {
      const raw = await this.kc.getHistoricalData(
        sym.kite_instrument_token,
        interval,
        from.toJSDate(),
        now.toJSDate(),
        false
      );

      const candles = (raw || []).slice(-count).map((c) => ({
        time: Math.floor(new Date(c.date).getTime() / 1000),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
      }));

      return candles;
    } catch (err) {
      console.error('getHistoricalCandles error:', err.message);
      return null;
    }
  }
}

module.exports = new KiteService();