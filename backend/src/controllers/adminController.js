// backend/src/controllers/adminController.js
const { supabase } = require('../config/supabase');
const { hashPassword, generateAccountNumber } = require('../utils/auth');

const randomPassword = (len = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$_';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

// Leverage options (1:1 to 1:200)
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 25, 50, 100, 200];
const DEFAULT_LEVERAGE = 5;
const DEFAULT_MAX_SAVED_ACCOUNTS = 5;
const DEFAULT_BROKERAGE_RATE = 0.0003; // 0.03%

// ---------------- USERS ----------------
const listUsers = async (req, res) => {
  try {
    const { q = '', limit = 200 } = req.query;

    // Don't include columns that might not exist yet
    let query = supabase
      .from('users')
      .select('id, email, first_name, last_name, phone, role, is_active, is_verified, created_at, last_login')
      .order('created_at', { ascending: false })
      .limit(Number(limit) || 200);

    if (q.trim()) query = query.ilike('email', `%${q.trim().toLowerCase()}%`);

    const { data, error } = await query;
    if (error) throw error;

    // Fetch accounts with leverage for each user
    const userIds = (data || []).map(u => u.id);
    
    let accountsData = [];
    if (userIds.length > 0) {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, user_id, account_number, account_type, is_demo, leverage, balance')
        .in('user_id', userIds);
      accountsData = accounts || [];
    }

    // Try to fetch additional columns separately
    let extraDataMap = {};
    try {
      const { data: usersWithExtra } = await supabase
        .from('users')
        .select('id, max_saved_accounts, brokerage_rate')
        .in('id', userIds);
      
      if (usersWithExtra) {
        usersWithExtra.forEach(u => {
          extraDataMap[u.id] = {
            max_saved_accounts: u.max_saved_accounts,
            brokerage_rate: u.brokerage_rate
          };
        });
      }
    } catch (e) {
      console.log('Optional columns not found, using defaults');
    }

    // Attach accounts to users
    const usersWithAccounts = (data || []).map(user => ({
      ...user,
      max_saved_accounts: extraDataMap[user.id]?.max_saved_accounts || DEFAULT_MAX_SAVED_ACCOUNTS,
      brokerage_rate: extraDataMap[user.id]?.brokerage_rate || DEFAULT_BROKERAGE_RATE,
      accounts: accountsData.filter(a => a.user_id === user.id)
    }));

    return res.json({ success: true, data: usersWithAccounts });
  } catch (e) {
    console.error('admin.listUsers:', e);
    return res.status(500).json({ success: false, message: 'Failed to list users' });
  }
};

const createUser = async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phone,
      role = 'user',
      password,
      leverage = DEFAULT_LEVERAGE,
      maxSavedAccounts = DEFAULT_MAX_SAVED_ACCOUNTS,
      brokerageRate = DEFAULT_BROKERAGE_RATE,
      demoBalance = 100000,
      createDemo = true,
      createLive = true,
    } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'email, firstName, lastName are required' });
    }

    // Validate leverage
    const validLeverage = LEVERAGE_OPTIONS.includes(Number(leverage)) ? Number(leverage) : DEFAULT_LEVERAGE;
    const validBrokerageRate = Math.min(Math.max(0, Number(brokerageRate) || DEFAULT_BROKERAGE_RATE), 1);

    const normalizedEmail = String(email).toLowerCase().trim();

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const tempPassword = password?.trim() ? password.trim() : randomPassword(12);
    const hashedPassword = await hashPassword(tempPassword);

    // Create user without optional columns first
    const userInsertData = {
      email: normalizedEmail,
      password_hash: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      role: role === 'admin' ? 'admin' : 'user',
      is_verified: false,
      is_active: true,
    };

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([userInsertData])
      .select('id, email, first_name, last_name, phone, role, is_active, created_at')
      .single();

    if (userError) throw userError;

    // Try to update optional columns
    try {
      await supabase
        .from('users')
        .update({ 
          max_saved_accounts: Number(maxSavedAccounts) || DEFAULT_MAX_SAVED_ACCOUNTS,
          brokerage_rate: validBrokerageRate
        })
        .eq('id', user.id);
    } catch (e) {
      console.log('Could not set optional columns, they may not exist in database');
    }

    const createdAccounts = [];

    if (createDemo) {
      const demoAccountNumber = generateAccountNumber(true);
      const { data: demoAcc, error: demoErr } = await supabase
        .from('accounts')
        .insert([{
          user_id: user.id,
          account_number: demoAccountNumber,
          account_type: 'demo',
          balance: Number(demoBalance) || 100000,
          equity: Number(demoBalance) || 100000,
          free_margin: Number(demoBalance) || 100000,
          leverage: validLeverage,
          currency: 'INR',
          is_demo: true,
          is_active: true,
        }])
        .select()
        .single();

      if (demoErr) console.error('Admin demo account creation error:', demoErr);
      else createdAccounts.push(demoAcc);
    }

    if (createLive) {
      const liveAccountNumber = generateAccountNumber(false);
      const { data: liveAcc, error: liveErr } = await supabase
        .from('accounts')
        .insert([{
          user_id: user.id,
          account_number: liveAccountNumber,
          account_type: 'standard',
          balance: 0,
          equity: 0,
          free_margin: 0,
          leverage: validLeverage,
          currency: 'INR',
          is_demo: false,
          is_active: true,
        }])
        .select()
        .single();

      if (liveErr) console.error('Admin live account creation error:', liveErr);
      else createdAccounts.push(liveAcc);
    }

    return res.status(201).json({
      success: true,
      message: 'User created',
      data: { 
        user: { 
          ...user, 
          max_saved_accounts: DEFAULT_MAX_SAVED_ACCOUNTS,
          brokerage_rate: validBrokerageRate 
        }, 
        accounts: createdAccounts, 
        tempPassword 
      },
    });
  } catch (e) {
    console.error('admin.createUser:', e);
    return res.status(500).json({ success: false, message: 'Failed to create user', error: e.message });
  }
};

// Update user leverage
const updateUserLeverage = async (req, res) => {
  try {
    const { id } = req.params;
    const { leverage, accountId } = req.body;

    // Validate leverage
    if (!LEVERAGE_OPTIONS.includes(Number(leverage))) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid leverage. Allowed values: ${LEVERAGE_OPTIONS.map(l => '1:' + l).join(', ')}` 
      });
    }

    // If accountId provided, update specific account
    if (accountId) {
      const { data, error } = await supabase
        .from('accounts')
        .update({ leverage: Number(leverage), updated_at: new Date().toISOString() })
        .eq('id', accountId)
        .eq('user_id', id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        message: `Leverage updated to 1:${leverage}`,
        data
      });
    }

    // Otherwise update ALL accounts for this user
    const { data, error } = await supabase
      .from('accounts')
      .update({ leverage: Number(leverage), updated_at: new Date().toISOString() })
      .eq('user_id', id)
      .select();

    if (error) throw error;

    return res.json({
      success: true,
      message: `Leverage updated to 1:${leverage} for all accounts`,
      data
    });
  } catch (e) {
    console.error('admin.updateUserLeverage:', e);
    return res.status(500).json({ success: false, message: 'Failed to update leverage' });
  }
};

// ✅ Update brokerage rate for user
const updateBrokerageRate = async (req, res) => {
  try {
    const { id } = req.params;
    const { brokerageRate } = req.body;

    const rate = Math.min(Math.max(0, Number(brokerageRate) || DEFAULT_BROKERAGE_RATE), 1);

    // First try to update
    const { data, error } = await supabase
      .from('users')
      .update({ brokerage_rate: rate })
      .eq('id', id)
      .select('id, email')
      .single();

    if (error) {
      // Column might not exist
      if (error.code === '42703') {
        console.log('brokerage_rate column not found, returning default');
        return res.json({
          success: true,
          message: `Brokerage rate set to ${(rate * 100).toFixed(2)}% (pending database update)`,
          data: { id, brokerage_rate: rate }
        });
      }
      throw error;
    }

    return res.json({
      success: true,
      message: `Brokerage rate updated to ${(rate * 100).toFixed(2)}%`,
      data: { ...data, brokerage_rate: rate }
    });
  } catch (e) {
    console.error('admin.updateBrokerageRate:', e);
    return res.status(500).json({ success: false, message: 'Failed to update brokerage rate' });
  }
};

// Update max saved accounts for user
const updateMaxSavedAccounts = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxSavedAccounts } = req.body;

    const max = Math.min(Math.max(1, Number(maxSavedAccounts) || 5), 10);

    const { data, error } = await supabase
      .from('users')
      .update({ max_saved_accounts: max })
      .eq('id', id)
      .select('id, email')
      .single();

    if (error) {
      // Column might not exist
      if (error.code === '42703') {
        console.log('max_saved_accounts column not found, returning default');
        return res.json({
          success: true,
          message: `Max saved accounts set to ${max} (pending database update)`,
          data: { id, max_saved_accounts: max }
        });
      }
      throw error;
    }

    return res.json({
      success: true,
      message: `Max saved accounts updated to ${max}`,
      data: { ...data, max_saved_accounts: max }
    });
  } catch (e) {
    console.error('admin.updateMaxSavedAccounts:', e);
    return res.status(500).json({ success: false, message: 'Failed to update max saved accounts' });
  }
};

// Get leverage options (for frontend dropdown)
const getLeverageOptions = (req, res) => {
  return res.json({
    success: true,
    data: {
      options: LEVERAGE_OPTIONS,
      default: DEFAULT_LEVERAGE
    }
  });
};

const setUserActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be boolean' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ is_active: isActive })
      .eq('id', id)
      .select('id, email, is_active')
      .single();

    if (error) throw error;

    return res.json({ success: true, message: 'User status updated', data });
  } catch (e) {
    console.error('admin.setUserActive:', e);
    return res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const newPass = password?.trim() ? password.trim() : randomPassword(12);
    const hashed = await hashPassword(newPass);

    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: hashed })
      .eq('id', id)
      .select('id, email')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: 'Password reset',
      data: { user: data, tempPassword: newPass },
    });
  } catch (e) {
    console.error('admin.resetPassword:', e);
    return res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

// ---------------- WITHDRAWALS ----------------

const listWithdrawals = async (req, res) => {
  try {
    const { status = 'pending', limit = 200 } = req.query;

    const types = ['withdraw', 'withdrawal'];

    let q = supabase
      .from('transactions')
      .select('*')
      .in('transaction_type', types)
      .order('created_at', { ascending: false })
      .limit(Number(limit) || 200);

    if (status && status !== 'all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) throw error;

    return res.json({ success: true, data: data || [] });
  } catch (e) {
    console.error('admin.listWithdrawals:', e);
    return res.status(500).json({ success: false, message: 'Failed to list withdrawals' });
  }
};

const approveWithdrawal = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { note = '' } = req.body;

    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (txnErr || !txn) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (!['pending', 'processing'].includes(String(txn.status))) {
      return res.status(400).json({ success: false, message: `Cannot approve status: ${txn.status}` });
    }

    const amount = Number(txn.amount || 0);
    if (amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', txn.account_id)
      .single();

    if (accErr || !account) {
      return res.status(400).json({ success: false, message: 'Account not found for withdrawal' });
    }

    const freeMargin = Number(account.free_margin || 0);
    if (amount > freeMargin) {
      return res.status(400).json({ success: false, message: `Insufficient funds. Free margin ₹${freeMargin.toFixed(2)}` });
    }

    const now = new Date().toISOString();

    const { data: updatedTxn, error: upErr } = await supabase
      .from('transactions')
      .update({
        status: 'completed',
        processed_by: adminId,
        processed_at: now,
        admin_note: note || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (upErr) throw upErr;

    const newBalance = Math.max(0, Number(account.balance || 0) - amount);
    const newFreeMargin = Math.max(0, Number(account.free_margin || 0) - amount);
    const newEquity = Math.max(0, Number(account.equity || 0) - amount);

    const { error: accUpErr } = await supabase
      .from('accounts')
      .update({
        balance: newBalance,
        free_margin: newFreeMargin,
        equity: newEquity,
        updated_at: now,
      })
      .eq('id', account.id);

    if (accUpErr) throw accUpErr;

    return res.json({
      success: true,
      message: 'Withdrawal approved and completed',
      data: updatedTxn,
    });
  } catch (e) {
    console.error('admin.approveWithdrawal:', e);
    return res.status(500).json({ success: false, message: 'Failed to approve withdrawal', error: e.message });
  }
};

const rejectWithdrawal = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { note = '' } = req.body;

    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (txnErr || !txn) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (!['pending', 'processing'].includes(String(txn.status))) {
      return res.status(400).json({ success: false, message: `Cannot reject status: ${txn.status}` });
    }

    const now = new Date().toISOString();

    const { data: updatedTxn, error: upErr } = await supabase
      .from('transactions')
      .update({
        status: 'rejected',
        processed_by: adminId,
        processed_at: now,
        admin_note: note || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (upErr) throw upErr;

    return res.json({
      success: true,
      message: 'Withdrawal rejected',
      data: updatedTxn,
    });
  } catch (e) {
    console.error('admin.rejectWithdrawal:', e);
    return res.status(500).json({ success: false, message: 'Failed to reject withdrawal', error: e.message });
  }
};

// ✅ EXPORT ALL FUNCTIONS
module.exports = {
  listUsers,
  createUser,
  setUserActive,
  resetPassword,
  updateUserLeverage,
  updateBrokerageRate, // ✅ Make sure this is exported
  updateMaxSavedAccounts,
  getLeverageOptions,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};