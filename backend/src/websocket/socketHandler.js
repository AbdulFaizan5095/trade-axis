// backend/src/websocket/socketHandler.js
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const marketDataService = require('../services/marketDataService');
const kiteStreamService = require('../services/kiteStreamService'); // ✅ NEW

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map();
    this.userSubscriptions = new Map();
    this.priceUpdateInterval = null;
    this.pnlUpdateInterval = null;

    this.initialize();
  }

  initialize() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        if (!token) return next(new Error('Authentication required'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { data: user, error } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, role')
          .eq('id', decoded.id)
          .single();

        if (error || !user) return next(new Error('User not found'));

        socket.userId = user.id;
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });

    this.io.on('connection', (socket) => this.handleConnection(socket));

    this.startPriceUpdates();
    this.startPnLUpdates();
  }

  handleConnection(socket) {
    console.log(`✅ WebSocket connected: ${socket.user.email}`);

    this.connectedUsers.set(socket.userId, socket);
    socket.join(`user:${socket.userId}`);

    socket.emit('connected', {
      message: 'Connected to Trade Axis',
      user: socket.user,
      timestamp: new Date().toISOString(),
    });

    socket.on('subscribe:symbols', (symbols) => this.handleSubscribeSymbols(socket, symbols));
    socket.on('unsubscribe:symbols', (symbols) => this.handleUnsubscribeSymbols(socket, symbols));
    socket.on('subscribe:account', (accountId) => this.handleSubscribeAccount(socket, accountId));
    socket.on('get:quote', (symbol) => this.handleGetQuote(socket, symbol));
    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));

    socket.on('disconnect', () => this.handleDisconnect(socket));
    this.sendInitialData(socket);
  }

  async sendInitialData(socket) {
    try {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', socket.userId)
        .eq('is_active', true);

      socket.emit('accounts:update', accounts);

      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', socket.userId)
        .eq('status', 'open');

      socket.emit('trades:update', trades || []);
    } catch (error) {
      console.error('Error sending initial data:', error);
    }
  }

  handleSubscribeSymbols(socket, symbols) {
    if (!Array.isArray(symbols)) symbols = [symbols];

    const userSubs = this.userSubscriptions.get(socket.userId) || new Set();

    symbols.forEach((symbol) => {
      userSubs.add(String(symbol).toUpperCase());
      socket.join(`symbol:${String(symbol).toUpperCase()}`);
    });

    this.userSubscriptions.set(socket.userId, userSubs);

    socket.emit('subscribed', {
      symbols: Array.from(userSubs),
      message: `Subscribed to ${symbols.length} symbols`,
    });
  }

  handleUnsubscribeSymbols(socket, symbols) {
    if (!Array.isArray(symbols)) symbols = [symbols];

    const userSubs = this.userSubscriptions.get(socket.userId);

    if (userSubs) {
      symbols.forEach((symbol) => {
        userSubs.delete(String(symbol).toUpperCase());
        socket.leave(`symbol:${String(symbol).toUpperCase()}`);
      });
    }

    socket.emit('unsubscribed', { symbols });
  }

  handleSubscribeAccount(socket, accountId) {
    socket.join(`account:${accountId}`);
    socket.emit('account:subscribed', { accountId });
  }

  async handleGetQuote(socket, symbol) {
    try {
      const quote = await marketDataService.getQuote(symbol);
      socket.emit('quote', quote);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  }

  handleDisconnect(socket) {
    console.log(`❌ WebSocket disconnected: ${socket.user.email}`);
    this.connectedUsers.delete(socket.userId);
    this.userSubscriptions.delete(socket.userId);
  }

  // ✅ Price updates (simulation) ONLY if Kite stream is NOT running
  startPriceUpdates() {
    this.priceUpdateInterval = setInterval(async () => {
      try {
        if (kiteStreamService.isRunning()) return; // ✅ IMPORTANT

        const { data: symbols } = await supabase
          .from('symbols')
          .select('*')
          .eq('is_active', true);

        if (!symbols) return;

        for (const symbol of symbols) {
          const quote = marketDataService.simulatePriceMovement(symbol);

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

          this.io.to(`symbol:${symbol.symbol}`).emit('price:update', {
            symbol: symbol.symbol,
            bid: quote.bid,
            ask: quote.ask,
            last: quote.lastPrice,
            change: quote.change,
            changePercent: quote.changePercent,
            timestamp: Date.now(),
            source: 'simulated',
          });
        }
      } catch (error) {
        console.error('Price update error:', error.message);
      }
    }, 1000);

    console.log('📈 Price updates started (1s interval) [simulation fallback]');
  }

  // P&L updates remain as-is (they’ll use real prices from symbols table when Kite runs)
  startPnLUpdates() {
    this.pnlUpdateInterval = setInterval(async () => {
      try {
        const { data: openTrades, error: tradesError } = await supabase
          .from('trades')
          .select('*, accounts!inner(user_id, balance, margin)')
          .eq('status', 'open');

        if (tradesError || !openTrades || openTrades.length === 0) return;

        const tradesByUser = {};
        openTrades.forEach((trade) => {
          const userId = trade.accounts.user_id;
          if (!tradesByUser[userId]) tradesByUser[userId] = [];
          tradesByUser[userId].push(trade);
        });

        for (const [userId, trades] of Object.entries(tradesByUser)) {
          const tradeUpdates = [];

          for (const trade of trades) {
            const { data: symbolData } = await supabase
              .from('symbols')
              .select('bid, ask, lot_size')
              .eq('symbol', trade.symbol)
              .single();

            if (!symbolData) continue;

            const currentPrice =
              trade.trade_type === 'buy'
                ? parseFloat(symbolData.bid || symbolData.ask)
                : parseFloat(symbolData.ask || symbolData.bid);

            const direction = trade.trade_type === 'buy' ? 1 : -1;
            const openPrice = parseFloat(trade.open_price || 0);
            const quantity = parseFloat(trade.quantity || 0);
            const lotSize = parseFloat(symbolData.lot_size || 1);
            const brokerage = parseFloat(trade.brokerage || 0);

            const priceDiff = (currentPrice - openPrice) * direction;
            const grossPnL = priceDiff * quantity * lotSize;
            const netPnL = grossPnL - brokerage;

            await supabase
              .from('trades')
              .update({ current_price: currentPrice, profit: netPnL })
              .eq('id', trade.id);

            tradeUpdates.push({
              tradeId: trade.id,
              symbol: trade.symbol,
              tradeType: trade.trade_type,
              openPrice,
              currentPrice,
              quantity,
              profit: netPnL,
              timestamp: Date.now(),
            });
          }

          if (tradeUpdates.length > 0) {
            this.io.to(`user:${userId}`).emit('trades:pnl:batch', {
              trades: tradeUpdates,
              timestamp: Date.now(),
            });

            tradeUpdates.forEach((u) => {
              this.io.to(`user:${userId}`).emit('trade:pnl', {
                tradeId: u.tradeId,
                symbol: u.symbol,
                currentPrice: u.currentPrice,
                profit: u.profit.toFixed(2),
                timestamp: Date.now(),
              });
            });
          }

          const accountIds = [...new Set(trades.map((t) => t.account_id))];

          for (const accountId of accountIds) {
            const { data: account } = await supabase
              .from('accounts')
              .select('*')
              .eq('id', accountId)
              .single();

            if (!account) continue;

            const accountTrades = trades.filter((t) => t.account_id === accountId);
            let totalPnL = 0;

            for (const t of accountTrades) {
              const update = tradeUpdates.find((u) => u.tradeId === t.id);
              if (update) totalPnL += update.profit;
            }

            const balance = parseFloat(account.balance || 0);
            const margin = parseFloat(account.margin || 0);
            const newEquity = balance + totalPnL;
            const newFreeMargin = newEquity - margin;

            await supabase
              .from('accounts')
              .update({ profit: totalPnL, equity: newEquity, free_margin: newFreeMargin })
              .eq('id', accountId);

            this.io.to(`account:${accountId}`).emit('account:update', {
              accountId,
              balance,
              equity: newEquity,
              profit: totalPnL,
              freeMargin: newFreeMargin,
              margin,
              timestamp: Date.now(),
            });

            this.io.to(`user:${userId}`).emit('account:update', {
              accountId,
              balance,
              equity: newEquity,
              profit: totalPnL,
              freeMargin: newFreeMargin,
              margin,
              timestamp: Date.now(),
            });
          }
        }
      } catch (error) {
        console.error('P&L update error:', error.message);
      }
    }, 2000);

    console.log('💹 P&L updates started (2s interval)');
  }

  stop() {
    if (this.priceUpdateInterval) clearInterval(this.priceUpdateInterval);
    if (this.pnlUpdateInterval) clearInterval(this.pnlUpdateInterval);
    console.log('WebSocket intervals stopped');
  }
}

module.exports = SocketHandler;