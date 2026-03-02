// frontend/src/store/authStore.js
import { create } from 'zustand';
import api from '../services/api';
import socketService from '../services/socket';

const SAVED_ACCOUNTS_KEY = 'trade_axis_saved_accounts';

// ✅ Helper: deduplicate saved accounts by loginId, then by email
const deduplicateAccounts = (accounts) => {
  const seen = new Set();
  return accounts.filter(acc => {
    const key = acc.loginId || acc.email;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const useAuthStore = create((set, get) => ({
  user: null,
  accounts: [],
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  isLoading: true,
  // ✅ Deduplicate on load
  savedAccounts: deduplicateAccounts(JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || '[]')),

  login: async (loginId, password) => {
    try {
      const response = await api.post('/auth/login', { loginId, password });
      const { user, accounts, token } = response.data.data;
      
      localStorage.setItem('token', token);
      socketService.connect(token);
      
      set({ user, accounts, token, isAuthenticated: true, isLoading: false });
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

  fullLogout: (loginId) => {
    const { savedAccounts } = get();
    const updated = savedAccounts.filter(acc => acc.loginId !== loginId && acc.email !== loginId);
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    
    localStorage.removeItem('token');
    socketService.disconnect();
    set({ user: null, accounts: [], token: null, isAuthenticated: false, savedAccounts: updated });
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
      get().saveCurrentAccount();
    } catch (error) {
      localStorage.removeItem('token');
      set({ user: null, accounts: [], token: null, isAuthenticated: false, isLoading: false });
    }
  },

  setAccounts: (accounts) => set({ accounts }),

  saveCurrentAccount: () => {
    const { user, token, savedAccounts } = get();
    if (!user || !token) return;

    const maxSaved = user.maxSavedAccounts === -1 ? 999 : (user.maxSavedAccounts || 5);
    
    // ✅ Check by loginId first, then email
    const uniqueKey = user.loginId || user.email;
    const existingIndex = savedAccounts.findIndex(acc => 
      (acc.loginId && acc.loginId === user.loginId) || 
      (!acc.loginId && acc.email === user.email)
    );
    
    const accountData = {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      token: token,
      savedAt: new Date().toISOString()
    };

    let updated;
    if (existingIndex >= 0) {
      updated = [...savedAccounts];
      updated[existingIndex] = accountData;
    } else {
      updated = [accountData, ...savedAccounts].slice(0, maxSaved);
    }

    // ✅ Deduplicate before saving
    updated = deduplicateAccounts(updated);

    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    set({ savedAccounts: updated });
  },

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
      
      // ✅ Check by both loginId and email
      if (savedAccounts.some(acc => 
        (acc.loginId && acc.loginId === user.loginId) || 
        (acc.email === user.email)
      )) {
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

      const updated = deduplicateAccounts([...savedAccounts, accountData]);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
      set({ savedAccounts: updated });

      return { success: true, message: 'Account added successfully' };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Login failed' };
    }
  },

  // ✅ FIXED: Send both loginId and email for backward compatibility
  switchToAccount: async (savedAccount) => {
    try {
      const response = await api.post('/auth/switch-account', {
        loginId: savedAccount.loginId || null,
        email: savedAccount.email || null,
        token: savedAccount.token
      });

      const { user, accounts, token } = response.data.data;
      
      localStorage.setItem('token', token);
      socketService.disconnect();
      socketService.connect(token);
      
      set({ user, accounts, token, isAuthenticated: true, isLoading: false });
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

  // ✅ FIXED: Remove by loginId OR email
  removeSavedAccount: (identifier) => {
    const { savedAccounts, user } = get();
    
    if (user?.loginId === identifier || user?.email === identifier) {
      return { success: false, message: 'Cannot remove currently active account' };
    }

    const updated = savedAccounts.filter(acc => 
      acc.loginId !== identifier && acc.email !== identifier
    );
    localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(updated));
    set({ savedAccounts: updated });
    
    return { success: true };
  },

  getMaxSavedAccounts: () => {
    const { user } = get();
    const max = user?.maxSavedAccounts;
    if (max === -1 || max === undefined) return '∞';
    return max || 5;
  },

  isClosingMode: () => {
    const { user } = get();
    return user?.closingMode || false;
  },
}));

export default useAuthStore;