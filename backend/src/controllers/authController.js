// backend/src/controllers/authController.js
const { supabase } = require('../config/supabase');
const { hashPassword, comparePassword, generateToken, generateAccountNumber } = require('../utils/auth');

// @desc    Register new user (Admin only)
// @route   POST /api/auth/register
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

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

    const hashedPassword = await hashPassword(password);

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([
        {
          email: email.toLowerCase(),
          password_hash: hashedPassword,
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          is_verified: false,
          is_active: true,
          role: 'user',
          max_saved_accounts: 5 // ✅ Default
        }
      ])
      .select('id, email, first_name, last_name, phone, role, is_verified, max_saved_accounts')
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

    const token = generateToken(user.id, user.email);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified,
          maxSavedAccounts: user.max_saved_accounts
        },
        accounts: [demoAccount, liveAccount],
        token
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
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
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

    const token = generateToken(user.id, user.email);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified,
          kycStatus: user.kyc_status,
          maxSavedAccounts: user.max_saved_accounts || 5 // ✅ NEW
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

    // ✅ Get max_saved_accounts from user
    const { data: userData } = await supabase
      .from('users')
      .select('max_saved_accounts')
      .eq('id', req.user.id)
      .single();

    res.status(200).json({
      success: true,
      data: {
        user: {
          ...req.user,
          maxSavedAccounts: userData?.max_saved_accounts || 5
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

// ✅ NEW: Quick login for saved accounts (validates token, returns fresh data)
// @route   POST /api/auth/switch-account
const switchAccount = async (req, res) => {
  try {
    const { email, token: savedToken } = req.body;

    if (!email || !savedToken) {
      return res.status(400).json({
        success: false,
        message: 'Email and token required'
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

    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Account not found'
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
    const newToken = generateToken(user.id, user.email);

    res.status(200).json({
      success: true,
      message: 'Switched account successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role,
          isVerified: user.is_verified,
          kycStatus: user.kyc_status,
          maxSavedAccounts: user.max_saved_accounts || 5
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
  switchAccount // ✅ NEW
};