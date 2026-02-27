// frontend/src/pages/AdminPanel.jsx
import { useState } from 'react';
import AdminUsers from '../components/admin/AdminUsers';
import AdminWithdrawals from '../components/admin/AdminWithdrawals';

export default function AdminPanel() {
  const [adminView, setAdminView] = useState('users');

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
      {/* Tab selector */}
      <div className="flex border-b" style={{ borderColor: '#363a45' }}>
        <button
          onClick={() => setAdminView('users')}
          className="flex-1 py-3 text-sm font-medium border-b-2"
          style={{
            color: adminView === 'users' ? '#2962ff' : '#787b86',
            borderColor: adminView === 'users' ? '#2962ff' : 'transparent',
          }}
        >
          Users Management
        </button>
        <button
          onClick={() => setAdminView('withdrawals')}
          className="flex-1 py-3 text-sm font-medium border-b-2"
          style={{
            color: adminView === 'withdrawals' ? '#2962ff' : '#787b86',
            borderColor: adminView === 'withdrawals' ? '#2962ff' : 'transparent',
          }}
        >
          Withdrawal Requests
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {adminView === 'users' ? <AdminUsers /> : <AdminWithdrawals />}
      </div>
    </div>
  );
}