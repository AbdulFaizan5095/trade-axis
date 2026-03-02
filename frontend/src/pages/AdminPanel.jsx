// frontend/src/pages/AdminPanel.jsx
import { useState } from 'react';
import AdminUsers from '../components/admin/AdminUsers';
import AdminWithdrawals from '../components/admin/AdminWithdrawals';
import AdminKiteSetup from '../components/admin/AdminKiteSetup';

export default function AdminPanel() {
  const [adminView, setAdminView] = useState('users');

  const tabs = [
    { id: 'users', label: 'Users' },
    { id: 'withdrawals', label: 'Withdrawals' },
    { id: 'kite', label: '🔌 Kite Setup' },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
      {/* Tab selector */}
      <div className="flex border-b overflow-x-auto" style={{ borderColor: '#363a45' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setAdminView(tab.id)}
            className="flex-1 py-3 text-sm font-medium border-b-2 whitespace-nowrap px-4"
            style={{
              color: adminView === tab.id ? '#2962ff' : '#787b86',
              borderColor: adminView === tab.id ? '#2962ff' : 'transparent',
              minWidth: '100px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {adminView === 'users' && <AdminUsers />}
        {adminView === 'withdrawals' && <AdminWithdrawals />}
        {adminView === 'kite' && <AdminKiteSetup />}
      </div>
    </div>
  );
}