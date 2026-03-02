// frontend/src/store/marketStore.js
import { create } from 'zustand';
import api from '../services/api';

const useMarketStore = create((set, get) => ({
  symbols: [],
  quotes: {},
  loading: false,
  error: null,
  initialized: false, // ✅ Prevents multiple fetches

  fetchSymbols: async () => {
    // ✅ Prevent duplicate fetches
    const state = get();
    if (state.loading || state.initialized) return state.symbols;

    try {
      set({ loading: true });
      const res = await api.get('/market/symbols', { params: { limit: 5000 } });

      if (res.data.success) {
        const symbols = res.data.symbols || [];

        // Build initial quotes from symbol data
        const quotes = {};
        symbols.forEach((s) => {
          quotes[s.symbol] = {
            symbol: s.symbol,
            bid: Number(s.bid || s.last_price || 0),
            ask: Number(s.ask || s.last_price || 0),
            last: Number(s.last_price || 0),
            open: Number(s.open_price || s.open || 0),
            high: Number(s.high_price || s.high || 0),
            low: Number(s.low_price || s.low || 0),
            change: Number(s.change_value || 0),
            change_percent: Number(s.change_percent || 0),
            volume: Number(s.volume || 0),
            display_name: s.display_name,
            category: s.category,
            exchange: s.exchange,
            lot_size: s.lot_size,
            tick_size: s.tick_size,
            underlying: s.underlying,
            expiry_date: s.expiry_date,
            source: s.last_update ? 'db' : 'init',
          };
        });

        set({ symbols, quotes, loading: false, error: null, initialized: true });
        return symbols;
      }

      set({ loading: false, initialized: true });
      return [];
    } catch (error) {
      console.error('fetchSymbols error:', error);
      set({ loading: false, error: error.message, initialized: true });
      return [];
    }
  },

  // ✅ Force refresh (only called manually)
  refreshSymbols: async () => {
    set({ initialized: false, loading: false });
    const store = get();
    return store.fetchSymbols();
  },

  // ✅ Handle all possible data formats safely
  updatePrice: (data) => {
    if (!data) return;

    // Handle array of updates
    if (Array.isArray(data)) {
      set((state) => {
        const newQuotes = { ...state.quotes };

        data.forEach((item) => {
          if (!item || !item.symbol) return;
          const sym = String(item.symbol).toUpperCase();

          newQuotes[sym] = {
            ...(newQuotes[sym] || {}),
            symbol: sym,
            bid: Number(item.bid ?? newQuotes[sym]?.bid ?? 0),
            ask: Number(item.ask ?? newQuotes[sym]?.ask ?? 0),
            last: Number(item.last ?? item.last_price ?? newQuotes[sym]?.last ?? 0),
            change: Number(item.change ?? item.change_value ?? newQuotes[sym]?.change ?? 0),
            change_percent: Number(item.changePercent ?? item.change_percent ?? newQuotes[sym]?.change_percent ?? 0),
            timestamp: item.timestamp || Date.now(),
            source: item.source || 'socket',
          };
        });

        return { quotes: newQuotes };
      });
      return;
    }

    // Handle single update object
    if (typeof data === 'object' && data.symbol) {
      const sym = String(data.symbol).toUpperCase();

      set((state) => {
        const existing = state.quotes[sym] || {};

        const newQuote = {
          ...existing,
          symbol: sym,
          bid: Number(data.bid ?? existing.bid ?? 0),
          ask: Number(data.ask ?? existing.ask ?? 0),
          last: Number(data.last ?? data.last_price ?? existing.last ?? 0),
          open: Number(data.open ?? existing.open ?? 0),
          high: Number(data.high ?? existing.high ?? 0),
          low: Number(data.low ?? existing.low ?? 0),
          change: Number(data.change ?? data.change_value ?? existing.change ?? 0),
          change_percent: Number(data.changePercent ?? data.change_percent ?? existing.change_percent ?? 0),
          volume: Number(data.volume ?? existing.volume ?? 0),
          timestamp: data.timestamp || Date.now(),
          source: data.source || 'socket',
        };

        return {
          quotes: { ...state.quotes, [sym]: newQuote },
        };
      });
      return;
    }
  },

  getQuote: async (symbol) => {
    if (!symbol) return null;

    const sym = String(symbol).toUpperCase();
    const existing = get().quotes[sym];

    // Use cached quote if fresh (< 3s)
    if (existing?.timestamp && Date.now() - existing.timestamp < 3000) {
      return existing;
    }

    try {
      const res = await api.get(`/market/quote/${sym}`);
      if (res.data.success && res.data.quote) {
        const q = res.data.quote;
        const quote = {
          symbol: sym,
          bid: Number(q.bid || q.lastPrice || 0),
          ask: Number(q.ask || q.lastPrice || 0),
          last: Number(q.lastPrice || q.last || 0),
          open: Number(q.open || 0),
          high: Number(q.high || 0),
          low: Number(q.low || 0),
          change: Number(q.change || 0),
          change_percent: Number(q.changePercent || q.change_percent || 0),
          volume: Number(q.volume || 0),
          display_name: q.displayName,
          timestamp: Date.now(),
          source: q.source || 'api',
        };

        set((state) => ({
          quotes: { ...state.quotes, [sym]: quote },
        }));

        return quote;
      }
    } catch (error) {
      // Silently fail, use cached
    }

    return existing || null;
  },

  getLocalQuote: (symbol) => {
    if (!symbol) return null;
    return get().quotes[String(symbol).toUpperCase()] || null;
  },
}));

export default useMarketStore;