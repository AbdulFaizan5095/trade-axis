import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, ChevronDown, FolderPlus, Plus, Search, Star, TrendingUp, X } from 'lucide-react';

const SYMBOL_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'index_futures', label: 'Index Futures' },
  { id: 'stock_futures', label: 'Stock Futures' },
  { id: 'commodity_futures', label: 'Commodities' },
];

const norm = (v) => String(v || '').toLowerCase().trim();

const inferIndianCategory = (sym) => {
  const c = norm(sym.category);
  const seg = norm(sym.segment);
  const inst = norm(sym.instrument_type);
  const name = norm(sym.display_name);
  const s = String(sym.symbol || '').toUpperCase();

  const looksLikeIndex =
    /NIFTY|SENSEX|BANKNIFTY|FINNIFTY|MIDCPNIFTY/i.test(s) ||
    c.includes('index') ||
    c.includes('indices') ||
    seg.includes('index') ||
    inst.includes('index') ||
    name.includes('nifty') ||
    name.includes('sensex');

  if (looksLikeIndex) return 'index_futures';

  const looksLikeCommodity =
    c.includes('commodity') || seg.includes('commodity') || name.includes('gold') || name.includes('crude');

  if (looksLikeCommodity) return 'commodity_futures';

  return 'stock_futures';
};

const matchesSelectedCategory = (sym, selectedCategory) => {
  if (selectedCategory === 'all') return true;
  return inferIndianCategory(sym) === selectedCategory;
};

export default function QuotesTab({
  symbols = [],
  selectedSymbol,
  onSelectSymbol,

  watchlists = [],
  activeWatchlistId,
  activeSymbols = [],

  currentWatchlistName,

  onSwitchWatchlist,
  onCreateWatchlist,
  onToggleSymbol,

  onOpenOrderModal,
  onOpenChartTab,
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  const [showWatchlistMenu, setShowWatchlistMenu] = useState(false);
  const [showSymbolMenu, setShowSymbolMenu] = useState(false);
  const [selectedSymbolForAction, setSelectedSymbolForAction] = useState(null);

  const filteredSymbols = useMemo(() => {
    let list = symbols.filter((s) => matchesSelectedCategory(s, selectedCategory));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return list.filter((s) => {
        const sym = String(s.symbol || '').toLowerCase();
        const dn = String(s.display_name || '').toLowerCase();
        return sym.includes(q) || dn.includes(q);
      });
    }

    // If no search => show watchlist symbols only
    const wl = new Set(activeSymbols.map((x) => String(x).toUpperCase()));
    return list.filter((s) => wl.has(String(s.symbol).toUpperCase()));
  }, [symbols, selectedCategory, search, activeSymbols]);

  const openSymbolMenu = (sym) => {
    setSelectedSymbolForAction(sym);
    setShowSymbolMenu(true);
  };

  const SymbolActionMenu = () => {
    if (!showSymbolMenu || !selectedSymbolForAction) return null;

    const sym = selectedSymbolForAction;
    const inWL = activeSymbols.includes(String(sym.symbol).toUpperCase());

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setShowSymbolMenu(false)}>
        <div
          className="w-full max-w-lg rounded-t-xl p-4"
          style={{ background: '#1e222d', border: '1px solid #363a45' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-bold text-xl" style={{ color: '#d1d4dc' }}>{sym.symbol}</div>
              <div className="text-sm" style={{ color: '#787b86' }}>{sym.display_name}</div>
            </div>
            <button onClick={() => setShowSymbolMenu(false)}>
              <X size={22} color="#787b86" />
            </button>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => {
                onSelectSymbol(sym.symbol);
                setShowSymbolMenu(false);
                onOpenOrderModal();
              }}
              className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: '#2962ff' }}
            >
              <TrendingUp size={18} />
              New Order
            </button>

            <button
              onClick={() => {
                onSelectSymbol(sym.symbol);
                setShowSymbolMenu(false);
                onOpenChartTab();
              }}
              className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2"
              style={{ background: '#2a2e39', color: '#d1d4dc', border: '1px solid #363a45' }}
            >
              <BarChart2 size={18} />
              Chart
            </button>

            <button
              onClick={() => {
                onToggleSymbol(sym.symbol);
                setShowSymbolMenu(false);
              }}
              className="w-full py-3 rounded-lg font-medium"
              style={{ background: '#2a2e39', color: '#d1d4dc', border: '1px solid #363a45' }}
            >
              {inWL ? 'Remove from Watchlist' : 'Add to Watchlist'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const WatchlistMenu = () => {
    if (!showWatchlistMenu) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={() => setShowWatchlistMenu(false)}>
        <div
          className="w-full max-w-lg rounded-t-xl"
          style={{ background: '#1e222d', border: '1px solid #363a45' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#363a45' }}>
            <div className="font-bold text-lg" style={{ color: '#d1d4dc' }}>Watchlists</div>
            <button onClick={() => setShowWatchlistMenu(false)}>
              <X size={22} color="#787b86" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {watchlists.map((wl) => (
              <button
                key={wl.id}
                className="w-full p-4 text-left border-b hover:bg-white/5"
                style={{
                  borderColor: '#363a45',
                  background: wl.id === activeWatchlistId ? '#2962ff20' : 'transparent',
                  color: '#d1d4dc',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchWatchlist(wl.id);
                  setShowWatchlistMenu(false);
                }}
              >
                {wl.name}
              </button>
            ))}
          </div>

          <div className="p-4 border-t" style={{ borderColor: '#363a45' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowWatchlistMenu(false);
                onCreateWatchlist();
              }}
              className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: '#2962ff' }}
            >
              <FolderPlus size={18} />
              Create Watchlist
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
      <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowWatchlistMenu(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: '#2a2e39', border: '1px solid #363a45' }}
          >
            <Star size={16} color="#f5c542" />
            <span className="font-medium" style={{ color: '#d1d4dc' }}>
              {currentWatchlistName || 'Select Watchlist'}
            </span>
            <ChevronDown size={16} color="#787b86" />
          </button>

          <button
            onClick={onCreateWatchlist}
            className="p-2 rounded-lg"
            style={{ background: '#2962ff' }}
            title="Create Watchlist"
          >
            <Plus size={18} color="#fff" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-2">
          {SYMBOL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
              style={{
                background: selectedCategory === cat.id ? '#2962ff' : '#2a2e39',
                color: selectedCategory === cat.id ? '#fff' : '#787b86',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative mt-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#787b86' }} />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbols..."
            className="w-full pl-10 pr-10 py-2.5 rounded border text-base"
            style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
            autoComplete="off"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X size={16} color="#787b86" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredSymbols.length === 0 ? (
          <div className="p-6 text-center text-base" style={{ color: '#787b86' }}>
            {search ? 'No symbols found' : 'Watchlist is empty'}
          </div>
        ) : (
          filteredSymbols.map((sym) => {
            const isSelected = selectedSymbol === sym.symbol;
            const inWL = activeSymbols.includes(String(sym.symbol).toUpperCase());
            const bid = Number(sym.bid || sym.last_price || 0);
            const ask = Number(sym.ask || sym.last_price || 0);

            return (
              <div
                key={sym.symbol}
                onClick={() => {
                  onSelectSymbol(sym.symbol);
                  openSymbolMenu(sym);
                }}
                className="grid grid-cols-3 items-center px-3 py-3 border-b cursor-pointer hover:bg-white/5"
                style={{
                  background: isSelected ? '#2a2e39' : 'transparent',
                  borderColor: '#363a45',
                  borderLeft: isSelected ? '3px solid #2962ff' : '3px solid transparent',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Star size={14} color={inWL ? '#f5c542' : '#787b86'} fill={inWL ? '#f5c542' : 'none'} />
                  <div className="min-w-0">
                    <div className="font-semibold text-base truncate" style={{ color: '#d1d4dc' }}>{sym.symbol}</div>
                    <div className="text-xs truncate" style={{ color: '#787b86' }}>{sym.display_name}</div>
                  </div>
                </div>

                <div className="text-right font-mono" style={{ color: '#ef5350' }}>{bid.toFixed(2)}</div>
                <div className="text-right font-mono" style={{ color: '#26a69a' }}>{ask.toFixed(2)}</div>
              </div>
            );
          })
        )}
      </div>

      <SymbolActionMenu />
      <WatchlistMenu />
    </div>
  );
}