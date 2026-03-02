// backend/src/controllers/marketController.js
const { supabase } = require('../config/supabase');
const marketDataService = require('../services/marketDataService');
const kiteService = require('../services/kiteService');

// Get all symbols with powerful search
exports.getSymbols = async (req, res) => {
  try {
    const { category, exchange, search, q, limit = 2000 } = req.query;
    const searchTerm = (search || q || '').trim();

    let query = supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true)
      .order('underlying', { ascending: true })
      .order('expiry_date', { ascending: true });

    // Filter by category
    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    // Filter by exchange
    if (exchange && exchange !== 'all') {
      query = query.eq('exchange', exchange);
    }

    // Search across symbol, display_name, underlying
    if (searchTerm) {
      query = query.or(
        `symbol.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%,underlying.ilike.%${searchTerm}%`
      );
    }

    query = query.limit(parseInt(limit));

    const { data: symbols, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      symbols: symbols || [],
      count: symbols?.length || 0,
    });
  } catch (error) {
    console.error('getSymbols error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search symbols endpoint
exports.searchSymbols = async (req, res) => {
  try {
    const { q, category, limit = 100 } = req.query;

    if (!q || !q.trim()) {
      return res.json({ success: true, symbols: [], count: 0 });
    }

    const term = q.trim();

    let query = supabase
      .from('symbols')
      .select('*')
      .eq('is_active', true)
      .or(
        `symbol.ilike.%${term}%,display_name.ilike.%${term}%,underlying.ilike.%${term}%`
      )
      .order('underlying', { ascending: true })
      .order('expiry_date', { ascending: true })
      .limit(parseInt(limit));

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data: symbols, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      symbols: symbols || [],
      count: symbols?.length || 0,
    });
  } catch (error) {
    console.error('searchSymbols error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single quote
exports.getQuote = async (req, res) => {
  try {
    const { symbol } = req.params;
    const quote = await marketDataService.getQuote(symbol);

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Symbol not found' });
    }

    res.json({ success: true, quote });
  } catch (error) {
    console.error('getQuote error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get multiple quotes
exports.getQuotes = async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols)) {
      return res.status(400).json({ success: false, message: 'symbols must be an array' });
    }

    const quotes = await marketDataService.getQuotes(symbols);
    res.json({ success: true, quotes });
  } catch (error) {
    console.error('getQuotes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get candles for charting
exports.getCandles = async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '15m', count = 300 } = req.query;

    const candles = await marketDataService.getCandles(
      symbol,
      timeframe,
      parseInt(count)
    );

    res.json({
      success: true,
      symbol,
      timeframe,
      candles: candles || [],
      count: candles?.length || 0,
    });
  } catch (error) {
    console.error('getCandles error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};