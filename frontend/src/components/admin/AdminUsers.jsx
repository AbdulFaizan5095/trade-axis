// frontend/src/components/admin/AdminUsers.jsx
import { useEffect, useState } from 'react';
import api from '../../services/api';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronUp, Settings, RefreshCw, Lock, Unlock, Copy } from 'lucide-react';

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
  { value: 0.002, label: '0.20%' },
  { value: 0.005, label: '0.50%' },
];

export default function AdminUsers() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: 'user',
    password: '',
    leverage: 5,
    maxSavedAccounts: -1, // ✅ -1 = Unlimited
    brokerageRate: 0.0003,
    demoBalance: 100000,
    createDemo: true,
    createLive: true,
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/users?limit=500&q=${searchQuery}`);
      
      if (res.data?.success && res.data?.data) {
        setUsers(res.data.data);
      } else {
        setUsers([]);
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

  // ✅ Copy Login ID to clipboard
  const copyLoginId = (loginId) => {
    navigator.clipboard.writeText(loginId);
    toast.success(`Copied: ${loginId}`);
  };

  const createUser = async () => {
    if (!form.email || !form.firstName || !form.lastName) {
      return toast.error('Email, First name, Last name required');
    }

    try {
      const res = await api.post('/admin/users', {
        ...form,
        brokerageRate: Number(form.brokerageRate),
        maxSavedAccounts: form.maxSavedAccounts,
      });
      
      const data = res.data?.data;
      const tempPassword = data?.tempPassword;
      const loginId = data?.loginId; // ✅ Get the generated Login ID
      
      toast.success('User created');

      // ✅ Show Login ID prominently
      if (loginId) {
        const credentials = `Login ID: ${loginId}\nPassword: ${tempPassword}`;
        window.prompt('User credentials (copy now):', credentials);
      } else if (tempPassword) {
        window.prompt('Temporary password (copy now):', tempPassword);
      }

      setForm({
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        role: 'user',
        password: '',
        leverage: 5,
        maxSavedAccounts: -1,
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
      toast.error(e.response?.data?.message || 'Update failed');
    }
  };

  // ✅ NEW: Toggle closing mode
  const toggleClosingMode = async (u) => {
    try {
      const newMode = !u.closing_mode;
      await api.patch(`/admin/users/${u.id}/closing-mode`, { closingMode: newMode });
      toast.success(newMode 
        ? 'Closing mode ON - User can only close positions' 
        : 'Closing mode OFF - User can trade normally'
      );
      loadUsers();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Update failed');
    }
  };

  const resetPassword = async (u) => {
    try {
      const res = await api.post(`/admin/users/${u.id}/reset-password`, {});
      const tempPassword = res.data?.data?.tempPassword;
      toast.success('Password reset');
      if (tempPassword) {
        window.prompt(`New password for ${u.login_id || u.email}:`, tempPassword);
      }
    } catch (e) {
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
      toast.error(e.response?.data?.message || 'Update brokerage failed');
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
              Manage users, leverage, brokerage & closing mode
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* ✅ Search by Login ID */}
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search TA1000..."
              className="px-3 py-2 rounded text-sm w-32"
              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              onKeyDown={(e) => e.key === 'Enter' && loadUsers()}
            />
            <button
              onClick={loadUsers}
              className="p-2 rounded-lg flex items-center gap-2 text-sm"
              style={{ background: '#2a2e39', color: '#d1d4dc' }}
            >
              <RefreshCw size={16} />
            </button>
          </div>
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
                placeholder="Password (auto if empty)"
                type="password"
                className="px-3 py-2 rounded text-sm"
                style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>

            {/* Trading Settings */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>Leverage</label>
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

              <div>
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>Brokerage</label>
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
                <label className="text-xs mb-1 block" style={{ color: '#787b86' }}>Demo Balance</label>
                <input
                  value={form.demoBalance}
                  onChange={(e) => setForm((p) => ({ ...p, demoBalance: e.target.value }))}
                  type="number"
                  className="w-full px-3 py-2 rounded text-sm"
                  style={{ background: '#1e222d', border: '1px solid #363a45', color: '#d1d4dc' }}
                />
              </div>
            </div>

            {/* ✅ Info about Login ID */}
            <div className="p-2 rounded text-xs" style={{ background: '#2962ff20', color: '#2962ff' }}>
              💡 A unique Login ID (TA1000, TA1001, etc.) will be auto-generated
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

        <div className="space-y-2">
          {loading && users.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#787b86' }}>Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-8" style={{ color: '#787b86' }}>No users found</div>
          ) : (
            users.map((u) => {
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* ✅ Login ID prominently displayed */}
                          <button
                            onClick={(e) => { e.stopPropagation(); copyLoginId(u.login_id); }}
                            className="flex items-center gap-1 px-2 py-1 rounded font-mono text-sm font-bold"
                            style={{ background: '#2962ff20', color: '#2962ff' }}
                            title="Click to copy"
                          >
                            {u.login_id || 'TA????'}
                            <Copy size={12} />
                          </button>
                          
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

                          {/* ✅ Closing Mode indicator */}
                          {u.closing_mode && (
                            <span 
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                              style={{ background: '#ff980020', color: '#ff9800' }}
                            >
                              <Lock size={10} />
                              Closing Mode
                            </span>
                          )}
                        </div>
                        
                        <div className="text-xs mt-1" style={{ color: '#787b86' }}>
                          {u.first_name} {u.last_name} • {u.email}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* ✅ Closing Mode Toggle */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleClosingMode(u); }}
                          className="p-2 rounded"
                          style={{ 
                            background: u.closing_mode ? '#ff980030' : '#1e222d',
                            border: '1px solid #363a45'
                          }}
                          title={u.closing_mode ? 'Disable Closing Mode' : 'Enable Closing Mode'}
                        >
                          {u.closing_mode ? (
                            <Lock size={16} color="#ff9800" />
                          ) : (
                            <Unlock size={16} color="#787b86" />
                          )}
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); toggleActive(u); }}
                          className="px-3 py-1.5 rounded text-xs font-medium"
                          style={{ 
                            background: u.is_active ? '#ef535020' : '#26a69a20', 
                            color: u.is_active ? '#ef5350' : '#26a69a' 
                          }}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>

                        {isExpanded ? (
                          <ChevronUp size={18} color="#787b86" />
                        ) : (
                          <ChevronDown size={18} color="#787b86" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded section */}
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
                      <div className="grid grid-cols-2 gap-2 mb-3">
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

                        {/* Reset Password */}
                        <div className="p-2 rounded flex items-end" style={{ background: '#1e222d' }}>
                          <button
                            onClick={() => resetPassword(u)}
                            className="w-full px-3 py-1.5 rounded text-xs font-medium"
                            style={{ background: '#363a45', color: '#d1d4dc' }}
                          >
                            Reset Password
                          </button>
                        </div>
                      </div>

                      {/* Individual Accounts */}
                      {u.accounts && u.accounts.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium" style={{ color: '#d1d4dc' }}>
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
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}