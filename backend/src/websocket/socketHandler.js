// backend/src/websocket/socketHandler.js
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const marketDataService = require('../services/marketDataService');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socket
    this.userSubscriptions = new Map(); // userId -> [symbols]
    this.priceUpdateInterval = null;
    this.pnlUpdateInterval = null;

    this.initialize();
  }

  initialize() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const { data: user, error } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, role')
          .eq('id', decoded.id)
          .single();

        if (error || !user) {
          return next(new Error('User not found'));
        }

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
      timestamp: new Date().toISOString()
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
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }

    const userSubs = this.userSubscriptions.get(socket.userId) || new Set();
    
    symbols.forEach(symbol => {
      userSubs.add(symbol.toUpperCase());
      socket.join(`symbol:${symbol.toUpperCase()}`);
    });

    this.userSubscriptions.set(socket.userId, userSubs);

    socket.emit('subscribed', {
      symbols: Array.from(userSubs),
      message: `Subscribed to ${symbols.length} symbols`
    });

    console.log(`📊 ${socket.user.email} subscribed to: ${symbols.join(', ')}`);
  }

  handleUnsubscribeSymbols(socket, symbols) {
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }

    const userSubs = this.userSubscriptions.get(socket.userId);
    
    if (userSubs) {
      symbols.forEach(symbol => {
        userSubs.delete(symbol.toUpperCase());
        socket.leave(`symbol:${symbol.toUpperCase()}`);
      });
    }

    socket.emit('unsubscribed', { symbols });
  }

  handleSubscribeAccount(socket, accountId) {
    socket.join(`account:${accountId}`);
    socket.emit('account:subscribed', { accountId });
    console.log(`💰 ${socket.user.email} subscribed to account: ${accountId}`);
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

  // Broadcast price updates every 1 second
  startPriceUpdates() {
    this.priceUpdateInterval = setInterval(async () => {
      try {
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
              last_update: new Date().toISOString()
            })
            .eq('id', symbol.id);

          this.io.to(`symbol:${symbol.symbol}`).emit('price:update', {
            symbol: symbol.symbol,
            bid: quote.bid,
            ask: quote.ask,
            last: quote.lastPrice,
            change: quote.change,
            changePercent: quote.changePercent,
            timestamp: Date.now()
          });
        }

      } catch (error) {
        console.error('Price update error:', error.message);
      }
    }, 1000);

    console.log('📈 Price updates started (1s interval)');
  }

  // ✅ FIXED: Update P&L for open trades every 2 seconds
  startPnLUpdates() {
    this.pnlUpdateInterval = setInterval(async () => {
      try {
        // Get all open trades with account info
        const { data: openTrades, error: tradesError } = await supabase
          .from('trades')
          .select('*, accounts!inner(user_id, balance, margin)')
          .eq('status', 'open');

        if (tradesError || !openTrades || openTrades.length === 0) return;

        // Group by user
        const tradesByUser = {};
        openTrades.forEach(trade => {
          const userId = trade.accounts.user_id;
          if (!tradesByUser[userId]) {
            tradesByUser[userId] = [];
          }
          tradesByUser[userId].push(trade);
        });

        // Process each user's trades
        for (const [userId, trades] of Object.entries(tradesByUser)) {
          const tradeUpdates = [];

          for (const trade of trades) {
            // Get current price for this symbol
            const { data: symbolData, error: symError } = await supabase
              .from('symbols')
              .select('bid, ask, lot_size')
              .eq('symbol', trade.symbol)
              .single();

            if (symError || !symbolData) continue;

            // ✅ Calculate current price based on trade type
            const currentPrice = trade.trade_type === 'buy' 
              ? parseFloat(symbolData.bid || symbolData.ask) 
              : parseFloat(symbolData.ask || symbolData.bid);

            // ✅ Calculate P&L correctly
            const direction = trade.trade_type === 'buy' ? 1 : -1;
            const openPrice = parseFloat(trade.open_price || 0);
            const quantity = parseFloat(trade.quantity || 0);
            const lotSize = parseFloat(symbolData.lot_size || 1);
            const brokerage = parseFloat(trade.brokerage || 0);

            const priceDiff = (currentPrice - openPrice) * direction;
            const grossPnL = priceDiff * quantity * lotSize;
            const netPnL = grossPnL - brokerage;

            // ✅ Update trade in database
            await supabase
              .from('trades')
              .update({
                current_price: currentPrice,
                profit: netPnL
              })
              .eq('id', trade.id);

            tradeUpdates.push({
              tradeId: trade.id,
              symbol: trade.symbol,
              tradeType: trade.trade_type,
              openPrice: openPrice,
              currentPrice: currentPrice,
              quantity: quantity,
              profit: netPnL,
              timestamp: Date.now()
            });
          }

          // ✅ Send batch update to user
          if (tradeUpdates.length > 0) {
            this.io.to(`user:${userId}`).emit('trades:pnl:batch', {
              trades: tradeUpdates,
              timestamp: Date.now()
            });

            // Also send individual updates for backwards compatibility
            tradeUpdates.forEach(update => {
              this.io.to(`user:${userId}`).emit('trade:pnl', {
                tradeId: update.tradeId,
                symbol: update.symbol,
                currentPrice: update.currentPrice,
                profit: update.profit.toFixed(2),
                timestamp: Date.now()
              });
            });
          }

          // ✅ Update account equity
          const accountIds = [...new Set(trades.map(t => t.account_id))];
          
          for (const accountId of accountIds) {
            const { data: account, error: accError } = await supabase
              .from('accounts')
              .select('*')
              .eq('id', accountId)
              .single();

            if (accError || !account) continue;

            // Calculate total P&L for this account
            const accountTrades = trades.filter(t => t.account_id === accountId);
            let totalPnL = 0;

            for (const t of accountTrades) {
              // Use the already calculated profit from tradeUpdates
              const update = tradeUpdates.find(u => u.tradeId === t.id);
              if (update) {
                totalPnL += update.profit;
              }
            }

            const balance = parseFloat(account.balance || 0);
            const margin = parseFloat(account.margin || 0);
            const newEquity = balance + totalPnL;
            const newFreeMargin = newEquity - margin;

            await supabase
              .from('accounts')
              .update({
                profit: totalPnL,
                equity: newEquity,
                free_margin: newFreeMargin
              })
              .eq('id', accountId);

            // ✅ Broadcast account update
            this.io.to(`account:${accountId}`).emit('account:update', {
              accountId,
              balance: balance,
              equity: newEquity,
              profit: totalPnL,
              freeMargin: newFreeMargin,
              margin: margin,
              timestamp: Date.now()
            });

            // Also send to user room
            this.io.to(`user:${userId}`).emit('account:update', {
              accountId,
              balance: balance,
              equity: newEquity,
              profit: totalPnL,
              freeMargin: newFreeMargin,
              margin: margin,
              timestamp: Date.now()
            });
          }
        }

      } catch (error) {
        console.error('P&L update error:', error.message);
      }
    }, 2000); // Update every 2 seconds

    console.log('💹 P&L updates started (2s interval)');
  }

  broadcastTradeNotification(userId, type, trade) {
    this.io.to(`user:${userId}`).emit('trade:notification', {
      type,
      trade,
      timestamp: Date.now()
    });
  }

  broadcastTransactionNotification(userId, transaction) {
    this.io.to(`user:${userId}`).emit('transaction:notification', {
      transaction,
      timestamp: Date.now()
    });
  }

  stop() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
    if (this.pnlUpdateInterval) {
      clearInterval(this.pnlUpdateInterval);
    }
    console.log('WebSocket intervals stopped');
  }
}

module.exports = SocketHandler;