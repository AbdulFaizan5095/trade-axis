// backend/src/controllers/adminController.js
const { supabase } = require('../config/supabase');
const bcrypt = require('bcryptjs');
const kiteService = require('../services/kiteService');
const kiteStreamService = require('../services/kiteStreamService');

// ============ EXISTING USER FUNCTIONS ============

exports.listUsers = async (req, res) => {
  try {
    const { q, limit = 500 } = req.query;

    let query = supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Add search if provided
    if (q && q.trim()) {
      const searchTerm = q.trim().toLowerCase();
      query = query.or(`email.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('listUsers query error:', error);
      throw error;
    }

    // Get accounts for each user
    const usersWithAccounts = await Promise.all(
      (users || []).map(async (user) => {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id, account_number, is_demo, balance, equity, margin, free_margin, leverage')
          .eq('user_id', user.id);

        return {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role || 'user',
          isActive: user.is_active !== false,
          leverage: user.leverage || 5,
          brokerageRate: user.brokerage_rate || 0.0003,
          maxSavedAccounts: user.max_saved_accounts || 3,
          closingMode: user.closing_mode || false,
          createdAt: user.created_at,
          accounts: accounts || [],
        };
      })
    );

    res.json({ success: true, users: usersWithAccounts });
  } catch (error) {
    console.error('listUsers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, role = 'user' } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        first_name: firstName || '',
        last_name: lastName || '',
        phone: phone || '',
        role,
        is_active: true,
        leverage: 5,
        brokerage_rate: 0.0003,
        max_saved_accounts: 3,
      })
      .select()
      .single();

    if (error) throw error;

    // Create demo and live accounts
    const accountNumber = `TA${Date.now().toString().slice(-8)}`;

    await supabase.from('accounts').insert([
      {
        user_id: user.id,
        account_number: `${accountNumber}D`,
        is_demo: true,
        balance: 100000,
        equity: 100000,
        leverage: 5,
      },
      {
        user_id: user.id,
        account_number: `${accountNumber}L`,
        is_demo: false,
        balance: 0,
        equity: 0,
        leverage: 5,
      },
    ]);

    res.json({ success: true, user, message: 'User created successfully' });
  } catch (error) {
    console.error('createUser error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.setUserActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getLeverageOptions = async (req, res) => {
  res.json({
    success: true,
    options: [1, 2, 3, 5, 10, 15, 20, 25, 50],
  });
};

exports.updateUserLeverage = async (req, res) => {
  try {
    const { id } = req.params;
    const { leverage } = req.body;

    // Update user
    const { error: userError } = await supabase
      .from('users')
      .update({ leverage })
      .eq('id', id);

    if (userError) throw userError;

    // Update all user's accounts
    const { error: accountError } = await supabase
      .from('accounts')
      .update({ leverage })
      .eq('user_id', id);

    if (accountError) throw accountError;

    res.json({ success: true, message: 'Leverage updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBrokerageRate = async (req, res) => {
  try {
    const { id } = req.params;
    const { brokerageRate } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ brokerage_rate: brokerageRate })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Brokerage rate updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateMaxSavedAccounts = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxSavedAccounts } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ max_saved_accounts: maxSavedAccounts })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Max saved accounts updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleClosingMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { closingMode } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ closing_mode: closingMode })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: `Closing mode ${closingMode ? 'enabled' : 'disabled'}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addBalanceToAccount = async (req, res) => {
  try {
    const { id } = req.params; // user id
    const { amount, accountType = 'live' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    // Find the user's account
    const { data: account, error: findError } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', id)
      .eq('is_demo', accountType === 'demo')
      .single();

    if (findError || !account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const newBalance = parseFloat(account.balance || 0) + parseFloat(amount);
    const newEquity = parseFloat(account.equity || 0) + parseFloat(amount);
    const newFreeMargin = newEquity - parseFloat(account.margin || 0);

    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        balance: newBalance,
        equity: newEquity,
        free_margin: newFreeMargin,
      })
      .eq('id', account.id);

    if (updateError) throw updateError;

    // Create transaction record
    await supabase.from('transactions').insert({
      user_id: id,
      account_id: account.id,
      type: 'deposit',
      amount: parseFloat(amount),
      status: 'completed',
      description: 'Admin deposit',
    });

    res.json({
      success: true,
      message: `₹${amount} added to ${accountType} account`,
      newBalance,
    });
  } catch (error) {
    console.error('addBalanceToAccount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ WITHDRAWAL FUNCTIONS ============

exports.listWithdrawals = async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('transactions')
      .select(`
        *,
        users:user_id (email, first_name, last_name),
        accounts:account_id (account_number, is_demo)
      `)
      .eq('type', 'withdrawal')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, withdrawals: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const { data: txn, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (txn.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Transaction is not pending' });
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        admin_note: adminNote || 'Approved by admin',
        processed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Withdrawal approved' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const { data: txn, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (txn.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Transaction is not pending' });
    }

    // Refund the amount back to account
    const { data: account } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', txn.account_id)
      .single();

    if (account) {
      const newBalance = parseFloat(account.balance || 0) + parseFloat(txn.amount || 0);
      const newEquity = parseFloat(account.equity || 0) + parseFloat(txn.amount || 0);

      await supabase
        .from('accounts')
        .update({
          balance: newBalance,
          equity: newEquity,
          free_margin: newEquity - parseFloat(account.margin || 0),
        })
        .eq('id', txn.account_id);
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'rejected',
        admin_note: adminNote || 'Rejected by admin',
        processed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    res.json({ success: true, message: 'Withdrawal rejected and amount refunded' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ KITE CONNECT FUNCTIONS ============

exports.getKiteLoginUrl = async (req, res) => {
  try {
    await kiteService.init();

    if (!kiteService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Kite API key/secret not configured in .env',
        instructions: [
          '1. Get API credentials from https://developers.kite.trade',
          '2. Add KITE_API_KEY and KITE_API_SECRET to backend/.env',
          '3. Restart the server',
        ],
      });
    }

    const loginUrl = kiteService.getLoginURL();

    res.json({
      success: true,
      loginUrl,
      instructions: [
        '1. Click the login URL and login with your Zerodha credentials',
        '2. After login, you will be redirected to a URL with request_token parameter',
        '3. Copy the request_token value from the URL',
        '4. Use the "Set Token" button to save it',
      ],
    });
  } catch (error) {
    console.error('getKiteLoginUrl error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createKiteSession = async (req, res) => {
  try {
    const { requestToken } = req.body;

    if (!requestToken) {
      return res.status(400).json({
        success: false,
        message: 'requestToken is required',
      });
    }

    const session = await kiteService.generateSession(requestToken.trim());

    res.json({
      success: true,
      message: 'Kite session created successfully! Token valid until tomorrow 6 AM IST.',
      userId: session.userId,
      createdAt: session.createdAt,
    });
  } catch (error) {
    console.error('createKiteSession error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.syncKiteSymbols = async (req, res) => {
  try {
    await kiteService.init();

    if (!kiteService.isSessionReady()) {
      return res.status(400).json({
        success: false,
        message: 'Kite session not ready. Please create session first.',
      });
    }

    const result = await kiteService.syncSymbolsToDB();

    res.json({
      success: true,
      message: `Synced ${result.count} symbols from ${result.underlyings} underlyings`,
      ...result,
    });
  } catch (error) {
    console.error('syncKiteSymbols error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.startKiteStream = async (req, res) => {
  try {
    const io = req.app.get('io');

    if (!io) {
      return res.status(500).json({ success: false, message: 'Socket.IO not available' });
    }

    const result = await kiteStreamService.start(io);

    if (result.started) {
      res.json({
        success: true,
        message: `Kite stream started with ${result.tokens} symbols`,
        ...result,
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Stream not started: ${result.reason}`,
        ...result,
      });
    }
  } catch (error) {
    console.error('startKiteStream error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.stopKiteStream = async (req, res) => {
  try {
    const result = await kiteStreamService.stop();
    res.json({ success: true, message: 'Kite stream stopped', ...result });
  } catch (error) {
    console.error('stopKiteStream error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.kiteStatus = async (req, res) => {
  try {
    await kiteService.init();

    const streamStatus = kiteStreamService.status();
    const sessionReady = kiteService.isSessionReady();
    const configured = kiteService.isConfigured();

    // Try to validate session by getting profile
    let profileValid = false;
    let profile = null;

    if (sessionReady && kiteService.kc) {
      try {
        profile = await kiteService.kc.getProfile();
        profileValid = true;
      } catch (err) {
        profileValid = false;
      }
    }

    res.json({
      success: true,
      configured,
      sessionReady,
      profileValid,
      profile: profile
        ? {
            userName: profile.user_name,
            email: profile.email,
            userId: profile.user_id,
          }
        : null,
      stream: streamStatus,
    });
  } catch (error) {
    console.error('kiteStatus error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};