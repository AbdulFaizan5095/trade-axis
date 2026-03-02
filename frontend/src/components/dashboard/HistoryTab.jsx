import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';

const HISTORY_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last Week' },
  { id: 'month', label: 'Last Month' },
  { id: '3months', label: 'Last 3 Months' },
];

const getPeriodStart = (periodId) => {
  const now = new Date();
  const d = new Date(now);

  switch (periodId) {
    case 'today':
      d.setHours(0, 0, 0, 0);
      return d;
    case 'week':
      d.setDate(d.getDate() - 7);
      return d;
    case 'month':
      d.setMonth(d.getMonth() - 1);
      return d;
    case '3months':
      d.setMonth(d.getMonth() - 3);
      return d;
    default:
      return null;
  }
};

export default function HistoryTab({
  tradeHistory = [],
  deals = [],
  dealsSummary,
  fetchDeals,
  accountId,
  formatINR,
}) {
  const [historyPeriod, setHistoryPeriod] = useState('month');
  const [historyViewMode, setHistoryViewMode] = useState('positions'); // positions | deals

  const [symbolFilter, setSymbolFilter] = useState('');
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // fetch deals when needed
  useEffect(() => {
    if (!accountId) return;
    if (historyViewMode !== 'deals') return;
    fetchDeals(accountId, historyPeriod);
  }, [accountId, historyViewMode, historyPeriod, fetchDeals]);

  // close dropdown on outside click
  useEffect(() => {
    if (!showSymbolDropdown) return;

    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowSymbolDropdown(false);
      }
    };

    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [showSymbolDropdown]);

  const filteredPositions = useMemo(() => {
    const start = getPeriodStart(historyPeriod);
    let list = tradeHistory || [];

    if (start) {
      list = list.filter((t) => {
        const ct = t.close_time || t.closeTime;
        if (!ct) return false;
        return new Date(ct) >= start;
      });
    }

    if (symbolFilter) {
      list = list.filter((t) => t.symbol === symbolFilter);
    }

    return list;
  }, [tradeHistory, historyPeriod, symbolFilter]);

  const uniqueSymbols = useMemo(() => {
    const s = new Set((tradeHistory || []).map((t) => t.symbol).filter(Boolean));
    return Array.from(s).sort();
  }, [tradeHistory]);

  const overallStats = useMemo(() => {
    const totalProfit = filteredPositions
      .filter((t) => Number(t.profit || 0) > 0)
      .reduce((sum, t) => sum + Number(t.profit || 0), 0);

    const totalLoss = Math.abs(
      filteredPositions
        .filter((t) => Number(t.profit || 0) < 0)
        .reduce((sum, t) => sum + Number(t.profit || 0), 0)
    );

    return {
      count: filteredPositions.length,
      totalProfit,
      totalLoss,
    };
  }, [filteredPositions]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
      <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {HISTORY_PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setHistoryPeriod(p.id)}
              className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
              style={{
                background: historyPeriod === p.id ? '#2962ff' : '#2a2e39',
                color: historyPeriod === p.id ? '#fff' : '#787b86',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          {[
            { id: 'positions', label: 'Positions' },
            { id: 'deals', label: 'Deals' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setHistoryViewMode(m.id)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium"
              style={{
                background: historyViewMode === m.id ? '#2a2e39' : 'transparent',
                color: historyViewMode === m.id ? '#d1d4dc' : '#787b86',
                border: `1px solid ${historyViewMode === m.id ? '#363a45' : 'transparent'}`,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {historyViewMode === 'positions' && (
          <div className="mt-2 relative" ref={dropdownRef}>
            <button
              className="w-full px-3 py-2 rounded-lg text-sm text-left flex items-center justify-between"
              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              onClick={(e) => {
                e.stopPropagation();
                setShowSymbolDropdown((v) => !v);
              }}
            >
              <span>{symbolFilter || 'All Symbols'}</span>
              <ChevronDown size={16} color="#787b86" />
            </button>

            {showSymbolDropdown && (
              <div
                className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-20 max-h-60 overflow-y-auto"
                style={{ background: '#2a2e39', border: '1px solid #363a45' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                  style={{ color: !symbolFilter ? '#2962ff' : '#d1d4dc' }}
                  onClick={() => {
                    setSymbolFilter('');
                    setShowSymbolDropdown(false);
                  }}
                >
                  All Symbols
                </button>

                {uniqueSymbols.map((sym) => (
                  <button
                    key={sym}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                    style={{ color: symbolFilter === sym ? '#2962ff' : '#d1d4dc' }}
                    onClick={() => {
                      setSymbolFilter(sym);
                      setShowSymbolDropdown(false);
                    }}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Positions stats (NO commission here) */}
      {historyViewMode === 'positions' && (
        <div
          className="p-3 border-b grid grid-cols-3 gap-2 text-center"
          style={{ borderColor: '#363a45', background: '#252832' }}
        >
          <div>
            <div className="text-xs" style={{ color: '#787b86' }}>Trades</div>
            <div className="font-bold" style={{ color: '#d1d4dc' }}>{overallStats.count}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: '#787b86' }}>Profit</div>
            <div className="font-bold" style={{ color: '#26a69a' }}>+{formatINR(overallStats.totalProfit)}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: '#787b86' }}>Loss</div>
            <div className="font-bold" style={{ color: '#ef5350' }}>-{formatINR(overallStats.totalLoss)}</div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {historyViewMode === 'positions' && (
          <>
            {filteredPositions.length === 0 ? (
              <div className="p-8 text-center" style={{ color: '#787b86' }}>
                <Clock size={48} className="mx-auto mb-3 opacity-30" />
                <div className="text-base">No closed positions</div>
              </div>
            ) : (
              filteredPositions.map((t) => {
                const pnl = Number(t.profit || 0);
                return (
                  <div key={t.id} className="p-3 border-b" style={{ borderColor: '#363a45' }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-base" style={{ color: '#d1d4dc' }}>{t.symbol}</div>
                        <div className="text-sm" style={{ color: '#787b86' }}>
                          {String(t.trade_type || '').toUpperCase()} • Qty {t.quantity}
                        </div>
                        <div className="text-xs mt-1" style={{ color: '#787b86' }}>
                          {t.close_time ? new Date(t.close_time).toLocaleString() : ''}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-lg" style={{ color: pnl >= 0 ? '#26a69a' : '#ef5350' }}>
                          {pnl >= 0 ? '+' : ''}{formatINR(pnl)}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 mt-2 text-xs" style={{ color: '#787b86' }}>
                      <span>Open: {Number(t.open_price || 0).toFixed(2)}</span>
                      <span>Close: {Number(t.close_price || 0).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}

        {historyViewMode === 'deals' && (
          <>
            {dealsSummary && (
              <div className="p-3 border-b" style={{ borderColor: '#363a45', background: '#252832' }}>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: '#787b86' }}>Profit:</span>
                    <span style={{ color: '#26a69a' }}>+{formatINR(dealsSummary.totalProfit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#787b86' }}>Loss:</span>
                    <span style={{ color: '#ef5350' }}>-{formatINR(dealsSummary.totalLoss)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#787b86' }}>Deposits:</span>
                    <span style={{ color: '#26a69a' }}>+{formatINR(dealsSummary.totalDeposits)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#787b86' }}>Withdrawals:</span>
                    <span style={{ color: '#ef5350' }}>-{formatINR(dealsSummary.totalWithdrawals)}</span>
                  </div>
                  <div className="flex justify-between col-span-2 pt-2 border-t" style={{ borderColor: '#363a45' }}>
                    <span style={{ color: '#787b86' }}>Total Commission:</span>
                    <span className="font-bold" style={{ color: '#f5c542' }}>
                      {formatINR(dealsSummary.totalCommission)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {(!deals || deals.length === 0) && (
              <div className="p-8 text-center" style={{ color: '#787b86' }}>
                <Clock size={48} className="mx-auto mb-3 opacity-30" />
                <div className="text-base">No deals found</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}