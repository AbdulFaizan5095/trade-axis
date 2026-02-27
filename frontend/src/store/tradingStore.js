// frontend/src/store/tradingStore.js
import { create } from 'zustand';
import api from '../services/api';

const useTradingStore = create((set, get) => ({
  // State
  openTrades: [],
  pendingOrders: [],
  tradeHistory: [],
  deals: [], // ✅ NEW
  dealsSummary: null, // ✅ NEW
  loading: false,
  error: null,

  // Fetch open positions
  fetchOpenTrades: async (accountId) => {
    if (!accountId) return;

    set({ loading: true, error: null });
    try {
      const response = await api.get(`/trading/positions/${accountId}`);
      if (response.data.success) {
        set({ openTrades: response.data.data || [], loading: false });
      } else {
        set({ error: response.data.message, loading: false });
      }
    } catch (error) {
      console.error('Fetch open trades error:', error);
      set({
        error: error.response?.data?.message || 'Failed to fetch positions',
        loading: false,
      });
    }
  },

  // Fetch pending orders
  fetchPendingOrders: async (accountId) => {
    if (!accountId) return;

    try {
      const response = await api.get(`/trading/pending-orders/${accountId}`);
      if (response.data.success) {
        set({ pendingOrders: response.data.data || [] });
      }
    } catch (error) {
      console.error('Fetch pending orders error:', error);
    }
  },

  // Fetch trade history
  fetchTradeHistory: async (accountId, filters = {}) => {
    if (!accountId) return;

    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({
        accountId,
        ...filters,
      });

      const response = await api.get(`/trading/history?${params}`);
      if (response.data.success) {
        set({ tradeHistory: response.data.data || [], loading: false });
      } else {
        set({ error: response.data.message, loading: false });
      }
    } catch (error) {
      console.error('Fetch trade history error:', error);
      set({
        error: error.response?.data?.message || 'Failed to fetch history',
        loading: false,
      });
    }
  },

  // ✅ NEW: Fetch deals (Profit, Deposit, Withdrawal, Commission, Balance)
  fetchDeals: async (accountId, period = 'month') => {
    if (!accountId) return;

    set({ loading: true, error: null });
    try {
      const response = await api.get(`/transactions/deals?accountId=${accountId}&period=${period}`);
      if (response.data.success) {
        set({ 
          deals: response.data.data.deals || [], 
          dealsSummary: response.data.data.summary || null,
          loading: false 
        });
      } else {
        set({ error: response.data.message, loading: false });
      }
    } catch (error) {
      console.error('Fetch deals error:', error);
      set({
        error: error.response?.data?.message || 'Failed to fetch deals',
        loading: false,
        deals: [],
        dealsSummary: null
      });
    }
  },

  // ✅ NEW: Update trade P&L in real-time (called by socket)
  updateTradePnL: (tradeId, currentPrice, profit) => {
    set((state) => ({
      openTrades: state.openTrades.map((t) =>
        t.id === tradeId
          ? { ...t, current_price: currentPrice, profit: parseFloat(profit) }
          : t
      ),
    }));
  },

  // ✅ NEW: Batch update trades P&L
  updateTradesPnLBatch: (updates) => {
    set((state) => {
      const updatesMap = new Map(updates.map(u => [u.tradeId, u]));
      return {
        openTrades: state.openTrades.map((t) => {
          const update = updatesMap.get(t.id);
          if (update) {
            return { 
              ...t, 
              current_price: update.currentPrice, 
              profit: parseFloat(update.profit) 
            };
          }
          return t;
        }),
      };
    });
  },

  // Place order (market or pending)
  placeOrder: async (orderData) => {
    const {
      accountId,
      symbol,
      type,
      orderType = 'market',
      quantity,
      price = 0,
      stopLimitPrice = 0,
      stopLoss = 0,
      takeProfit = 0,
      slippage = 3,
      comment = '',
      expiration = 'gtc',
      expirationTime = null,
      magicNumber = 0,
    } = orderData;

    if (!accountId || !symbol || !type || !quantity) {
      return {
        success: false,
        message: 'Missing required order parameters',
      };
    }

    if (quantity <= 0) {
      return {
        success: false,
        message: 'Quantity must be greater than 0',
      };
    }

    set({ loading: true, error: null });

    try {
      const payload = {
        accountId,
        symbol,
        type,
        orderType,
        quantity: parseFloat(quantity),
        price: parseFloat(price) || 0,
        stopLimitPrice: parseFloat(stopLimitPrice) || 0,
        stopLoss: parseFloat(stopLoss) || 0,
        takeProfit: parseFloat(takeProfit) || 0,
        slippage: parseInt(slippage) || 3,
        comment,
        expiration,
        expirationTime,
        magicNumber: parseInt(magicNumber) || 0,
      };

      const response = await api.post('/trading/order', payload);

      if (response.data.success) {
        if (orderType === 'market') {
          await get().fetchOpenTrades(accountId);
        } else {
          await get().fetchPendingOrders(accountId);
        }

        set({ loading: false });
        return {
          success: true,
          data: response.data.data,
          message: response.data.message || 'Order placed successfully',
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Order failed',
        };
      }
    } catch (error) {
      console.error('Place order error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to place order';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Close position
  closeTrade: async (tradeId, accountId) => {
    if (!tradeId || !accountId) {
      return {
        success: false,
        message: 'Missing trade ID or account ID',
      };
    }

    set({ loading: true, error: null });

    try {
      const response = await api.post(`/trading/close/${tradeId}`, {
        accountId,
      });

      if (response.data.success) {
        set((state) => ({
          openTrades: state.openTrades.filter((t) => t.id !== tradeId),
          loading: false,
        }));

        await get().fetchOpenTrades(accountId);
        await get().fetchTradeHistory(accountId);

        return {
          success: true,
          data: response.data.data,
          message: response.data.message || 'Position closed successfully',
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Failed to close position',
        };
      }
    } catch (error) {
      console.error('Close trade error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to close position';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Modify position (SL/TP)
  modifyTrade: async (tradeId, modifications) => {
    if (!tradeId) {
      return {
        success: false,
        message: 'Missing trade ID',
      };
    }

    const { stopLoss, takeProfit } = modifications;

    set({ loading: true, error: null });

    try {
      const payload = {
        stopLoss: parseFloat(stopLoss) || 0,
        takeProfit: parseFloat(takeProfit) || 0,
      };

      const response = await api.put(`/trading/modify/${tradeId}`, payload);

      if (response.data.success) {
        set((state) => ({
          openTrades: state.openTrades.map((t) =>
            t.id === tradeId
              ? {
                  ...t,
                  stop_loss: payload.stopLoss,
                  take_profit: payload.takeProfit,
                }
              : t
          ),
          loading: false,
        }));

        return {
          success: true,
          data: response.data.data,
          message: response.data.message || 'Position modified successfully',
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Failed to modify position',
        };
      }
    } catch (error) {
      console.error('Modify trade error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to modify position';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Partial close
  partialCloseTrade: async (tradeId, accountId, volume) => {
    if (!tradeId || !accountId || !volume) {
      return {
        success: false,
        message: 'Missing required parameters',
      };
    }

    set({ loading: true, error: null });

    try {
      const response = await api.post(`/trading/partial-close/${tradeId}`, {
        accountId,
        volume: parseFloat(volume),
      });

      if (response.data.success) {
        await get().fetchOpenTrades(accountId);
        set({ loading: false });

        return {
          success: true,
          data: response.data.data,
          message: response.data.message || 'Partial close successful',
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Failed to partial close',
        };
      }
    } catch (error) {
      console.error('Partial close error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to partial close';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Modify pending order
  modifyPendingOrder: async (orderId, modifications) => {
    if (!orderId) {
      return {
        success: false,
        message: 'Missing order ID',
      };
    }

    const { price, stopLoss, takeProfit, expiration } = modifications;

    set({ loading: true, error: null });

    try {
      const payload = {
        price: parseFloat(price) || 0,
        stopLoss: parseFloat(stopLoss) || 0,
        takeProfit: parseFloat(takeProfit) || 0,
        expiration,
      };

      const response = await api.put(
        `/trading/pending-order/${orderId}`,
        payload
      );

      if (response.data.success) {
        set((state) => ({
          pendingOrders: state.pendingOrders.map((o) =>
            o.id === orderId ? { ...o, ...payload } : o
          ),
          loading: false,
        }));

        return {
          success: true,
          data: response.data.data,
          message: response.data.message || 'Order modified successfully',
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Failed to modify order',
        };
      }
    } catch (error) {
      console.error('Modify pending order error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to modify order';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Cancel pending order
  cancelOrder: async (orderId, accountId) => {
    if (!orderId || !accountId) {
      return {
        success: false,
        message: 'Missing order ID or account ID',
      };
    }

    set({ loading: true, error: null });

    try {
      const response = await api.delete(`/trading/pending-order/${orderId}`, {
        data: { accountId },
      });

      if (response.data.success) {
        set((state) => ({
          pendingOrders: state.pendingOrders.filter((o) => o.id !== orderId),
          loading: false,
        }));

        return {
          success: true,
          data: response.data.data,
          message: response.data.message || 'Order cancelled successfully',
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Failed to cancel order',
        };
      }
    } catch (error) {
      console.error('Cancel order error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to cancel order';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Close all positions
  closeAllPositions: async (accountId, filterType = 'all') => {
    if (!accountId) {
      return {
        success: false,
        message: 'Missing account ID',
      };
    }

    const { openTrades } = get();
    
    if (openTrades.length === 0) {
      return {
        success: false,
        message: 'No open positions',
      };
    }

    let tradesToClose = openTrades;
    
    if (filterType === 'profitable') {
      tradesToClose = openTrades.filter(
        (t) => parseFloat(t.profit || 0) > 0
      );
    } else if (filterType === 'losing') {
      tradesToClose = openTrades.filter(
        (t) => parseFloat(t.profit || 0) < 0
      );
    } else if (filterType === 'buy' || filterType === 'sell') {
      tradesToClose = openTrades.filter((t) => t.trade_type === filterType);
    }

    if (tradesToClose.length === 0) {
      return {
        success: false,
        message: `No ${filterType} positions to close`,
      };
    }

    set({ loading: true, error: null });

    try {
      const response = await api.post('/trading/close-all', {
        accountId,
        filterType,
        tradeIds: tradesToClose.map((t) => t.id),
      });

      if (response.data.success) {
        await get().fetchOpenTrades(accountId);
        await get().fetchTradeHistory(accountId);
        set({ loading: false });

        return {
          success: true,
          data: response.data.data,
          message:
            response.data.message ||
            `${tradesToClose.length} position(s) closed successfully`,
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Failed to close positions',
        };
      }
    } catch (error) {
      console.error('Close all positions error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to close positions';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Cancel all pending orders
  cancelAllOrders: async (accountId) => {
    if (!accountId) {
      return {
        success: false,
        message: 'Missing account ID',
      };
    }

    const { pendingOrders } = get();
    
    if (pendingOrders.length === 0) {
      return {
        success: false,
        message: 'No pending orders',
      };
    }

    set({ loading: true, error: null });

    try {
      const response = await api.delete('/trading/pending-orders/all', {
        data: {
          accountId,
          orderIds: pendingOrders.map((o) => o.id),
        },
      });

      if (response.data.success) {
        set({ pendingOrders: [], loading: false });

        return {
          success: true,
          data: response.data.data,
          message:
            response.data.message ||
            `${pendingOrders.length} order(s) cancelled successfully`,
        };
      } else {
        set({ error: response.data.message, loading: false });
        return {
          success: false,
          message: response.data.message || 'Failed to cancel orders',
        };
      }
    } catch (error) {
      console.error('Cancel all orders error:', error);
      const errorMessage =
        error.response?.data?.message || 'Failed to cancel orders';
      set({ error: errorMessage, loading: false });
      return {
        success: false,
        message: errorMessage,
      };
    }
  },

  // Get trade by ID
  getTradeById: (tradeId) => {
    const { openTrades } = get();
    return openTrades.find((t) => t.id === tradeId);
  },

  // Get pending order by ID
  getPendingOrderById: (orderId) => {
    const { pendingOrders } = get();
    return pendingOrders.find((o) => o.id === orderId);
  },

  // Calculate total P&L
  getTotalPnL: () => {
    const { openTrades } = get();
    return openTrades.reduce((sum, t) => sum + parseFloat(t.profit || 0), 0);
  },

  // Get positions by symbol
  getPositionsBySymbol: (symbol) => {
    const { openTrades } = get();
    return openTrades.filter((t) => t.symbol === symbol);
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Reset store
  reset: () =>
    set({
      openTrades: [],
      pendingOrders: [],
      tradeHistory: [],
      deals: [],
      dealsSummary: null,
      loading: false,
      error: null,
    }),
}));

export default useTradingStore;