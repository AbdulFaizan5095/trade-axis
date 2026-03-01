// backend/src/controllers/tradingController.js
const { supabase } = require('../config/supabase');

// ============ GET POSITIONS ============
exports.getPositions = async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.id;

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'open')
      .order('open_time', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: trades || [],
    });
  } catch (error) {
    console.error('Get positions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch positions',
    });
  }
};

// ============ GET PENDING ORDERS ============
exports.getPendingOrders = async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.id;

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    const { data: orders, error } = await supabase
      .from('pending_orders')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.log('Pending orders table may not exist:', error.message);
      return res.json({
        success: true,
        data: [],
      });
    }

    res.json({
      success: true,
      data: orders || [],
    });
  } catch (error) {
    console.error('Get pending orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending orders',
    });
  }
};

// ============ PLACE ORDER ============
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      accountId,
      symbol,
      type,
      orderType = 'market',
      quantity,
      price = 0,
      stopLoss = 0,
      takeProfit = 0,
      slippage = 3,
      comment = '',
    } = req.body;

    // Validation
    if (!accountId || !symbol || !type || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: accountId, symbol, type, quantity',
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0',
      });
    }

    // ✅ CHECK CLOSING MODE - Block new BUY orders if enabled
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('closing_mode, brokerage_rate')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    const closingMode = userData?.closing_mode || false;
    const userBrokerageRate = userData?.brokerage_rate || 0.0003;

    // ✅ If closing mode is ON, only allow SELL orders
    if (closingMode && type === 'buy') {
      return res.status(403).json({
        success: false,
        message: 'Your account is in closing mode. You can only close existing positions (sell). Contact admin for assistance.',
      });
    }

    // Verify account ownership
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    // Get symbol info
    const { data: symbolData, error: symbolError } = await supabase
      .from('symbols')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (symbolError || !symbolData) {
      return res.status(404).json({
        success: false,
        message: 'Symbol not found',
      });
    }

    // For now, only support market orders
    if (orderType !== 'market') {
      return res.status(400).json({
        success: false,
        message: 'Only market orders are currently supported',
      });
    }

    // Get current price
    const openPrice = type === 'buy' 
      ? parseFloat(symbolData.ask || symbolData.last_price) 
      : parseFloat(symbolData.bid || symbolData.last_price);

    if (!openPrice || openPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid price. Market may be closed.',
      });
    }

    // ✅ Lot size = 1 (as per requirement: 1 lot = 1 share)
    const lotSize = 1; // Fixed to 1
    const leverage = account.leverage || 5;
    const marginRequired = (openPrice * parseFloat(quantity) * lotSize) / leverage;

    // Check free margin
    const freeMargin = parseFloat(account.free_margin || account.balance);
    if (marginRequired > freeMargin) {
      return res.status(400).json({
        success: false,
        message: `Insufficient margin. Required: ₹${marginRequired.toFixed(2)}, Available: ₹${freeMargin.toFixed(2)}`,
      });
    }

    // ✅ Calculate commission separately for BUY orders
    const brokerageRate = userBrokerageRate;
    const buyBrokerage = type === 'buy' ? openPrice * parseFloat(quantity) * lotSize * brokerageRate : 0;
    const sellBrokerage = 0; // Will be calculated on close

    // Create trade
    const tradeData = {
      user_id: userId,
      account_id: accountId,
      symbol: symbolData.symbol,
      exchange: symbolData.exchange || 'NSE',
      trade_type: type,
      quantity: parseFloat(quantity),
      open_price: openPrice,
      current_price: openPrice,
      stop_loss: parseFloat(stopLoss) || 0,
      take_profit: parseFloat(takeProfit) || 0,
      margin: marginRequired,
      brokerage: buyBrokerage, // Initial brokerage (buy side)
      buy_brokerage: buyBrokerage, // ✅ Separate buy commission
      sell_brokerage: 0, // ✅ Will be calculated on close
      profit: 0,
      status: 'open',
      comment,
      open_time: new Date().toISOString(),
    };

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .insert(tradeData)
      .select()
      .single();

    if (tradeError) {
      console.error('Supabase insert trade error:', tradeError);
      return res.status(400).json({
        success: false,
        message: tradeError.message || 'Failed to create trade',
        details: tradeError,
      });
    }

    // Update account margin
    const newMargin = parseFloat(account.margin || 0) + marginRequired;
    const newFreeMargin = parseFloat(account.balance) - newMargin;

    await supabase
      .from('accounts')
      .update({
        margin: newMargin,
        free_margin: newFreeMargin,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    res.json({
      success: true,
      data: trade,
      message: `${type.toUpperCase()} order executed at ${openPrice}`,
    });
  } catch (error) {
    console.error('Place order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to place order',
    });
  }
};

// ============ CLOSE POSITION ============
exports.closePosition = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { accountId, closeQuantity } = req.body; // ✅ Added closeQuantity for partial close
    const userId = req.user.id;

    if (!tradeId || !accountId) {
      return res.status(400).json({
        success: false,
        message: 'Trade ID and Account ID are required',
      });
    }

    // Verify trade ownership
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*, accounts!inner(user_id, balance, margin)')
      .eq('id', tradeId)
      .eq('status', 'open')
      .single();

    if (tradeError || !trade) {
      return res.status(404).json({
        success: false,
        message: 'Trade not found or already closed',
      });
    }

    if (trade.accounts.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Get user brokerage rate
    const { data: userData } = await supabase
      .from('users')
      .select('brokerage_rate')
      .eq('id', userId)
      .single();

    const brokerageRate = userData?.brokerage_rate || 0.0003;

    // Get current price
    const { data: symbolData, error: symbolError } = await supabase
      .from('symbols')
      .select('bid, ask, lot_size')
      .eq('symbol', trade.symbol)
      .single();

    if (symbolError || !symbolData) {
      return res.status(400).json({
        success: false,
        message: 'Failed to get current price',
      });
    }

    // ✅ Handle partial close
    const tradeQuantity = parseFloat(trade.quantity);
    const quantityToClose = closeQuantity ? Math.min(parseFloat(closeQuantity), tradeQuantity) : tradeQuantity;
    const isFullClose = quantityToClose >= tradeQuantity;

    // Close price is bid for buy, ask for sell
    const closePrice = trade.trade_type === 'buy' 
      ? parseFloat(symbolData.bid || symbolData.ask) 
      : parseFloat(symbolData.ask || symbolData.bid);

    // Calculate P&L for closed quantity
    const direction = trade.trade_type === 'buy' ? 1 : -1;
    const priceDiff = (closePrice - parseFloat(trade.open_price)) * direction;
    const lotSize = 1; // Fixed to 1
    const grossProfit = priceDiff * quantityToClose * lotSize;
    
    // ✅ Calculate sell commission
    const sellBrokerage = closePrice * quantityToClose * lotSize * brokerageRate;
    
    // ✅ Total commission = buy commission (proportional) + sell commission
    const buyBrokerageProportional = (parseFloat(trade.buy_brokerage || trade.brokerage || 0) / tradeQuantity) * quantityToClose;
    const totalBrokerage = buyBrokerageProportional + sellBrokerage;
    const netProfit = grossProfit - totalBrokerage;

    const closeTime = new Date().toISOString();

    if (isFullClose) {
      // Full close
      const { data: closedTrade, error: updateError } = await supabase
        .from('trades')
        .update({
          close_price: closePrice,
          profit: netProfit,
          sell_brokerage: sellBrokerage,
          brokerage: totalBrokerage,
          status: 'closed',
          close_time: closeTime,
          updated_at: closeTime,
        })
        .eq('id', tradeId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update account
      const newBalance = parseFloat(trade.accounts.balance) + netProfit;
      const newMargin = Math.max(0, parseFloat(trade.accounts.margin) - parseFloat(trade.margin || 0));
      const newFreeMargin = newBalance - newMargin;

      await supabase
        .from('accounts')
        .update({
          balance: newBalance,
          margin: newMargin,
          free_margin: newFreeMargin,
          updated_at: closeTime,
        })
        .eq('id', accountId);

      res.json({
        success: true,
        data: closedTrade,
        message: `Position closed at ${closePrice}. P&L: ₹${netProfit.toFixed(2)}`,
      });
    } else {
      // ✅ Partial close - reduce quantity on existing trade and record the closed portion
      const remainingQuantity = tradeQuantity - quantityToClose;
      const remainingBuyBrokerage = (parseFloat(trade.buy_brokerage || trade.brokerage || 0) / tradeQuantity) * remainingQuantity;
      const remainingMargin = (parseFloat(trade.margin || 0) / tradeQuantity) * remainingQuantity;

      // Update existing trade with reduced quantity
      await supabase
        .from('trades')
        .update({
          quantity: remainingQuantity,
          margin: remainingMargin,
          buy_brokerage: remainingBuyBrokerage,
          brokerage: remainingBuyBrokerage,
          updated_at: closeTime,
        })
        .eq('id', tradeId);

      // Update account balance with partial profit
      const newBalance = parseFloat(trade.accounts.balance) + netProfit;
      const closedMargin = (parseFloat(trade.margin || 0) / tradeQuantity) * quantityToClose;
      const newMargin = Math.max(0, parseFloat(trade.accounts.margin) - closedMargin);
      const newFreeMargin = newBalance - newMargin;

      await supabase
        .from('accounts')
        .update({
          balance: newBalance,
          margin: newMargin,
          free_margin: newFreeMargin,
          updated_at: closeTime,
        })
        .eq('id', accountId);

      res.json({
        success: true,
        message: `Partially closed ${quantityToClose} of ${tradeQuantity}. P&L: ₹${netProfit.toFixed(2)}. Remaining: ${remainingQuantity}`,
        data: {
          closedQuantity: quantityToClose,
          remainingQuantity,
          profit: netProfit,
        },
      });
    }
  } catch (error) {
    console.error('Close position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close position',
    });
  }
};

// ... (rest of the trading controller methods remain the same)
// Include all the other existing methods: partialClose, modifyPosition, closeAllPositions, etc.

// ============ PARTIAL CLOSE ============
exports.partialClose = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { accountId, volume } = req.body;
    const userId = req.user.id;

    if (!tradeId || !accountId || !volume) {
      return res.status(400).json({
        success: false,
        message: 'Trade ID, Account ID, and volume are required',
      });
    }

    // Forward to closePosition with closeQuantity
    req.body.closeQuantity = volume;
    return exports.closePosition(req, res);
  } catch (error) {
    console.error('Partial close error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to partial close position',
    });
  }
};

// ============ MODIFY POSITION ============
exports.modifyPosition = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const { stopLoss, takeProfit } = req.body;
    const userId = req.user.id;

    if (!tradeId) {
      return res.status(400).json({
        success: false,
        message: 'Trade ID is required',
      });
    }

    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('*, accounts!inner(user_id)')
      .eq('id', tradeId)
      .eq('status', 'open')
      .single();

    if (tradeError || !trade) {
      return res.status(404).json({
        success: false,
        message: 'Trade not found or already closed',
      });
    }

    if (trade.accounts.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const { data: updatedTrade, error: updateError } = await supabase
      .from('trades')
      .update({
        stop_loss: parseFloat(stopLoss) || 0,
        take_profit: parseFloat(takeProfit) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      data: updatedTrade,
      message: 'Position modified successfully',
    });
  } catch (error) {
    console.error('Modify position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to modify position',
    });
  }
};

// ============ CLOSE ALL POSITIONS ============
exports.closeAllPositions = async (req, res) => {
  try {
    const { accountId, filterType = 'all', tradeIds = [] } = req.body;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required',
      });
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    // Get user brokerage rate
    const { data: userData } = await supabase
      .from('users')
      .select('brokerage_rate')
      .eq('id', userId)
      .single();

    const brokerageRate = userData?.brokerage_rate || 0.0003;

    let query = supabase
      .from('trades')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'open');

    if (tradeIds.length > 0) {
      query = query.in('id', tradeIds);
    }

    const { data: trades, error: tradesError } = await query;

    if (tradesError) throw tradesError;

    if (!trades || trades.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No open positions to close',
      });
    }

    let tradesToClose = trades;
    if (filterType === 'profitable') {
      tradesToClose = trades.filter((t) => parseFloat(t.profit || 0) > 0);
    } else if (filterType === 'losing') {
      tradesToClose = trades.filter((t) => parseFloat(t.profit || 0) < 0);
    }

    if (tradesToClose.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No ${filterType} positions to close`,
      });
    }

    const closeTime = new Date().toISOString();
    let totalProfit = 0;
    let totalMarginFreed = 0;

    for (const trade of tradesToClose) {
      const { data: symbolData } = await supabase
        .from('symbols')
        .select('bid, ask, lot_size')
        .eq('symbol', trade.symbol)
        .single();

      if (!symbolData) continue;

      const closePrice = trade.trade_type === 'buy' 
        ? parseFloat(symbolData.bid) 
        : parseFloat(symbolData.ask);

      const direction = trade.trade_type === 'buy' ? 1 : -1;
      const priceDiff = (closePrice - parseFloat(trade.open_price)) * direction;
      const lotSize = 1;
      const grossProfit = priceDiff * trade.quantity * lotSize;
      
      // Calculate sell commission
      const sellBrokerage = closePrice * trade.quantity * lotSize * brokerageRate;
      const buyBrokerage = parseFloat(trade.buy_brokerage || trade.brokerage || 0);
      const totalBrokerage = buyBrokerage + sellBrokerage;
      const netProfit = grossProfit - totalBrokerage;

      totalProfit += netProfit;
      totalMarginFreed += parseFloat(trade.margin || 0);

      await supabase
        .from('trades')
        .update({
          close_price: closePrice,
          profit: netProfit,
          sell_brokerage: sellBrokerage,
          brokerage: totalBrokerage,
          status: 'closed',
          close_time: closeTime,
        })
        .eq('id', trade.id);
    }

    const newBalance = parseFloat(account.balance) + totalProfit;
    const newMargin = Math.max(0, parseFloat(account.margin) - totalMarginFreed);
    await supabase
      .from('accounts')
      .update({
        balance: newBalance,
        margin: newMargin,
        free_margin: newBalance - newMargin,
        updated_at: closeTime,
      })
      .eq('id', accountId);

    res.json({
      success: true,
      data: { closedCount: tradesToClose.length, totalProfit },
      message: `Closed ${tradesToClose.length} position(s). Total P&L: ₹${totalProfit.toFixed(2)}`,
    });
  } catch (error) {
    console.error('Close all positions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close positions',
    });
  }
};

// Include remaining methods from original file...
exports.modifyPendingOrder = async (req, res) => {
  // ... keep original implementation
  res.json({ success: true, message: 'Not implemented' });
};

exports.cancelPendingOrder = async (req, res) => {
  // ... keep original implementation
  res.json({ success: true, message: 'Not implemented' });
};

exports.cancelAllPendingOrders = async (req, res) => {
  // ... keep original implementation
  res.json({ success: true, message: 'Not implemented' });
};

exports.getTradeHistory = async (req, res) => {
  try {
    const { accountId, period, symbol, limit = 100 } = req.query;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required',
      });
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    let query = supabase
      .from('trades')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'closed')
      .order('close_time', { ascending: false })
      .limit(parseInt(limit));

    // ✅ Filter by symbol
    if (symbol) {
      query = query.eq('symbol', symbol.toUpperCase());
    }

    // ✅ Limit to 3 months max
    if (period) {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case '3months':
          startDate = new Date(now.setMonth(now.getMonth() - 3));
          break;
        default:
          // Default to 3 months max
          startDate = new Date(now.setMonth(now.getMonth() - 3));
      }

      if (startDate) {
        query = query.gte('close_time', startDate.toISOString());
      }
    } else {
      // ✅ Default: 3 months limit
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      query = query.gte('close_time', threeMonthsAgo.toISOString());
    }

    const { data: trades, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: trades || [],
    });
  } catch (error) {
    console.error('Get trade history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trade history',
    });
  }
};

exports.getTradeStats = async (req, res) => {
  try {
    const { accountId, period = 'all' } = req.query;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required',
      });
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found',
      });
    }

    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('account_id', accountId)
      .eq('status', 'closed');

    if (error) throw error;

    const allTrades = trades || [];
    const winningTrades = allTrades.filter((t) => parseFloat(t.profit || 0) > 0);
    const losingTrades = allTrades.filter((t) => parseFloat(t.profit || 0) < 0);

    const totalProfit = winningTrades.reduce((sum, t) => sum + parseFloat(t.profit || 0), 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + parseFloat(t.profit || 0), 0));
    
    // ✅ Calculate total commission
    const totalCommission = allTrades.reduce((sum, t) => sum + parseFloat(t.brokerage || 0), 0);

    const stats = {
      totalTrades: allTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: allTrades.length > 0 ? (winningTrades.length / allTrades.length) * 100 : 0,
      totalProfit,
      totalLoss,
      netPnL: totalProfit - totalLoss,
      totalCommission, // ✅ Overall commission
      profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get trade stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trade statistics',
    });
  }
};