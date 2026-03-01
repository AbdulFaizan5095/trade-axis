// frontend/src/store/authStore.js
import { create } from 'zustand';
import api from '../services/api';
import socketService from '../services/socket';

// Saved accounts storage key
const SAVED_ACCOUNTS_KEY = 'trade_axis_saved_accounts';

const useAuthStore = create((set, get) => ({
  user: null,
  accounts: [],
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  isLoading: true,
  savedAccounts: JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || '[]'),

  // ✅ Updated: Login with Login ID (TA1000 format)
  login: async (loginId, password) => {
    try {
      const response = await api.post('/auth/login', { loginId, password }); // ✅ Changed from email
      const { user, accounts, token } = response.data.data;
      
      localStorage.setItem('token', token);
      socketService.connect(token);
      
      set({ user, accounts, token, isAuthenticated: true, isLoading: false });
      
      // Auto-save account after successful login
      get().saveCurrentAccount();
      
      return { success: true };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Login failed' };
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    socketService.disconnect();
    set({ user: null, accounts: [], token: null, isAuthenticated: false });
  },

  // Full logout - removes saved account too
  fullLogout: (loginId) => {
    const { savedAccounts } = get();
    const updated = savedAccounts.filter(acc => acc.loginId !== loginId);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    
    localStorage.removeItem('token');
    socketService.disconnect();
    set({ 
      user: null, 
      accounts: [], 
      token: null, 
      isAuthenticated: false,
      savedAccounts: updated
    });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const response = await api.get('/auth/me');
      const { user, accounts } = response.data.data;
      socketService.connect(token);
      set({ user, accounts, token, isAuthenticated: true, isLoading: false });
      
      // Update saved account with fresh data
      get().saveCurrentAccount();
    } catch (error) {
      localStorage.removeItem('token');
      set({ user: null, accounts: [], token: null, isAuthenticated: false, isLoading: false });
    }
  },

  setAccounts: (accounts) => set({ accounts }),

  // ✅ Updated: Save current account using loginId
  saveCurrentAccount: () => {
    const { user, token, savedAccounts } = get();
    if (!user || !token) return;

    // -1 means unlimited
    const maxSaved = user.maxSavedAccounts === -1 ? 999 : (user.maxSavedAccounts || 5);
    
    // Check if already saved (by loginId)
    const existingIndex = savedAccounts.findIndex(acc => acc.loginId === user.loginId);
    
    const accountData = {
      id: user.id,
      loginId: user.loginId, // ✅ Use loginId instead of email
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      token: token,
      savedAt: new Date().toISOString()
    };

    let updated;
    if (existingIndex >= 0) {
      // Update existing
      updated = [...savedAccounts];
      updated[existingIndex] = accountData;
    } else {
      // Add new (respect max limit)
      updated = [accountData, ...savedAccounts].slice(0, maxSaved);
    }

    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    set({ savedAccounts: updated });
  },

  // ✅ Updated: Add account manually (login + save)
  addAccount: async (loginId, password) => {
    const { user: currentUser, savedAccounts } = get();
    const maxSaved = currentUser?.maxSavedAccounts === -1 ? 999 : (currentUser?.maxSavedAccounts || 5);

    if (savedAccounts.length >= maxSaved) {
      return { 
        success: false, 
        message: maxSaved === 999 
          ? 'Cannot add more accounts' 
          : `Maximum ${maxSaved} saved accounts allowed. Remove one first.`
      };
    }

    try {
      const response = await api.post('/auth/login', { loginId, password });
      const { user, token } = response.data.data;
      
      // Check if already exists
      if (savedAccounts.some(acc => acc.loginId === user.loginId)) {
        return { success: false, message: 'Account already saved' };
      }

      const accountData = {
        id: user.id,
        loginId: user.loginId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        token: token,
        savedAt: new Date().toISOString()
      };

      const updated = [...savedAccounts, accountData];
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
      set({ savedAccounts: updated });

      return { success: true, message: 'Account added successfully' };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Login failed' };
    }
  },

  // ✅ Updated: Switch to saved account using loginId
  switchToAccount: async (savedAccount) => {
    try {
      const response = await api.post('/auth/switch-account', {
        loginId: savedAccount.loginId, // ✅ Use loginId
        token: savedAccount.token
      });

      const { user, accounts, token } = response.data.data;
      
      localStorage.setItem('token', token);
      socketService.disconnect();
      socketService.connect(token);
      
      set({ user, accounts, token, isAuthenticated: true, isLoading: false });
      
      // Update saved account with new token
      get().saveCurrentAccount();
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Session expired. Please login again.',
        requiresLogin: true
      };
    }
  },

  // ✅ Updated: Remove saved account by loginId
  removeSavedAccount: (loginId) => {
    const { savedAccounts, user } = get();
    
    // Don't allow removing current account
    if (user?.loginId === loginId) {
      return { success: false, message: 'Cannot remove currently active account' };
    }

    const updated = savedAccounts.filter(acc => acc.loginId !== loginId);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    set({ savedAccounts: updated });
    
    return { success: true };
  },

  // Get max saved accounts for current user (-1 = unlimited)
  getMaxSavedAccounts: () => {
    const { user } = get();
    const max = user?.maxSavedAccounts;
    if (max === -1 || max === undefined) return '∞'; // Unlimited
    return max || 5;
  },

  // ✅ Check if user is in closing mode
  isClosingMode: () => {
    const { user } = get();
    return user?.closingMode || false;
  },
}));

export default useAuthStore;