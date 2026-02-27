// frontend/src/store/authStore.js
import { create } from 'zustand';
import api from '../services/api';
import socketService from '../services/socket';

// ✅ Saved accounts storage key
const SAVED_ACCOUNTS_KEY = 'trade_axis_saved_accounts';

const useAuthStore = create((set, get) => ({
  user: null,
  accounts: [],
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  isLoading: true,
  savedAccounts: JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || '[]'), // ✅ NEW

  login: async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accounts, token } = response.data.data;
      
      localStorage.setItem('token', token);
      socketService.connect(token);
      
      set({ user, accounts, token, isAuthenticated: true, isLoading: false });
      
      // ✅ Auto-save account after successful login
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
    // Note: We don't clear savedAccounts on logout
  },

  // ✅ NEW: Full logout - removes saved account too
  fullLogout: (email) => {
    const { savedAccounts } = get();
    const updated = savedAccounts.filter(acc => acc.email !== email);
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
      
      // ✅ Update saved account with fresh data
      get().saveCurrentAccount();
    } catch (error) {
      localStorage.removeItem('token');
      set({ user: null, accounts: [], token: null, isAuthenticated: false, isLoading: false });
    }
  },

  setAccounts: (accounts) => set({ accounts }),

  // ✅ NEW: Save current account to saved accounts list
  saveCurrentAccount: () => {
    const { user, token, savedAccounts } = get();
    if (!user || !token) return;

    const maxSaved = user.maxSavedAccounts || 5;
    
    // Check if already saved
    const existingIndex = savedAccounts.findIndex(acc => acc.email === user.email);
    
    const accountData = {
      id: user.id,
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

  // ✅ NEW: Add account manually (login + save)
  addAccount: async (email, password) => {
    const { user: currentUser, savedAccounts } = get();
    const maxSaved = currentUser?.maxSavedAccounts || 5;

    if (savedAccounts.length >= maxSaved) {
      return { 
        success: false, 
        message: `Maximum ${maxSaved} saved accounts allowed. Remove one first.` 
      };
    }

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, token } = response.data.data;
      
      // Check if already exists
      if (savedAccounts.some(acc => acc.email === user.email)) {
        return { success: false, message: 'Account already saved' };
      }

      const accountData = {
        id: user.id,
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

  // ✅ NEW: Switch to saved account
  switchToAccount: async (savedAccount) => {
    try {
      // Try to use saved token first
      const response = await api.post('/auth/switch-account', {
        email: savedAccount.email,
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
      // Token expired, need re-login
      return { 
        success: false, 
        message: error.response?.data?.message || 'Session expired. Please login again.',
        requiresLogin: true
      };
    }
  },

  // ✅ NEW: Remove saved account
  removeSavedAccount: (email) => {
    const { savedAccounts, user } = get();
    
    // Don't allow removing current account
    if (user?.email === email) {
      return { success: false, message: 'Cannot remove currently active account' };
    }

    const updated = savedAccounts.filter(acc => acc.email !== email);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    set({ savedAccounts: updated });
    
    return { success: true };
  },

  // ✅ NEW: Get max saved accounts for current user
  getMaxSavedAccounts: () => {
    const { user } = get();
    return user?.maxSavedAccounts || 5;
  },
}));

export default useAuthStore;