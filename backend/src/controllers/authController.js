// backend/src/controllers/authController.js
const { supabase } = require('../config/supabase');
const { hashPassword, comparePassword, generateToken, generateAccountNumber, generateLoginId } = require('../utils/auth');

// @desc    Register new user (Admin only)
// @route   POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // ✅ Generate unique Login ID (TA1000, TA1001, etc.)
    const loginId = await generateLoginId();

    const hashedPassword = await hashPassword(password);

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([
        {
          login_id: loginId, // ✅ NEW
          email: email.toLowerCase(),
          password_hash: hashedPassword,
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          is_verified: false,
          is_active: true,
          role: 'user',
          max_saved_accounts: -1, // ✅ -1 = unlimited
          closing_mode: false, // ✅ NEW
        }
      ])
      .select('id, login_id, email, first_name, last_name, phone, role, is_verified, max_saved_accounts, closing_mode')
      .single();

    if (userError) {
      throw userError;
    }

    // Create demo account
    const demoAccountNumber = generateAccountNumber(true);
    const { data: demoAccount, error: demoError } = await supabase
      .from('accounts')
      .insert([
        {
          user_id: user.id,
          account_number: demoAccountNumber,
          account_type: 'demo',
          balance: 100000,
          equity: 100000,
          free_margin: 100000,
          leverage: 5,
          currency: 'INR',
          is_demo: true,
          is_active: true
        }
      ])
      .select()
      .single();

    if (demoError) {
      console.error('Demo account creation error:', demoError);
    }

    // Create live account
    const liveAccountNumber = generateAccountNumber(false);
    const { data: liveAccount, error: liveError } = await supabase
      .from('accounts')
      .insert([
        {
          user_id: user.id,
          account_number: liveAccountNumber,
          account_type: 'standard',
          balance: 0,
          equity: 0,
          free_margin: 0,
          leverage: 5,
          currency: 'INR',
          is_demo: false,
          is_active: true
        }
      ])
      .select()
      .single();

    if (liveError) {
      console.error('Live account creation error:', liveError);
    }

    const token = generateToken(user.id, user.login_id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user.id,
          loginId: user.login_id, // ✅ NEW
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified,
          maxSavedAccounts: user.max_saved_accounts,
          closingMode: user.closing_mode, // ✅ NEW
        },
        accounts: [demoAccount, liveAccount].filter(Boolean),
        token,
        tempLoginId: loginId, // ✅ Return login ID for admin to share
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
const login = async (req, res) => {
  try {
    const { loginId, password } = req.body; // ✅ Changed from email to loginId

    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Login ID and password are required'
      });
    }

    // ✅ Find user by login_id (TA1000 format) OR email (for backward compatibility)
    let user;
    const normalizedInput = loginId.trim();
    
    // Check if it looks like a login ID (starts with TA)
    const isLoginId = /^TA\d+$/i.test(normalizedInput);
    
    if (isLoginId) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('login_id', normalizedInput.toUpperCase())
        .single();
      
      user = data;
      if (error && error.code !== 'PGRST116') console.error(error);
    } else {
      // Fallback: try email login
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalizedInput.toLowerCase())
        .single();
      
      user = data;
      if (error && error.code !== 'PGRST116') console.error(error);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Login ID or password'
      });
    }

    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Login ID or password'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const token = generateToken(user.id, user.login_id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          loginId: user.login_id, // ✅ NEW
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified,
          kycStatus: user.kyc_status,
          maxSavedAccounts: user.max_saved_accounts || -1,
          closingMode: user.closing_mode || false, // ✅ NEW
        },
        accounts: accounts,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('is_active', true);

    // Get full user data including new fields
    const { data: userData } = await supabase
      .from('users')
      .select('login_id, max_saved_accounts, closing_mode, brokerage_rate')
      .eq('id', req.user.id)
      .single();

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...req.user,
          loginId: userData?.login_id,
          maxSavedAccounts: userData?.max_saved_accounts ?? -1,
          closingMode: userData?.closing_mode ?? false,
          brokerageRate: userData?.brokerage_rate ?? 0.0003,
        },
        accounts: accounts
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ Switch account (for saved accounts feature)
// @route   POST /api/auth/switch-account
const switchAccount = async (req, res) => {
  try {
    const { loginId, token: savedToken } = req.body; // ✅ Changed from email

    if (!loginId || !savedToken) {
      return res.status(400).json({
        success: false,
        message: 'Login ID and token required'
      });
    }

    // Verify the saved token
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(savedToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Saved session expired. Please login again.'
      });
    }

    // Get user by login_id
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Verify login_id matches
    if (user.login_id !== loginId.toUpperCase()) {
      return res.status(401).json({
        success: false,
        message: 'Account mismatch'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Get accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Generate new token
    const newToken = generateToken(user.id, user.login_id);

    res.status(200).json({
      success: true,
      message: 'Switched account successfully',
      data: {
        user: {
          id: user.id,
          loginId: user.login_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified,
          kycStatus: user.kyc_status,
          maxSavedAccounts: user.max_saved_accounts ?? -1,
          closingMode: user.closing_mode ?? false,
        },
        accounts: accounts,
        token: newToken
      }
    });

  } catch (error) {
    console.error('Switch account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to switch account',
      error: error.message
    });
  }
};

// @desc    Logout
// @route   POST /api/auth/logout
const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

module.exports = {
  register,
  login,
  getMe,
  logout,
  switchAccount
};