// backend/src/controllers/adminController.js
const { supabase } = require('../config/supabase');
const { hashPassword, generateAccountNumber, generateLoginId } = require('../utils/auth');

const randomPassword = (len = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$_';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

// Leverage options (1:1 to 1:200)
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 25, 50, 100, 200];
const DEFAULT_LEVERAGE = 5;
const DEFAULT_MAX_SAVED_ACCOUNTS = -1; // ✅ -1 = Unlimited
const DEFAULT_BROKERAGE_RATE = 0.0003; // 0.03%

// ---------------- USERS ----------------
const listUsers = async (req, res) => {
  try {
    const { q = '', limit = 200 } = req.query;

    let query = supabase
      .from('users')
      .select('id, login_id, email, first_name, last_name, phone, role, is_active, is_verified, closing_mode, max_saved_accounts, brokerage_rate, created_at, last_login')
      .order('created_at', { ascending: false })
      .limit(Number(limit) || 200);

    if (q.trim()) {
      // Search by login_id or email
      query = query.or(`login_id.ilike.%${q.trim().toUpperCase()}%,email.ilike.%${q.trim().toLowerCase()}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Fetch accounts for each user
    const userIds = (data || []).map(u => u.id);
    
    let accountsData = [];
    if (userIds.length > 0) {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, user_id, account_number, account_type, is_demo, leverage, balance')
        .in('user_id', userIds);
      accountsData = accounts || [];
    }

    // Attach accounts to users
    const usersWithAccounts = (data || []).map(user => ({
      ...user,
      max_saved_accounts: user.max_saved_accounts ?? DEFAULT_MAX_SAVED_ACCOUNTS,
      brokerage_rate: user.brokerage_rate ?? DEFAULT_BROKERAGE_RATE,
      closing_mode: user.closing_mode ?? false,
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

    // ✅ Generate unique Login ID (TA1000, TA1001, etc.)
    const loginId = await generateLoginId();

    const tempPassword = password?.trim() ? password.trim() : randomPassword(12);
    const hashedPassword = await hashPassword(tempPassword);

    const userInsertData = {
      login_id: loginId, // ✅ NEW
      email: normalizedEmail,
      password_hash: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      role: role === 'admin' ? 'admin' : 'user',
      is_verified: false,
      is_active: true,
      max_saved_accounts: Number(maxSavedAccounts) || DEFAULT_MAX_SAVED_ACCOUNTS,
      brokerage_rate: validBrokerageRate,
      closing_mode: false, // ✅ NEW
    };

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([userInsertData])
      .select('id, login_id, email, first_name, last_name, phone, role, is_active, closing_mode, created_at')
      .single();

    if (userError) throw userError;

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
          brokerage_rate: validBrokerageRate,
        }, 
        accounts: createdAccounts, 
        tempPassword,
        loginId, // ✅ Return for admin to share with user
      },
    });
  } catch (e) {
    console.error('admin.createUser:', e);
    return res.status(500).json({ success: false, message: 'Failed to create user', error: e.message });
  }
};

// ✅ NEW: Toggle closing mode for a user
const toggleClosingMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { closingMode } = req.body;

    if (typeof closingMode !== 'boolean') {
      return res.status(400).json({ success: false, message: 'closingMode must be boolean' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ closing_mode: closingMode })
      .eq('id', id)
      .select('id, login_id, email, closing_mode')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: closingMode 
        ? 'Closing mode enabled - User can only close existing positions' 
        : 'Closing mode disabled - User can open new positions',
      data
    });
  } catch (e) {
    console.error('admin.toggleClosingMode:', e);
    return res.status(500).json({ success: false, message: 'Failed to toggle closing mode' });
  }
};

// Update user leverage
const updateUserLeverage = async (req, res) => {
  try {
    const { id } = req.params;
    const { leverage, accountId } = req.body;

    if (!LEVERAGE_OPTIONS.includes(Number(leverage))) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid leverage. Allowed values: ${LEVERAGE_OPTIONS.map(l => '1:' + l).join(', ')}` 
      });
    }

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

const updateBrokerageRate = async (req, res) => {
  try {
    const { id } = req.params;
    const { brokerageRate } = req.body;

    const rate = Math.min(Math.max(0, Number(brokerageRate) || DEFAULT_BROKERAGE_RATE), 1);

    const { data, error } = await supabase
      .from('users')
      .update({ brokerage_rate: rate })
      .eq('id', id)
      .select('id, email, login_id')
      .single();

    if (error) throw error;

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

// ✅ Updated: -1 means unlimited
const updateMaxSavedAccounts = async (req, res) => {
  try {
    const { id } = req.params;
    const { maxSavedAccounts } = req.body;

    // -1 = unlimited, otherwise 1-100
    const max = maxSavedAccounts === -1 || maxSavedAccounts === 'unlimited' 
      ? -1 
      : Math.min(Math.max(1, Number(maxSavedAccounts) || 5), 100);

    const { data, error } = await supabase
      .from('users')
      .update({ max_saved_accounts: max })
      .eq('id', id)
      .select('id, email, login_id')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: max === -1 ? 'Max saved accounts set to Unlimited' : `Max saved accounts updated to ${max}`,
      data: { ...data, max_saved_accounts: max }
    });
  } catch (e) {
    console.error('admin.updateMaxSavedAccounts:', e);
    return res.status(500).json({ success: false, message: 'Failed to update max saved accounts' });
  }
};

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
      .select('id, email, login_id, is_active')
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
      .select('id, email, login_id')
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

module.exports = {
  listUsers,
  createUser,
  setUserActive,
  resetPassword,
  updateUserLeverage,
  updateBrokerageRate,
  updateMaxSavedAccounts,
  getLeverageOptions,
  toggleClosingMode, // ✅ NEW
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};