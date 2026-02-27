// frontend/src/components/admin/AdminUsers.jsx
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronUp, Settings, DollarSign, RefreshCw } from 'lucide-react';

// Leverage options (1:1 to 1:200)
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 20, 25, 50, 100, 200];

// Brokerage rate options (in percentage)
const BROKERAGE_OPTIONS = [
  { value: 0, label: '0% (No Brokerage)' },
  { value: 0.0001, label: '0.01%' },
  { value: 0.0002, label: '0.02%' },
  { value: 0.0003, label: '0.03% (Default)' },
  { value: 0.0005, label: '0.05%' },
  { value: 0.001, label: '0.10%' },
  { value: 0.0015, label: '0.15%' },
  { value: 0.002, label: '0.20%' },
  { value: 0.0025, label: '0.25%' },
  { value: 0.005, label: '0.50%' },
];

export default function AdminUsers() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [expandedUserId, setExpandedUserId] = useState(null);

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'user',
    password: '',
    leverage: 5,
    maxSavedAccounts: 5,
    brokerageRate: 0.0003, // Default 0.03%
    demoBalance: 100000,
    createDemo: true,
    createLive: true,
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users?limit=200');
      console.log('Users API Response:', res.data);
      
      if (res.data?.success && res.data?.data) {
        setUsers(res.data.data);
        console.log('Users loaded:', res.data.data.length);
      } else {
        setUsers([]);
        console.log('No users in response');
      }
    } catch (e) {
      console.error('Load users error:', e);
      toast.error(e.response?.data?.message || 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const createUser = async () => {
    if (!form.email || !form.firstName || !form.lastName) {
      return toast.error('Email, First name, Last name required');
    }

    try {
      const res = await api.post('/admin/users', {
        ...form,
        brokerageRate: Number(form.brokerageRate),
      });
      const tempPassword = res.data?.data?.tempPassword;
      toast.success('User created');

      if (tempPassword) {
        window.prompt('Temporary password (copy it now):', tempPassword);
      }

      setForm({
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        role: 'user',
        password: '',
        leverage: 5,
        maxSavedAccounts: 5,
        brokerageRate: 0.0003,
        demoBalance: 100000,
        createDemo: true,
        createLive: true,
      });

      loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Create user failed');
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/admin/users/${u.id}/active`, { isActive: !u.is_active });
      toast.success('Updated');
      loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Update failed');
    }
  };

  const resetPassword = async (u) => {
    try {
      const res = await api.post(`/admin/users/${u.id}/reset-password`, {});
      const tempPassword = res.data?.data?.tempPassword;
      toast.success('Password reset');
      if (tempPassword) window.prompt('Temporary password (copy it now):', tempPassword);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Reset failed');
    }
  };

  const updateLeverage = async (userId, accountId, leverage) => {
    try {
      await api.patch(`/admin/users/${userId}/leverage`, { 
        leverage: Number(leverage),
        accountId 
      });
      toast.success(`Leverage updated to 1:${leverage}`);
      loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Update leverage failed');
    }
  };

  const updateAllAccountsLeverage = async (userId, leverage) => {
    try {
      await api.patch(`/admin/users/${userId}/leverage`, { 
        leverage: Number(leverage)
      });
      toast.success(`All accounts leverage updated to 1:${leverage}`);
      loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Update leverage failed');
    }
  };

  const updateBrokerageRate = async (userId, brokerageRate) => {
    try {
      await api.patch(`/admin/users/${userId}/brokerage`, { 
        brokerageRate: Number(brokerageRate)
      });
      toast.success(`Brokerage updated to ${(Number(brokerageRate) * 100).toFixed(2)}%`);
      loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Update brokerage failed');
    }
  };

  const updateMaxSavedAccounts = async (userId, maxSavedAccounts) => {
    try {
      await api.patch(`/admin/users/${userId}/max-saved-accounts`, { 
        maxSavedAccounts: Number(maxSavedAccounts)
      });
      toast.success(`Max saved accounts updated to ${maxSavedAccounts}`);
      loadUsers();
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Update failed');
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#1e222d' }}>
      <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold" style={{ color: '#d1d4dc' }}>
              Admin • Users
            </div>
            <div className="text-xs mt-1" style={{ color: '#787b86' }}>
              Manage users, leverage & brokerage
            </div>
          </div>
          <button
            onClick={loadUsers}
            className="p-2 rounded-lg flex items-center gap-2 text-sm"
            style={{ background: '#2a2e39', color: '#d1d4dc' }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Create user form */}
        <div className="p-4 rounded-lg mb-4" style={{ background: '#2a2e39', border: '1px solid #363a45' }}>
          <div className="text-sm font-semibold mb-3" style={{ color: '#d1d4dc' }}>
            Create New User
          </div>

          <div className="grid grid-cols-1 gap-2">
            <input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="Email"
              className="px-3 py-2 rounded text-sm"
              style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
            />
            
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                placeholder="First name"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
              <input
                value={form.lastName}
                onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                placeholder="Last name"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Phone (optional)"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
              <input
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Password (optional)"
                type="password"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>

              <input
                value={form.demoBalance}
                onChange={(e) => setForm((p) => ({ ...p, demoBalance: e.target.value }))}
                placeholder="Demo Balance"
                type="number"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>

            {/* Trading Settings */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>
                  Leverage
                </label>
                <select
                  value={form.leverage}
                  onChange={(e) => setForm((p) => ({ ...p, leverage: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                >
                  {LEVERAGE_OPTIONS.map((lev) => (
                    <option key={lev} value={lev}>1:{lev}</option>
                  ))}
                </select>
              </div>

              {/* Brokerage Rate */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>
                  Brokerage
                </label>
                <select
                  value={form.brokerageRate}
                  onChange={(e) => setForm((p) => ({ ...p, brokerageRate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                >
                  {BROKERAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>
                  Max Accounts
                </label>
                <select
                  value={form.maxSavedAccounts}
                  onChange={(e) => setForm((p) => ({ ...p, maxSavedAccounts: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs flex items-center gap-2" style={{ color: '#787b86' }}>
                <input
                  type="checkbox"
                  checked={form.createDemo}
                  onChange={(e) => setForm((p) => ({ ...p, createDemo: e.target.checked }))}
                />
                Create Demo Account
              </label>

              <label className="text-xs flex items-center gap-2" style={{ color: '#787b86' }}>
                <input
                  type="checkbox"
                  checked={form.createLive}
                  onChange={(e) => setForm((p) => ({ ...p, createLive: e.target.checked }))}
                />
                Create Live Account
              </label>
            </div>

            <button
              onClick={createUser}
              className="py-2.5 rounded font-semibold text-sm"
              style={{ background: '#2962ff', color: '#fff' }}
            >
              Create User
            </button>
          </div>
        </div>

        {/* Users list */}
        <div className="text-sm font-semibold mb-2" style={{ color: '#d1d4dc' }}>
          Users ({users.length})
          {loading && <span className="ml-2 text-xs font-normal" style={{ color: '#787b86' }}>(Loading...)</span>}
        </div>

        {/* ✅ FIXED: Users list display */}
        <div className="space-y-2">
          {loading && users.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#787b86' }}>
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#787b86' }}>
              No users found
            </div>
          ) : (
            <>
              {users.map((u) => {
                const isExpanded = expandedUserId === u.id;
                
                return (
                  <div
                    key={u.id}
                    className="rounded-lg overflow-hidden"
                    style={{ background: '#2a2e39', border: '1px solid #363a45' }}
                  >
                    {/* User header row */}
                    <div 
                      className="p-3 cursor-pointer hover:bg-white/5"
                      onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span style={{ color: '#d1d4dc', fontWeight: 700 }}>{u.email}</span>
                            <span 
                              className="px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{ 
                                background: u.role === 'admin' ? '#2962ff20' : '#26a69a20',
                                color: u.role === 'admin' ? '#2962ff' : '#26a69a'
                              }}
                            >
                              {u.role || 'user'}
                            </span>
                            {u.is_active ? (
                              <span className="text-[10px]" style={{ color: '#26a69a' }}>● Active</span>
                            ) : (
                              <span className="text-[10px]" style={{ color: '#ef5350' }}>● Inactive</span>
                            )}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: '#787b86' }}>
                            {u.first_name || '-'} {u.last_name || '-'} • {u.phone || 'No phone'}
                            {u.brokerage_rate !== undefined && (
                              <span> • Brokerage: {(Number(u.brokerage_rate) * 100).toFixed(2)}%</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActive(u);
                            }}
                            className="px-3 py-1.5 rounded text-xs font-medium"
                            style={{ 
                              background: u.is_active ? '#ef535020' : '#26a69a20', 
                              color: u.is_active ? '#ef5350' : '#26a69a' 
                            }}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              resetPassword(u);
                            }}
                            className="px-3 py-1.5 rounded text-xs"
                            style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                          >
                            Reset Pass
                          </button>

                          {isExpanded ? (
                            <ChevronUp size={18} color="#787b86" />
                          ) : (
                            <ChevronDown size={18} color="#787b86" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded section - Settings */}
                    {isExpanded && (
                      <div 
                        className="p-3 border-t"
                        style={{ borderColor: '#363a45', background: '#252832' }}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <Settings size={14} color="#787b86" />
                          <span className="text-xs font-semibold" style={{ color: '#787b86' }}>
                            Account Settings
                          </span>
                        </div>

                        {/* User Settings */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {/* Max Saved Accounts */}
                          <div className="p-2 rounded" style={{ background: '#1e222d' }}>
                            <label className="text-xs block mb-1" style={{ color: '#787b86' }}>Max Saved Accounts</label>
                            <select
                              value={u.max_saved_accounts || 5}
                              onChange={(e) => updateMaxSavedAccounts(u.id, e.target.value)}
                              className="w-full px-2 py-1 rounded text-xs"
                              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                          </div>

                          {/* Brokerage Rate */}
                          <div className="p-2 rounded" style={{ background: '#1e222d' }}>
                            <label className="text-xs block mb-1" style={{ color: '#787b86' }}>Brokerage Rate</label>
                            <select
                              value={u.brokerage_rate || 0.0003}
                              onChange={(e) => updateBrokerageRate(u.id, e.target.value)}
                              className="w-full px-2 py-1 rounded text-xs"
                              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                            >
                              {BROKERAGE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* All Accounts Leverage */}
                          <div className="p-2 rounded" style={{ background: '#1e222d' }}>
                            <label className="text-xs block mb-1" style={{ color: '#787b86' }}>All Accounts Leverage</label>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  updateAllAccountsLeverage(u.id, e.target.value);
                                  e.target.value = '';
                                }
                              }}
                              className="w-full px-2 py-1 rounded text-xs"
                              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                            >
                              <option value="">Update all...</option>
                              {LEVERAGE_OPTIONS.map((lev) => (
                                <option key={lev} value={lev}>Set to 1:{lev}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Individual Accounts */}
                        {u.accounts && u.accounts.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-xs font-medium mb-2" style={{ color: '#d1d4dc' }}>
                              Trading Accounts:
                            </div>
                            
                            {u.accounts.map((acc) => (
                              <div 
                                key={acc.id}
                                className="flex items-center justify-between p-2 rounded"
                                style={{ background: '#1e222d' }}
                              >
                                <div>
                                  <span className="text-xs font-medium" style={{ color: '#d1d4dc' }}>
                                    {acc.account_number}
                                  </span>
                                  <span 
                                    className="ml-2 px-1.5 py-0.5 rounded text-[10px]"
                                    style={{ 
                                      background: acc.is_demo ? '#f5c54220' : '#26a69a20',
                                      color: acc.is_demo ? '#f5c542' : '#26a69a'
                                    }}
                                  >
                                    {acc.is_demo ? 'DEMO' : 'LIVE'}
                                  </span>
                                  <span className="ml-2 text-[10px]" style={{ color: '#787b86' }}>
                                    ₹{parseFloat(acc.balance || 0).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  <span className="text-xs" style={{ color: '#787b86' }}>Leverage:</span>
                                  <select
                                    value={acc.leverage || 5}
                                    onChange={(e) => updateLeverage(u.id, acc.id, e.target.value)}
                                    className="px-2 py-1 rounded text-xs font-medium"
                                    style={{ 
                                      background: '#2962ff20', 
                                      border: '1px solid #2962ff50', 
                                      color: '#2962ff' 
                                    }}
                                  >
                                    {LEVERAGE_OPTIONS.map((lev) => (
                                      <option key={lev} value={lev}>1:{lev}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs" style={{ color: '#787b86' }}>
                            No accounts found for this user
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}