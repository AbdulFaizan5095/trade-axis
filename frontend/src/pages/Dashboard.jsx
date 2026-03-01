// frontend/src/pages/Dashboard.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';

import useAuthStore from '../store/authStore';
import useTradingStore from '../store/tradingStore';
import useMarketStore from '../store/marketStore';
import useWatchlistStore from '../store/watchlistStore';
import AdminPanelPage from '../pages/AdminPanel';
import AdminWithdrawals from '../components/admin/AdminWithdrawals';

import socketService from '../services/socket';
import api from '../services/api';

import {
  Search,
  TrendingUp,
  TrendingDown,
  BarChart2,
  List,
  Clock,
  Star,
  Plus,
  Wallet as WalletIcon,
  ChevronDown,
  ChevronUp,
  Settings,
  LogOut,
  RefreshCw,
  Trash2,
  Edit3,
  X,
  Crosshair,
  Maximize2,
  Minimize2,
  MessageSquare,
  Bell,
  Info,
  User,
  Eye,
  EyeOff,
  UserPlus,
  Users,
  ArrowRightLeft,
  DollarSign,
  Percent,
  AlertTriangle,
} from 'lucide-react';

import PriceChart from '../components/charts/PriceChart';
import WalletPage from '../components/account/Wallet';
import AdminUsers from '../components/admin/AdminUsers';
import AdminPanel from '../components/admin/AdminPanel';

// Desktop components
import DesktopTerminal from '../components/mt5/DesktopTerminal';
import MarketWatchPanel from '../components/mt5/MarketWatchPanel';
import NavigatorPanel from '../components/mt5/NavigatorPanel';
import ChartWorkspace from '../components/mt5/ChartWorkspace';
import OrderDockPanel from '../components/mt5/OrderDockPanel';
import ToolboxPanel from '../components/mt5/ToolboxPanel';

// ============ CONSTANTS ============
const TIMEFRAMES = [
  { id: 'M1', label: 'M1', value: '1m' },
  { id: 'M5', label: 'M5', value: '5m' },
  { id: 'M15', label: 'M15', value: '15m' },
  { id: 'M30', label: 'M30', value: '30m' },
  { id: 'H1', label: 'H1', value: '1h' },
  { id: 'H4', label: 'H4', value: '4h' },
  { id: 'D1', label: 'D1', value: '1d' },
  { id: 'W1', label: 'W1', value: '1w' },
  { id: 'MN', label: 'MN', value: '1M' },
];

const CHART_TYPES = [
  { id: 'candles', label: 'Candles' },
  { id: 'bars', label: 'Bars' },
  { id: 'line', label: 'Line' },
];

const SYMBOL_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'index_futures', label: 'Index Futures' },
  { id: 'stock_futures', label: 'Stock Futures' },
  { id: 'commodity_futures', label: 'Commodities' },
];

const HISTORY_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last Week' },
  { id: 'month', label: 'Last Month' },
  { id: '3months', label: 'Last 3 Months' }, // ✅ Max 3 months
];

// ============ CATEGORY HELPERS ============
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

  if (looksLikeIndex) return 'indices';

  const looksLikeEtf =
    c === 'etf' || seg === 'etf' || inst === 'etf' || name.includes('etf');
  if (looksLikeEtf) return 'etf';

  const looksLikeFno =
    c.includes('future') ||
    c.includes('option') ||
    c === 'fno' ||
    seg.includes('f&o') ||
    seg.includes('derivative') ||
    /FUT$/.test(s) ||
    /(CE|PE)$/.test(s);

  if (looksLikeFno) return 'fno';

  return 'equity';
};

const matchesSelectedCategory = (sym, selectedCategory) => {
  if (selectedCategory === 'all') return true;
  return inferIndianCategory(sym) === selectedCategory;
};

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
    case '6months':
      d.setMonth(d.getMonth() - 6);
      return d;
    case 'year':
      d.setFullYear(d.getFullYear() - 1);
      return d;
    default:
      return null;
  }
};

// ✅ Format currency
const formatINR = (amount) => {
  const num = Number(amount || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const Dashboard = () => {
  const { 
    user, 
    accounts, 
    logout, 
    savedAccounts, 
    addAccount, 
    switchToAccount, 
    removeSavedAccount,
    getMaxSavedAccounts 
  } = useAuthStore();
  
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const {
    openTrades,
    pendingOrders,
    tradeHistory,
    deals,
    dealsSummary,
    fetchOpenTrades,
    fetchPendingOrders,
    fetchTradeHistory,
    fetchDeals,
    placeOrder,
    closeTrade,
    modifyTrade,
    cancelOrder,
    updateTradePnL,
    updateTradesPnLBatch,
  } = useTradingStore();

  const { symbols, fetchSymbols, updatePrice } = useMarketStore();

  const {
    watchlists,
    activeWatchlistId,
    activeSymbols,
    setActiveWatchlistId,
    fetchWatchlists,
    createWatchlist,
    fetchWatchlistSymbols,
    addSymbol,
    removeSymbol,
    deleteWatchlist,
    renameWatchlist,
  } = useWatchlistStore();

  // Core
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE');
  const [symbolData, setSymbolData] = useState(null);

  // Mobile tabs
  const [activeTab, setActiveTab] = useState('trade');

  // Wallet intent
  const [walletIntent, setWalletIntent] = useState('deposit');

  // Quotes
  const [quotesViewMode, setQuotesViewMode] = useState('advanced');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Watchlist dropdown
  const [isWatchlistDropdownOpen, setIsWatchlistDropdownOpen] = useState(false);
  const [editingWatchlistId, setEditingWatchlistId] = useState(null);
  const [editingWatchlistName, setEditingWatchlistName] = useState('');
  const watchlistDropdownRef = useRef(null);

  // Chart
  const [chartMode, setChartMode] = useState('candles');
  const [timeframe, setTimeframe] = useState('15m');
  const [crosshairEnabled, setCrosshairEnabled] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);

  // Trade
  const [orderType, setOrderType] = useState('market');
  const [quantity, setQuantity] = useState(1);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [tradeTabSection, setTradeTabSection] = useState('positions');
  const [modifyModal, setModifyModal] = useState(null);
  
  // ✅ NEW: Expanded position for showing Modify/Close buttons
  const [expandedTradeId, setExpandedTradeId] = useState(null);

  const [closeConfirmTrade, setCloseConfirmTrade] = useState(null);
  const [partialCloseQty, setPartialCloseQty] = useState('');

  // History
  const [historyPeriod, setHistoryPeriod] = useState('month');
  const [historyViewMode, setHistoryViewMode] = useState('positions');
  const [historyFilter, setHistoryFilter] = useState('all');

  // Messages
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageCategory, setMessageCategory] = useState('all');

  // ✅ NEW: Add Account Modal
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addAccountEmail, setAddAccountEmail] = useState('');
  const [addAccountPassword, setAddAccountPassword] = useState('');
  const [addAccountLoading, setAddAccountLoading] = useState(false);

  
  // Socket init
  const socketInitializedRef = useRef(false);
  const closingMode = user?.closingMode || false;

  // ---------- Account init ----------
  useEffect(() => {
    if (accounts?.length) {
      const demo = accounts.find((a) => a.is_demo);
      setSelectedAccount(demo || accounts[0]);
    }
    fetchSymbols();
  }, [accounts, fetchSymbols]);

  // Load trades when account changes
  useEffect(() => {
    if (!selectedAccount?.id) return;
    fetchOpenTrades(selectedAccount.id);
    fetchPendingOrders?.(selectedAccount.id);
    fetchTradeHistory(selectedAccount.id);
  }, [selectedAccount, fetchOpenTrades, fetchPendingOrders, fetchTradeHistory]);

  // ✅ Load deals when history tab is active and deals view selected
  useEffect(() => {
    if (activeTab === 'history' && historyViewMode === 'deals' && selectedAccount?.id) {
      fetchDeals(selectedAccount.id, historyPeriod);
    }
  }, [activeTab, historyViewMode, historyPeriod, selectedAccount, fetchDeals]);

  // Watchlists init
  useEffect(() => {
    const initWatchlists = async () => {
      try {
        const list = await fetchWatchlists();

        if (!list.length) {
          const created = await createWatchlist('Default', true);
          setActiveWatchlistId(created.id);
          await fetchWatchlistSymbols(created.id);
          return;
        }

        let activeId = activeWatchlistId;
        if (!activeId || !list.some((w) => w.id === activeId)) {
          const def = list.find((w) => w.is_default) || list[0];
          activeId = def.id;
          setActiveWatchlistId(activeId);
        }

        await fetchWatchlistSymbols(activeId);
      } catch (e) {
        console.error(e);
        toast.error('Failed to initialize watchlists');
      }
    };

    initWatchlists();
  }, []);

  // Quote poll
  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const res = await api.get(`/market/quote/${selectedSymbol}`);
        setSymbolData(res.data?.data || null);
      } catch (err) {
        console.error(err);
      }
    };

    if (selectedSymbol) fetchQuote();
    const t = setInterval(fetchQuote, 2000);
    return () => clearInterval(t);
  }, [selectedSymbol]);

  // ✅ Socket: price updates + P&L updates + message feed
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!socketInitializedRef.current) {
      socketInitializedRef.current = true;
      socketService.connect(token);
    }

    const pushMessage = (m) => {
      setMessages((prev) => [m, ...prev].slice(0, 200));
      setUnreadCount((c) => c + 1);
    };

    const onPrice = (data) => updatePrice(data);

    const onConnected = (payload) => {
      pushMessage({
        id: `connected-${Date.now()}`,
        type: 'system',
        title: 'Connected',
        message: payload?.message || 'Connected to server',
        time: new Date().toISOString(),
        read: false,
      });
    };

    // ✅ Handle individual trade P&L update
    const onTradePnl = (payload) => {
      if (payload?.tradeId && payload?.profit !== undefined) {
        updateTradePnL(payload.tradeId, payload.currentPrice, payload.profit);
      }
    };

    // ✅ Handle batch P&L updates
    const onTradesPnlBatch = (payload) => {
      if (payload?.trades && Array.isArray(payload.trades)) {
        updateTradesPnLBatch(payload.trades);
      }
    };

    // ✅ Handle account updates
    const onAccountUpdate = (payload) => {
      if (payload?.accountId && selectedAccount?.id === payload.accountId) {
        setSelectedAccount(prev => ({
          ...prev,
          balance: payload.balance,
          equity: payload.equity,
          profit: payload.profit,
          free_margin: payload.freeMargin,
          margin: payload.margin,
        }));
      }
    };

    socketService.subscribe('price:update', onPrice);
    socketService.subscribe('connected', onConnected);
    socketService.subscribe('trade:pnl', onTradePnl);
    socketService.subscribe('trades:pnl:batch', onTradesPnlBatch);
    socketService.subscribe('account:update', onAccountUpdate);

    if (activeSymbols?.length) socketService.subscribeSymbols(activeSymbols);
    if (selectedAccount?.id) socketService.subscribeAccount(selectedAccount.id);

    return () => {
      socketService.unsubscribe('price:update');
      socketService.unsubscribe('connected');
      socketService.unsubscribe('trade:pnl');
      socketService.unsubscribe('trades:pnl:batch');
      socketService.unsubscribe('account:update');
    };
  }, [updatePrice, activeSymbols, selectedAccount, updateTradePnL, updateTradesPnLBatch]);

  useEffect(() => {
    return () => {
      socketInitializedRef.current = false;
      socketService.disconnect();
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onDocDown = (event) => {
      if (watchlistDropdownRef.current && !watchlistDropdownRef.current.contains(event.target)) {
        setIsWatchlistDropdownOpen(false);
        setEditingWatchlistId(null);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  // ---------- Computed ----------
  const bid = Number(symbolData?.bid || 0);
  const ask = Number(symbolData?.ask || 0);
  const totalPnL = (openTrades || []).reduce((sum, t) => sum + Number(t.profit || 0), 0);

  // ✅ Enhanced account stats with margin calculations
  const accountStats = useMemo(() => {
    const balance = Number(selectedAccount?.balance || 0);
    const margin = Number(selectedAccount?.margin || 0);
    const equity = balance + totalPnL;
    const freeMargin = Math.max(0, equity - margin);
    const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;
    const leverage = selectedAccount?.leverage || 5;
    
    return { 
      balance, 
      equity, 
      margin, 
      freeMargin, 
      marginLevel,
      leverage,
      totalPnL 
    };
  }, [selectedAccount, totalPnL]);

  const currentWatchlist = watchlists.find((w) => w.id === activeWatchlistId);

  const filteredSymbols = useMemo(() => {
    let list = symbols || [];
    list = list.filter((s) => matchesSelectedCategory(s, selectedCategory));

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      return list.filter((s) => {
        const sym = String(s.symbol || '').toLowerCase();
        const dn = String(s.display_name || '').toLowerCase();
        return sym.includes(term) || dn.includes(term);
      });
    }

    const wl = new Set((activeSymbols || []).map((x) => String(x).toUpperCase()));
    return list.filter((s) => wl.has(String(s.symbol).toUpperCase()));
  }, [symbols, searchTerm, selectedCategory, activeSymbols]);

  const filteredHistoryTrades = useMemo(() => {
    const start = getPeriodStart(historyPeriod);
    let list = tradeHistory || [];

    if (start) {
      list = list.filter((t) => {
        const ct = t.close_time || t.closeTime;
        if (!ct) return false;
        return new Date(ct) >= start;
      });
    }

    if (historyFilter === 'profit') list = list.filter((t) => Number(t.profit || 0) > 0);
    if (historyFilter === 'loss') list = list.filter((t) => Number(t.profit || 0) < 0);

    return list;
  }, [tradeHistory, historyPeriod, historyFilter]);

  const filteredMessages = useMemo(() => {
    if (messageCategory === 'all') return messages;
    return messages.filter((m) => m.type === messageCategory);
  }, [messages, messageCategory]);

  // ---------- Actions ----------
  const switchToDemo = () => {
    const demo = accounts?.find((a) => a.is_demo);
    if (demo) setSelectedAccount(demo);
    else toast.error('No demo account found');
  };

  const switchToLive = () => {
    const live = accounts?.find((a) => !a.is_demo);
    if (live) setSelectedAccount(live);
    else toast.error('No live account found');
  };

  const handleCreateWatchlist = async (e) => {
    e?.stopPropagation();
    const name = window.prompt('New watchlist name?');
    if (!name) return;
    try {
      const created = await createWatchlist(name.trim(), false);
      setActiveWatchlistId(created.id);
      await fetchWatchlistSymbols(created.id);
      toast.success('Watchlist created');
      setIsWatchlistDropdownOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create watchlist');
    }
  };

  const handleSwitchWatchlist = async (id, e) => {
    e?.stopPropagation();
    setActiveWatchlistId(id);
    await fetchWatchlistSymbols(id);
    setIsWatchlistDropdownOpen(false);
  };

  const startRename = (wl, e) => {
    e?.stopPropagation();
    setEditingWatchlistId(wl.id);
    setEditingWatchlistName(wl.name);
  };

  const submitRename = async (wlId) => {
    if (!editingWatchlistName.trim()) {
      setEditingWatchlistId(null);
      return;
    }
    const res = await renameWatchlist(wlId, editingWatchlistName.trim());
    if (res?.success === false) toast.error(res.message || 'Rename failed');
    else toast.success('Renamed');
    setEditingWatchlistId(null);
  };

  const handleDeleteWatchlist = async (wlId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this watchlist?')) return;
    const res = await deleteWatchlist(wlId);
    if (res?.success === false) toast.error(res.message || 'Delete failed');
    else toast.success('Deleted');
  };

  const toggleSymbolInWatchlist = async (sym) => {
    if (!activeWatchlistId) return toast.error('No active watchlist');
    const s = String(sym).toUpperCase();
    const exists = (activeSymbols || []).includes(s);
    const res = exists
      ? await removeSymbol(activeWatchlistId, s)
      : await addSymbol(activeWatchlistId, s);

    if (res?.success === false) toast.error(res.message || 'Failed');
  };

  const placeOrderWithQty = async (type, qty) => {
    if (!selectedAccount?.id || !selectedSymbol) return;

    const result = await placeOrder({
      accountId: selectedAccount.id,
      symbol: selectedSymbol,
      type,
      orderType: 'market',
      quantity: Number(qty || 1),
      stopLoss: stopLoss ? Number(stopLoss) : 0,
      takeProfit: takeProfit ? Number(takeProfit) : 0,
      price: entryPrice ? Number(entryPrice) : 0,
    });

    if (result.success) {
      toast.success(`${type.toUpperCase()} ${qty} ${selectedSymbol}`);
      fetchOpenTrades(selectedAccount.id);
      fetchPendingOrders?.(selectedAccount.id);
      setShowOrderModal(false);
    } else {
      toast.error(result.message || 'Order failed');
    }
  };

  const handleCloseTrade = async (tradeId) => {
    const result = await closeTrade(tradeId, selectedAccount?.id);
    if (result.success) {
      toast.success('Position closed');
      setExpandedTradeId(null);
    } else {
      toast.error(result.message || 'Close failed');
    }
  };

  const handleModifyTrade = async (tradeId, newSL, newTP) => {
    const result = await modifyTrade?.(tradeId, { stopLoss: newSL, takeProfit: newTP });
    if (result?.success) {
      toast.success('Modified');
      setModifyModal(null);
      fetchOpenTrades(selectedAccount.id);
    } else {
      toast.error(result?.message || 'Modify failed');
    }
  };

  const markAllRead = () => {
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
    setUnreadCount(0);
  };

  // ✅ NEW: Handle Add Account
  const handleAddAccount = async () => {
    if (!addAccountEmail || !addAccountPassword) {
      return toast.error('Email and password required');
    }

    setAddAccountLoading(true);
    const result = await addAccount(addAccountEmail, addAccountPassword);
    setAddAccountLoading(false);

    if (result.success) {
      toast.success('Account added successfully');
      setShowAddAccountModal(false);
      setAddAccountEmail('');
      setAddAccountPassword('');
    } else {
      toast.error(result.message);
    }
  };

  // ✅ NEW: Handle Switch to Saved Account
  const handleSwitchToSavedAccount = async (savedAcc) => {
    const loadingToast = toast.loading('Switching account...');
    const result = await switchToAccount(savedAcc);
    toast.dismiss(loadingToast);

    if (result.success) {
      toast.success(`Switched to ${savedAcc.email}`);
    } else {
      if (result.requiresLogin) {
        toast.error('Session expired. Please login again.');
        // Remove the expired account
        removeSavedAccount(savedAcc.email);
      } else {
        toast.error(result.message);
      }
    }
  };

  // ✅ NEW: Handle Remove Saved Account
  const handleRemoveSavedAccount = (email) => {
    if (user?.email === email) {
      return toast.error('Cannot remove currently active account');
    }
    
    if (!window.confirm(`Remove ${email} from saved accounts?`)) return;
    
    const result = removeSavedAccount(email);
    if (result.success) {
      toast.success('Account removed');
    } else {
      toast.error(result.message);
    }
  };

  // ============ MOBILE NAV ============
  const MobileNav = () => {
    const tabs = [
      { id: 'quotes', icon: List, label: 'Quotes' },
      { id: 'chart', icon: BarChart2, label: 'Chart' },
      { id: 'trade', icon: TrendingUp, label: 'Trade' },
      { id: 'history', icon: Clock, label: 'History' },
      { id: 'messages', icon: MessageSquare, label: 'Messages', badge: unreadCount },
      { id: 'wallet', icon: WalletIcon, label: 'Wallet' },
      { id: 'settings', icon: Settings, label: 'Settings' },
    ];

    if (isAdmin) {
      tabs.splice(6, 0, { id: 'admin', icon: User, label: 'Admin' });
    }

    return (
      <div
        className="fixed bottom-0 left-0 right-0 h-16 flex items-center justify-around border-t z-50 lg:hidden"
        style={{ background: '#1e222d', borderColor: '#363a45' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex flex-col items-center justify-center flex-1 h-full relative"
            style={{ color: activeTab === tab.id ? '#2962ff' : '#787b86' }}
          >
            <tab.icon size={22} />
            <span className="text-[11px] mt-1 font-medium">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="absolute top-2 right-1/4 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  };

  // ============ QUOTES TAB ============
  const QuotesTab = () => {
    // ✅ NEW: State for symbol action menu
    const [selectedSymbolForAction, setSelectedSymbolForAction] = useState(null);
    const [showSymbolActionMenu, setShowSymbolActionMenu] = useState(false);

    // ✅ Handle single tap on symbol
    const handleSymbolTap = (sym) => {
      setSelectedSymbolForAction(sym);
      setShowSymbolActionMenu(true);
    };

    // ✅ Symbol Action Menu Modal
    const SymbolActionMenu = () => {
      if (!showSymbolActionMenu || !selectedSymbolForAction) return null;
      
      const sym = selectedSymbolForAction;
      const symBid = Number(sym.bid || sym.last_price || 0);
      const symAsk = Number(sym.ask || sym.last_price || 0);

      return (
        <div 
          className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
          onClick={() => setShowSymbolActionMenu(false)}
        >
          <div 
            className="w-full max-w-lg rounded-t-xl p-4"
            style={{ background: '#1e222d', border: '1px solid #363a45' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Symbol Info */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold text-xl" style={{ color: '#d1d4dc' }}>{sym.symbol}</div>
                <div className="text-sm" style={{ color: '#787b86' }}>{sym.display_name}</div>
              </div>
              <button onClick={() => setShowSymbolActionMenu(false)}>
                <X size={24} color="#787b86" />
              </button>
            </div>

            {/* Price display */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg text-center" style={{ background: '#ef535020' }}>
                <div className="text-xs" style={{ color: '#787b86' }}>Bid</div>
                <div className="font-bold text-lg" style={{ color: '#ef5350' }}>₹{symBid.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-lg text-center" style={{ background: '#26a69a20' }}>
                <div className="text-xs" style={{ color: '#787b86' }}>Ask</div>
                <div className="font-bold text-lg" style={{ color: '#26a69a' }}>₹{symAsk.toFixed(2)}</div>
              </div>
            </div>

            {/* ✅ Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  setSelectedSymbol(sym.symbol);
                  setShowSymbolActionMenu(false);
                  setShowOrderModal(true);
                }}
                className="w-full py-3.5 rounded-lg font-semibold text-white text-base flex items-center justify-center gap-2"
                style={{ background: '#2962ff' }}
              >
                <TrendingUp size={20} />
                New Order
              </button>

              <button
                onClick={() => {
                  setSelectedSymbol(sym.symbol);
                  setShowSymbolActionMenu(false);
                  setActiveTab('chart');
                }}
                className="w-full py-3.5 rounded-lg font-medium text-base flex items-center justify-center gap-2"
                style={{ background: '#2a2e39', color: '#d1d4dc', border: '1px solid #363a45' }}
              >
                <BarChart2 size={20} />
                Chart
              </button>

              <button
                onClick={() => {
                  toggleSymbolInWatchlist(sym.symbol);
                  setShowSymbolActionMenu(false);
                }}
                className="w-full py-3.5 rounded-lg font-medium text-base flex items-center justify-center gap-2"
                style={{ background: '#2a2e39', color: '#d1d4dc', border: '1px solid #363a45' }}
              >
                <Star size={20} color={(activeSymbols || []).includes(sym.symbol.toUpperCase()) ? '#f5c542' : '#787b86'} />
                {(activeSymbols || []).includes(sym.symbol.toUpperCase()) ? 'Remove from Watchlist' : 'Add to Watchlist'}
              </button>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
        <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
          {/* Watchlist dropdown - keep existing */}
          {/* ... */}

          {/* ✅ Updated Category tabs for Futures only */}
          <div className="flex gap-1 overflow-x-auto pb-2 mt-3">
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

          {/* Search */}
          <div className="relative mt-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#787b86' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search futures..."
              className="w-full pl-10 pr-10 py-2.5 rounded border text-base"
              style={{ background: '#2a2e39', borderColor: '#363a45', color: '#d1d4dc' }}
            />
          </div>
        </div>

        {/* ✅ Updated Column headers - no commission */}
        <div
          className={`grid px-3 py-2.5 text-xs font-semibold border-b ${
            quotesViewMode === 'advanced' ? 'grid-cols-5' : 'grid-cols-3'
          }`}
          style={{ background: '#252832', borderColor: '#363a45', color: '#787b86' }}
        >
          <div>Symbol</div>
          <div className="text-right">Bid</div>
          <div className="text-right">Ask</div>
          {quotesViewMode === 'advanced' && (
            <>
              <div className="text-right">L/H</div>
              <div className="text-right">Chg%</div>
            </>
          )}
        </div>

        {/* List - with single tap action */}
        <div className="flex-1 overflow-y-auto">
          {filteredSymbols.length === 0 ? (
            <div className="p-6 text-center text-base" style={{ color: '#787b86' }}>
              {searchTerm ? 'No symbols found' : 'Watchlist is empty'}
            </div>
          ) : (
            filteredSymbols.map((sym) => {
              const isSelected = selectedSymbol === sym.symbol;
              const inWL = (activeSymbols || []).includes(String(sym.symbol).toUpperCase());
              const change = Number(sym.change_percent || 0);
              const symBid = Number(sym.bid || sym.last_price || 0);
              const symAsk = Number(sym.ask || sym.last_price || 0);
              const symLow = Number(sym.low || 0);
              const symHigh = Number(sym.high || 0);

              return (
                <div
                  key={sym.symbol}
                  onClick={() => handleSymbolTap(sym)} // ✅ Single tap shows action menu
                  className={`grid items-center px-3 py-3.5 border-b cursor-pointer hover:bg-white/5 ${
                    quotesViewMode === 'advanced' ? 'grid-cols-5' : 'grid-cols-3'
                  }`}
                  style={{
                    background: isSelected ? '#2a2e39' : 'transparent',
                    borderColor: '#363a45',
                    borderLeft: isSelected ? '3px solid #2962ff' : '3px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Star 
                      size={14} 
                      color={inWL ? '#f5c542' : '#787b86'} 
                      fill={inWL ? '#f5c542' : 'none'} 
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-base truncate" style={{ color: '#d1d4dc' }}>
                        {sym.symbol}
                      </div>
                      {quotesViewMode === 'advanced' && (
                        <div className="text-xs truncate" style={{ color: '#787b86' }}>
                          {sym.display_name}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-base font-mono" style={{ color: '#ef5350' }}>
                    {symBid.toFixed(2)}
                  </div>
                  <div className="text-right text-base font-mono" style={{ color: '#26a69a' }}>
                    {symAsk.toFixed(2)}
                  </div>

                  {quotesViewMode === 'advanced' && (
                    <>
                      <div className="text-right text-xs" style={{ color: '#787b86' }}>
                        <div>{symLow.toFixed(2)}</div>
                        <div>{symHigh.toFixed(2)}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold" style={{ color: change >= 0 ? '#26a69a' : '#ef5350' }}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ✅ Symbol Action Menu */}
        <SymbolActionMenu />
      </div>
    );
  };
  // ============ CHART TAB ============
  const ChartTab = () => {
    const chartHeight = chartFullscreen ? window.innerHeight - 140 : 420;

    return (
      <div className={`flex flex-col h-full ${chartFullscreen ? 'fixed inset-0 z-50' : ''}`} style={{ background: '#131722' }}>
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: '#363a45', background: '#1e222d' }}>
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg" style={{ color: '#d1d4dc' }}>{selectedSymbol}</span>
            <span className="text-base" style={{ color: '#787b86' }}>
              {bid ? `Bid ${bid.toFixed(2)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCrosshairEnabled((v) => !v)}
              className="p-2 rounded"
              style={{ background: crosshairEnabled ? '#2962ff' : 'transparent' }}
              title="Crosshair"
            >
              <Crosshair size={18} color={crosshairEnabled ? '#fff' : '#787b86'} />
            </button>
            <button onClick={() => setChartFullscreen((v) => !v)} className="p-2 rounded" title="Fullscreen">
              {chartFullscreen ? <Minimize2 size={18} color="#787b86" /> : <Maximize2 size={18} color="#787b86" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 p-2 overflow-x-auto border-b" style={{ borderColor: '#363a45', background: '#1e222d' }}>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.value)}
              className="px-3 py-1.5 rounded text-sm font-medium"
              style={{
                background: timeframe === tf.value ? '#2962ff' : 'transparent',
                color: timeframe === tf.value ? '#fff' : '#787b86',
              }}
            >
              {tf.label}
            </button>
          ))}

          <div className="h-4 w-px mx-2" style={{ background: '#363a45' }} />

          {CHART_TYPES.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setChartMode(ct.id)}
              className="px-3 py-1.5 rounded text-sm font-medium"
              style={{
                background: chartMode === ct.id ? '#2962ff' : 'transparent',
                color: chartMode === ct.id ? '#fff' : '#787b86',
              }}
            >
              {ct.label}
            </button>
          ))}
        </div>

        <div className="flex-1 relative">
          <PriceChart
            symbol={selectedSymbol}
            timeframe={timeframe}
            mode={chartMode}
            height={chartHeight}
            crosshairEnabled={crosshairEnabled}
          />

          {/* One click trading panel */}
          <div
            className="absolute left-4 right-4 rounded-lg p-4"
            style={{ bottom: chartFullscreen ? 12 : 70, background: 'rgba(30, 34, 45, 0.95)', border: '1px solid #363a45' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium" style={{ color: '#787b86' }}>Quantity</span>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))}
                className="w-24 px-3 py-1.5 rounded text-base text-center font-medium"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                min="1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => placeOrderWithQty('sell', quantity)}
                className="py-3.5 rounded-lg font-bold text-white text-lg"
                style={{ background: '#ef5350' }}
              >
                SELL {bid.toFixed(2)}
              </button>
              <button
                onClick={() => placeOrderWithQty('buy', quantity)}
                className="py-3.5 rounded-lg font-bold text-white text-lg"
                style={{ background: '#26a69a' }}
              >
                BUY {ask.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ✅ Order Modal
  const OrderModal = () => (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end lg:items-center justify-center">
      <div
        className="w-full lg:max-w-md lg:rounded-xl rounded-t-xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ background: '#1e222d', border: '1px solid #363a45' }}
      >
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: '#363a45' }}>
          <h3 className="font-bold text-xl" style={{ color: '#d1d4dc' }}>New Order</h3>
          <button onClick={() => setShowOrderModal(false)}>
            <X size={24} color="#787b86" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-28">
          <div className="mb-4">
            <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Symbol</label>
            <div className="flex items-center justify-between p-4 rounded-lg" style={{ background: '#2a2e39' }}>
              <span className="font-bold text-lg" style={{ color: '#d1d4dc' }}>{selectedSymbol}</span>
              <div className="text-right">
                <div className="text-base font-medium" style={{ color: '#ef5350' }}>Bid: {bid.toFixed(2)}</div>
                <div className="text-base font-medium" style={{ color: '#26a69a' }}>Ask: {ask.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Order Type</label>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
              className="w-full px-4 py-3 rounded-lg text-base"
              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
            >
              <option value="market">Market</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))}
              className="w-full px-4 py-3 rounded-lg text-xl font-bold text-center"
              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              min="1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Stop Loss</label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-base"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Take Profit</label>
              <input
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-base"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div
          className="sticky bottom-0 p-4 border-t shrink-0"
          style={{ borderColor: '#363a45', background: '#1e222d' }}
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => placeOrderWithQty('sell', quantity)}
              className="py-4 rounded-lg font-bold text-white text-xl"
              style={{ background: '#ef5350' }}
            >
              SELL
            </button>
            <button
              onClick={() => placeOrderWithQty('buy', quantity)}
              className="py-4 rounded-lg font-bold text-white text-xl"
              style={{ background: '#26a69a' }}
            >
              BUY
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ============ MODIFY POSITION MODAL ============
  const ModifyPositionModal = ({ trade }) => {
    const [newSL, setNewSL] = useState(trade.stop_loss || '');
    const [newTP, setNewTP] = useState(trade.take_profit || '');

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl" style={{ background: '#1e222d', border: '1px solid #363a45' }}>
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#363a45' }}>
            <h3 className="font-bold text-lg" style={{ color: '#d1d4dc' }}>Modify Position</h3>
            <button onClick={() => setModifyModal(null)}>
              <X size={22} color="#787b86" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
              <div className="text-sm" style={{ color: '#787b86' }}>Symbol</div>
              <div className="font-bold text-lg" style={{ color: '#d1d4dc' }}>{trade.symbol}</div>
              <div className="text-sm mt-1" style={{ color: trade.trade_type === 'buy' ? '#26a69a' : '#ef5350' }}>
                {trade.trade_type?.toUpperCase()} • Qty: {trade.quantity}
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Stop Loss</label>
              <input
                type="number"
                value={newSL}
                onChange={(e) => setNewSL(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-base"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Take Profit</label>
              <input
                type="number"
                value={newTP}
                onChange={(e) => setNewTP(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-base"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                placeholder="0.00"
              />
            </div>

            <button
              onClick={() => handleModifyTrade(trade.id, newSL, newTP)}
              className="w-full py-3.5 rounded-lg font-semibold text-base"
              style={{ background: '#2962ff', color: '#fff' }}
            >
              Modify Position
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============ CLOSE CONFIRM MODAL (NEW) ============
  const CloseConfirmModal = () => {
    if (!closeConfirmTrade) return null;
    
    const trade = closeConfirmTrade;
    const totalQty = Number(trade.quantity);
    const pnl = Number(trade.profit || 0);
    const isPartial = partialCloseQty && Number(partialCloseQty) < totalQty;

    const handleClose = async () => {
      const qtyToClose = isPartial ? Number(partialCloseQty) : totalQty;
      
      const result = await closeTrade(trade.id, selectedAccount?.id, qtyToClose);
      if (result.success) {
        toast.success(isPartial 
          ? `Closed ${qtyToClose} of ${totalQty}` 
          : 'Position closed'
        );
        setCloseConfirmTrade(null);
        setPartialCloseQty('');
        setExpandedTradeId(null);
      } else {
        toast.error(result.message || 'Close failed');
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-xl" style={{ background: '#1e222d', border: '1px solid #363a45' }}>
          <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#363a45' }}>
            <h3 className="font-bold text-lg" style={{ color: '#d1d4dc' }}>Close Position</h3>
            <button onClick={() => { setCloseConfirmTrade(null); setPartialCloseQty(''); }}>
              <X size={22} color="#787b86" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Trade info */}
            <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold text-lg" style={{ color: '#d1d4dc' }}>{trade.symbol}</div>
                  <div className="text-sm" style={{ color: trade.trade_type === 'buy' ? '#26a69a' : '#ef5350' }}>
                    {trade.trade_type?.toUpperCase()} • Qty: {totalQty}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg" style={{ color: pnl >= 0 ? '#26a69a' : '#ef5350' }}>
                    {pnl >= 0 ? '+' : ''}{formatINR(pnl)}
                  </div>
                </div>
              </div>
            </div>

            {/* Close options */}
            <div className="space-y-3">
              <button
                onClick={() => { setPartialCloseQty(''); handleClose(); }}
                className="w-full py-3.5 rounded-lg font-semibold text-base"
                style={{ background: '#ef5350', color: '#fff' }}
              >
                Close Full Position ({totalQty})
              </button>

              <div className="text-center text-sm" style={{ color: '#787b86' }}>— or —</div>

              <div>
                <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Partial Close Quantity</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={partialCloseQty}
                    onChange={(e) => setPartialCloseQty(e.target.value)}
                    placeholder={`1 - ${totalQty - 1}`}
                    min="1"
                    max={totalQty - 1}
                    className="flex-1 px-4 py-3 rounded-lg text-base"
                    style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
                  />
                  <button
                    onClick={handleClose}
                    disabled={!partialCloseQty || Number(partialCloseQty) <= 0 || Number(partialCloseQty) >= totalQty}
                    className="px-6 py-3 rounded-lg font-medium disabled:opacity-50"
                    style={{ background: '#ff9800', color: '#fff' }}
                  >
                    Close Partial
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============ TRADE TAB ============
  const TradeTab = () => (
    <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
      {/* ✅ Enhanced Account Stats with Margin Display */}
      <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
        {/* Main stats */}
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
            <div className="text-xs font-medium" style={{ color: '#787b86' }}>Balance</div>
            <div className="font-bold text-base" style={{ color: '#d1d4dc' }}>{formatINR(accountStats.balance)}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
            <div className="text-xs font-medium" style={{ color: '#787b86' }}>Equity</div>
            <div className="font-bold text-base" style={{ color: '#d1d4dc' }}>{formatINR(accountStats.equity)}</div>
          </div>
          <div className="p-3 rounded-lg" style={{ background: '#2a2e39' }}>
            <div className="text-xs font-medium" style={{ color: '#787b86' }}>Floating P&L</div>
            <div className="font-bold text-base" style={{ color: totalPnL >= 0 ? '#26a69a' : '#ef5350' }}>
              {totalPnL >= 0 ? '+' : ''}{formatINR(totalPnL)}
            </div>
          </div>
        </div>

        {/* ✅ Margin stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-lg" style={{ background: '#252832' }}>
            <div className="text-[10px] font-medium" style={{ color: '#787b86' }}>Margin</div>
            <div className="font-semibold text-sm" style={{ color: '#f5c542' }}>{formatINR(accountStats.margin)}</div>
          </div>
          <div className="p-2 rounded-lg" style={{ background: '#252832' }}>
            <div className="text-[10px] font-medium" style={{ color: '#787b86' }}>Free Margin</div>
            <div className="font-semibold text-sm" style={{ color: '#26a69a' }}>{formatINR(accountStats.freeMargin)}</div>
          </div>
          <div className="p-2 rounded-lg" style={{ background: '#252832' }}>
            <div className="text-[10px] font-medium" style={{ color: '#787b86' }}>Margin Lvl</div>
            <div className="font-semibold text-sm" style={{ color: accountStats.marginLevel > 100 ? '#26a69a' : '#ef5350' }}>
              {accountStats.margin > 0 ? `${accountStats.marginLevel.toFixed(0)}%` : '∞'}
            </div>
          </div>
          <div className="p-2 rounded-lg" style={{ background: '#252832' }}>
            <div className="text-[10px] font-medium" style={{ color: '#787b86' }}>Leverage</div>
            <div className="font-semibold text-sm" style={{ color: '#2962ff' }}>1:{accountStats.leverage}</div>
          </div>
        </div>
      </div>

      <div className="flex border-b" style={{ borderColor: '#363a45' }}>
        {[
          { id: 'positions', label: `Positions (${openTrades.length})` },
          { id: 'pending', label: `Pending (${pendingOrders?.length || 0})` },
          { id: 'summary', label: 'Summary' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTradeTabSection(tab.id)}
            className="flex-1 py-3 text-sm font-medium border-b-2"
            style={{
              color: tradeTabSection === tab.id ? '#2962ff' : '#787b86',
              borderColor: tradeTabSection === tab.id ? '#2962ff' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        // Inside TradeTab, replace the positions display section:

        {tradeTabSection === 'positions' && (
          <>
            <div className="flex gap-2 p-3 border-b" style={{ borderColor: '#363a45' }}>
              {/* ✅ Closing mode warning */}
              {closingMode && (
                <div className="flex-1 p-2 rounded-lg flex items-center gap-2" style={{ background: '#ff980020' }}>
                  <Lock size={16} color="#ff9800" />
                  <span className="text-xs" style={{ color: '#ff9800' }}>
                    Closing mode active - You can only close existing positions
                  </span>
                </div>
              )}
              {!closingMode && (
                <button
                  onClick={() => setShowOrderModal(true)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ background: '#2962ff', color: '#fff' }}
                >
                  + New Order
                </button>
              )}
            </div>

            {openTrades.length === 0 ? (
              <div className="p-8 text-center" style={{ color: '#787b86' }}>
                <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
                <div className="text-base">No open positions</div>
              </div>
            ) : (
              openTrades.map((trade) => {
                const pnl = Number(trade.profit || 0);
                const isProfit = pnl >= 0;
                const isExpanded = expandedTradeId === trade.id;
                // ✅ No commission column in display

                return (
                  <div 
                    key={trade.id} 
                    className="border-b"
                    style={{ borderColor: '#363a45', background: isExpanded ? '#252832' : 'transparent' }}
                  >
                    {/* Position row - tap to expand */}
                    <div 
                      className="p-3 cursor-pointer"
                      onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{ background: trade.trade_type === 'buy' ? '#26a69a20' : '#ef535020' }}
                          >
                            {trade.trade_type === 'buy' ? (
                              <TrendingUp size={16} color="#26a69a" />
                            ) : (
                              <TrendingDown size={16} color="#ef5350" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-base" style={{ color: '#d1d4dc' }}>{trade.symbol}</div>
                            <div className="text-xs" style={{ color: '#787b86' }}>
                              {String(trade.trade_type || '').toUpperCase()} • Qty {trade.quantity}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div 
                            className="font-bold text-lg"
                            style={{ color: isProfit ? '#26a69a' : '#ef5350' }}
                          >
                            {isProfit ? '+' : ''}{formatINR(pnl)}
                          </div>
                          <div className="text-xs" style={{ color: '#787b86' }}>
                            {isExpanded ? <ChevronUp size={14} className="inline" /> : <ChevronDown size={14} className="inline" />}
                          </div>
                        </div>
                      </div>

                      {/* Price info - no commission displayed */}
                      <div className="flex justify-between text-xs mt-2" style={{ color: '#787b86' }}>
                        <span>Open: {formatINR(trade.open_price)}</span>
                        <span>Current: {formatINR(trade.current_price || trade.open_price)}</span>
                      </div>
                    </div>

                    {/* ✅ Expanded section with Close/Modify options */}
                    {isExpanded && (
                      <div 
                        className="px-3 pb-3 pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex gap-2">
                          <button
                            onClick={() => setModifyModal(trade)}
                            className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                            style={{ background: '#2a2e39', color: '#d1d4dc', border: '1px solid #363a45' }}
                          >
                            <Edit3 size={16} />
                            Modify
                          </button>
                          <button
                            onClick={() => setCloseConfirmTrade(trade)} // ✅ Show close confirmation
                            className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                            style={{ background: '#ef5350', color: '#fff' }}
                          >
                            <X size={16} />
                            Close
                          </button>
                        </div>

                        {/* SL/TP info */}
                        {(trade.stop_loss > 0 || trade.take_profit > 0) && (
                          <div className="flex gap-4 mt-2 text-xs" style={{ color: '#787b86' }}>
                            {trade.stop_loss > 0 && (
                              <span>SL: <span style={{ color: '#ef5350' }}>{formatINR(trade.stop_loss)}</span></span>
                            )}
                            {trade.take_profit > 0 && (
                              <span>TP: <span style={{ color: '#26a69a' }}>{formatINR(trade.take_profit)}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {tradeTabSection === 'pending' && (
          <div className="p-6 text-center" style={{ color: '#787b86' }}>
            {pendingOrders?.length ? (
              <div>
                {pendingOrders.map((o) => (
                  <div key={o.id} className="p-3 rounded-lg mb-2 text-left" style={{ background: '#2a2e39' }}>
                    <div className="flex justify-between">
                      <span style={{ color: '#d1d4dc', fontWeight: 700 }}>{o.symbol}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#f5c54220', color: '#f5c542' }}>
                        {o.status || 'pending'}
                      </span>
                    </div>
                    <div className="text-sm mt-1" style={{ color: '#787b86' }}>
                      {o.order_type} | Qty {o.quantity} | @ {Number(o.price || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <Clock size={48} className="mx-auto mb-3 opacity-30" />
                <div className="text-base">No pending orders</div>
              </div>
            )}
          </div>
        )}

        {tradeTabSection === 'summary' && (
          <div className="p-4 space-y-3">
            <div className="p-4 rounded-lg" style={{ background: '#2a2e39' }}>
              <div className="text-sm font-semibold mb-3" style={{ color: '#d1d4dc' }}>Account Summary</div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#787b86' }}>Balance</span>
                  <span style={{ color: '#d1d4dc' }}>{formatINR(accountStats.balance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#787b86' }}>Equity</span>
                  <span style={{ color: '#d1d4dc' }}>{formatINR(accountStats.equity)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#787b86' }}>Used Margin</span>
                  <span style={{ color: '#f5c542' }}>{formatINR(accountStats.margin)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#787b86' }}>Free Margin</span>
                  <span style={{ color: '#26a69a' }}>{formatINR(accountStats.freeMargin)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#787b86' }}>Margin Level</span>
                  <span style={{ color: accountStats.marginLevel > 100 ? '#26a69a' : '#ef5350' }}>
                    {accountStats.margin > 0 ? `${accountStats.marginLevel.toFixed(2)}%` : '∞'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#787b86' }}>Leverage</span>
                  <span style={{ color: '#2962ff' }}>1:{accountStats.leverage}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t" style={{ borderColor: '#363a45' }}>
                  <span style={{ color: '#787b86' }}>Floating P&L</span>
                  <span className="font-bold" style={{ color: totalPnL >= 0 ? '#26a69a' : '#ef5350' }}>
                    {totalPnL >= 0 ? '+' : ''}{formatINR(totalPnL)}
                  </span>
                </div>
              </div>
            </div>

            {/* Warning if margin level is low */}
            {accountStats.margin > 0 && accountStats.marginLevel < 150 && (
              <div className="p-3 rounded-lg flex items-center gap-2" style={{ background: '#ef535020', border: '1px solid #ef535050' }}>
                <AlertTriangle size={20} color="#ef5350" />
                <div className="text-sm" style={{ color: '#ef5350' }}>
                  Low margin level. Consider closing some positions.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showOrderModal && <OrderModal />}
      {modifyModal && <ModifyPositionModal trade={modifyModal} />}
      {closeConfirmTrade && <CloseConfirmModal />}
    </div>
  );

  // ============ HISTORY TAB ============
  const HistoryTab = () => {
    // ✅ Filter by symbol
    const [symbolFilter, setSymbolFilter] = useState('');
    
    // Get unique symbols from history
    const uniqueSymbols = useMemo(() => {
      const symbols = new Set(tradeHistory.map(t => t.symbol));
      return Array.from(symbols).sort();
    }, [tradeHistory]);

    // ✅ Calculate overall commission
    const overallStats = useMemo(() => {
      let filtered = filteredHistoryTrades;
      
      if (symbolFilter) {
        filtered = filtered.filter(t => t.symbol === symbolFilter);
      }
      
      const totalProfit = filtered.filter(t => Number(t.profit || 0) > 0)
        .reduce((sum, t) => sum + Number(t.profit || 0), 0);
      const totalLoss = Math.abs(filtered.filter(t => Number(t.profit || 0) < 0)
        .reduce((sum, t) => sum + Number(t.profit || 0), 0));
      const totalCommission = filtered.reduce((sum, t) => sum + Number(t.brokerage || 0), 0);
      const netPnL = totalProfit - totalLoss;
      
      return { totalProfit, totalLoss, totalCommission, netPnL, count: filtered.length };
    }, [filteredHistoryTrades, symbolFilter]);

    // Apply symbol filter
    const displayTrades = useMemo(() => {
      if (!symbolFilter) return filteredHistoryTrades;
      return filteredHistoryTrades.filter(t => t.symbol === symbolFilter);
    }, [filteredHistoryTrades, symbolFilter]);

    return (
      <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
        <div className="p-3 border-b" style={{ borderColor: '#363a45' }}>
          {/* ✅ Period filter - max 3 months */}
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

          {/* View mode tabs */}
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

          {/* ✅ Symbol filter dropdown */}
          {historyViewMode === 'positions' && (
            <div className="mt-2">
              <select
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              >
                <option value="">All Symbols</option>
                {uniqueSymbols.map(sym => (
                  <option key={sym} value={sym}>{sym}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ✅ Overall Summary - including Commission */}
        {historyViewMode === 'positions' && (
          <div className="p-3 border-b grid grid-cols-4 gap-2 text-center" style={{ borderColor: '#363a45', background: '#252832' }}>
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
            <div>
              <div className="text-xs" style={{ color: '#787b86' }}>Commission</div>
              <div className="font-bold" style={{ color: '#f5c542' }}>{formatINR(overallStats.totalCommission)}</div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* POSITIONS VIEW */}
          {historyViewMode === 'positions' && (
            <>
              {displayTrades.length === 0 ? (
                <div className="p-8 text-center" style={{ color: '#787b86' }}>
                  <Clock size={48} className="mx-auto mb-3 opacity-30" />
                  <div className="text-base">No closed positions</div>
                </div>
              ) : (
                displayTrades.map((t) => {
                  const pnl = Number(t.profit || 0);
                  // ✅ No commission column per trade
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

          {/* DEALS VIEW */}
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
                      <span className="font-bold" style={{ color: '#f5c542' }}>{formatINR(dealsSummary.totalCommission)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Deals list - keep existing implementation */}
              {/* ... */}
            </>
          )}
        </div>
      </div>
    );
  };

  // ============ MESSAGES TAB ============
  const MessagesTab = () => (
    <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
      <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-xl" style={{ color: '#d1d4dc' }}>Messages</h2>
          <button 
            className="text-sm font-medium px-3 py-1.5 rounded-lg" 
            style={{ background: '#2a2e39', color: '#2962ff' }} 
            onClick={markAllRead}
          >
            Mark All Read
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {[
            { id: 'all', label: 'All' },
            { id: 'system', label: 'System' },
            { id: 'trade', label: 'Trade' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setMessageCategory(c.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
              style={{
                background: messageCategory === c.id ? '#2962ff' : '#2a2e39',
                color: messageCategory === c.id ? '#fff' : '#787b86',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredMessages.length === 0 ? (
          <div className="p-8 text-center" style={{ color: '#787b86' }}>
            <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
            <div className="text-base">No messages yet</div>
          </div>
        ) : (
          filteredMessages.map((m) => (
            <div
              key={m.id}
              className="p-4 border-b"
              style={{
                borderColor: '#363a45',
                background: m.read ? 'transparent' : 'rgba(41, 98, 255, 0.06)',
              }}
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: '#2a2e39' }}>
                  {m.type === 'trade' ? <TrendingUp size={20} color="#26a69a" /> : <Bell size={20} color="#2962ff" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-base" style={{ color: '#d1d4dc' }}>
                      {m.title}
                    </span>
                    <span className="text-xs" style={{ color: '#787b86' }}>
                      {m.time ? new Date(m.time).toLocaleTimeString() : ''}
                    </span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: '#787b86', wordBreak: 'break-word' }}>
                    {m.message}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ============ ADD ACCOUNT MODAL ============
  const AddAccountModal = () => (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl" style={{ background: '#1e222d', border: '1px solid #363a45' }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#363a45' }}>
          <h3 className="font-bold text-lg" style={{ color: '#d1d4dc' }}>Add Account</h3>
          <button onClick={() => setShowAddAccountModal(false)}>
            <X size={22} color="#787b86" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: '#2962ff20', border: '1px solid #2962ff50' }}>
            <Info size={18} color="#2962ff" className="shrink-0 mt-0.5" />
            <div className="text-sm" style={{ color: '#2962ff' }}>
              Login with another account to save it for quick switching. Max {getMaxSavedAccounts()} accounts allowed.
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Email</label>
            <input
              type="email"
              value={addAccountEmail}
              onChange={(e) => setAddAccountEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg text-base"
              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: '#787b86' }}>Password</label>
            <input
              type="password"
              value={addAccountPassword}
              onChange={(e) => setAddAccountPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg text-base"
              style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              placeholder="••••••••"
            />
          </div>

          <button
            onClick={handleAddAccount}
            disabled={addAccountLoading}
            className="w-full py-3.5 rounded-lg font-semibold text-base disabled:opacity-50"
            style={{ background: '#2962ff', color: '#fff' }}
          >
            {addAccountLoading ? 'Adding...' : 'Add Account'}
          </button>
        </div>
      </div>
    </div>
  );

  // ============ SETTINGS TAB ============
  const SettingsTab = () => {
    const [showBal, setShowBal] = useState(true);
    const maxAccounts = getMaxSavedAccounts();

    return (
      <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
        <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-lg" style={{ color: '#d1d4dc' }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-sm" style={{ color: '#787b86' }}>
                {user?.email}
              </div>
            </div>

            <button onClick={logout} className="p-2.5 rounded-lg" style={{ background: '#2a2e39' }}>
              <LogOut size={18} color="#787b86" />
            </button>
          </div>

          {/* DEMO/LIVE switch */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={switchToDemo}
              className="flex-1 py-3 rounded-lg text-base font-semibold"
              style={{
                background: selectedAccount?.is_demo ? '#2962ff' : '#2a2e39',
                color: selectedAccount?.is_demo ? '#fff' : '#787b86',
                border: '1px solid #363a45',
              }}
            >
              DEMO
            </button>

            <button
              onClick={switchToLive}
              className="flex-1 py-3 rounded-lg text-base font-semibold"
              style={{
                background: !selectedAccount?.is_demo ? '#26a69a' : '#2a2e39',
                color: !selectedAccount?.is_demo ? '#fff' : '#787b86',
                border: '1px solid #363a45',
              }}
            >
              LIVE
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Balance card */}
          <div className="p-4 rounded-xl" style={{ background: '#2a2e39' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: '#787b86' }}>Balance</span>
              <button onClick={() => setShowBal((v) => !v)}>
                {showBal ? <Eye size={18} color="#787b86" /> : <EyeOff size={18} color="#787b86" />}
              </button>
            </div>

            <div className="text-3xl font-bold" style={{ color: '#d1d4dc' }}>
              {showBal ? formatINR(accountStats.balance) : '••••••'}
            </div>

            <div className="text-sm mt-2" style={{ color: '#787b86' }}>
              Account: {selectedAccount?.account_number || '-'} • Leverage: 1:{accountStats.leverage}
            </div>
          </div>

          {/* Deposit/Withdraw buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setWalletIntent('deposit');
                setActiveTab('wallet');
              }}
              className="py-3.5 rounded-xl font-medium text-base flex items-center justify-center gap-2"
              style={{ background: '#26a69a', color: '#fff' }}
            >
              <Plus size={20} />
              Deposit
            </button>

            <button
              onClick={() => {
                setWalletIntent('withdraw');
                setActiveTab('wallet');
              }}
              className="py-3.5 rounded-xl font-medium text-base flex items-center justify-center gap-2"
              style={{ background: '#2a2e39', color: '#d1d4dc', border: '1px solid #363a45' }}
            >
              <RefreshCw size={20} />
              Withdraw
            </button>
          </div>

          {/* ✅ SAVED ACCOUNTS SECTION */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#2a2e39', border: '1px solid #363a45' }}>
            <div className="p-4 border-b" style={{ borderColor: '#363a45' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={18} color="#2962ff" />
                  <span className="font-semibold text-base" style={{ color: '#d1d4dc' }}>
                    Saved Accounts
                  </span>
                </div>
                <span className="text-xs px-2 py-1 rounded" style={{ background: '#2962ff20', color: '#2962ff' }}>
                  {savedAccounts.length}/{maxAccounts}
                </span>
              </div>
              <div className="text-xs mt-1" style={{ color: '#787b86' }}>
                Switch between accounts quickly without re-entering password
              </div>
            </div>

            <div className="divide-y" style={{ borderColor: '#363a45' }}>
              {savedAccounts.map((acc) => {
                const isActive = user?.email === acc.email;
                
                return (
                  <div 
                    key={acc.email}
                    className="p-3 flex items-center justify-between"
                    style={{ background: isActive ? '#2962ff10' : 'transparent' }}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: isActive ? '#2962ff' : '#363a45', color: '#fff' }}
                      >
                        {acc.firstName?.[0]}{acc.lastName?.[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: '#d1d4dc' }}>
                          {acc.firstName} {acc.lastName}
                          {isActive && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: '#26a69a20', color: '#26a69a' }}>
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: '#787b86' }}>{acc.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isActive && (
                        <button
                          onClick={() => handleSwitchToSavedAccount(acc)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#2962ff', color: '#fff' }}
                        >
                          Switch
                        </button>
                      )}
                      {!isActive && (
                        <button
                          onClick={() => handleRemoveSavedAccount(acc.email)}
                          className="p-1.5 rounded hover:bg-red-500/20"
                        >
                          <Trash2 size={16} color="#ef5350" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {savedAccounts.length === 0 && (
                <div className="p-4 text-center text-sm" style={{ color: '#787b86' }}>
                  No saved accounts yet
                </div>
              )}
            </div>

            {/* Add Account button */}
            {savedAccounts.length < maxAccounts && (
              <div className="p-3 border-t" style={{ borderColor: '#363a45' }}>
                <button
                  onClick={() => setShowAddAccountModal(true)}
                  className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                  style={{ background: '#1e222d', color: '#2962ff', border: '1px dashed #2962ff50' }}
                >
                  <UserPlus size={18} />
                  Add Another Account
                </button>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: '#2a2e39' }}>
            <Info size={18} color="#787b86" className="shrink-0 mt-0.5" />
            <div className="text-sm" style={{ color: '#787b86' }}>
              You can log in from multiple devices simultaneously. Each device maintains its own session.
            </div>
          </div>
        </div>

        {showAddAccountModal && <AddAccountModal />}
      </div>
    );
  };

  // Replace the entire AdminTab function in Dashboard.jsx with this:
  // const AdminTab = () => {
  //   const [adminView, setAdminView] = useState('users'); // 'users' or 'withdrawals'
    
  //   return (
  //     <div className="flex flex-col h-full" style={{ background: '#1e222d' }}>
  //       {/* Tab selector */}
  //       <div className="flex border-b" style={{ borderColor: '#363a45' }}>
  //         <button
  //           onClick={() => setAdminView('users')}
  //           className="flex-1 py-3 text-sm font-medium border-b-2"
  //           style={{
  //             color: adminView === 'users' ? '#2962ff' : '#787b86',
  //             borderColor: adminView === 'users' ? '#2962ff' : 'transparent',
  //           }}
  //         >
  //           Users Management
  //         </button>
  //         <button
  //           onClick={() => setAdminView('withdrawals')}
  //           className="flex-1 py-3 text-sm font-medium border-b-2"
  //           style={{
  //             color: adminView === 'withdrawals' ? '#2962ff' : '#787b86',
  //             borderColor: adminView === 'withdrawals' ? '#2962ff' : 'transparent',
  //           }}
  //         >
  //           Withdrawal Requests
  //         </button>
  //       </div>
        
  //       {/* Content */}
  //       <div className="flex-1 overflow-hidden">
  //         {adminView === 'users' ? <AdminUsers /> : <AdminWithdrawals />}
  //       </div>
  //     </div>
  //   );
  // };

  // ============ MAIN RENDER ============
  return (
    <div className="h-screen flex flex-col" style={{ background: '#131722' }}>
      {/* ✅ Header with larger logo */}
      <header
        className="h-16 flex items-center justify-between px-4 border-b shrink-0"
        style={{ background: '#1e222d', borderColor: '#363a45' }}
      >
        <div className="flex items-center gap-3">
          {/* ✅ Logo - No background box, clean display */}
          <img 
            src="/logo.png" 
            alt="Trade Axis" 
            className="h-10 w-auto object-contain"
            style={{ maxWidth: '44px' }}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Fallback if logo doesn't load */}
          <div 
            className="h-10 w-10 rounded-lg items-center justify-center hidden"
            style={{ background: 'linear-gradient(135deg, #26a69a 0%, #2962ff 100%)' }}
          >
            <span className="text-xl font-bold text-white">TA</span>
          </div>
          
          {/* App Name */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl" style={{ color: '#26a69a' }}>Trade</span>
              <span className="font-bold text-xl" style={{ color: '#2962ff' }}>Axis</span>
            </div>
            <div className="text-[10px] -mt-1 hidden sm:block" style={{ color: '#787b86' }}>
              Indian Markets Terminal
            </div>
          </div>
        </div>

        {/* P&L display */}
        <div className="text-base font-bold" style={{ color: totalPnL >= 0 ? '#26a69a' : '#ef5350' }}>
          {totalPnL >= 0 ? '+' : ''}{formatINR(totalPnL)}
        </div>

        {/* Desktop logout */}
        <div className="hidden lg:flex items-center gap-4">
          <div className="text-sm" style={{ color: '#787b86' }}>
            <span style={{ color: '#d1d4dc' }}>{selectedAccount?.account_number}</span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs" style={{ 
              background: selectedAccount?.is_demo ? '#f5c54220' : '#26a69a20',
              color: selectedAccount?.is_demo ? '#f5c542' : '#26a69a'
            }}>
              {selectedAccount?.is_demo ? 'DEMO' : 'LIVE'}
            </span>
          </div>
          <button 
            onClick={logout} 
            className="px-4 py-2 rounded-lg text-sm font-medium" 
            style={{ background: '#2a2e39', color: '#d1d4dc' }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Desktop */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        <DesktopTerminal
          leftTop={
            <MarketWatchPanel
              symbols={symbols}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={setSelectedSymbol}
              watchlists={watchlists}
              activeWatchlistId={activeWatchlistId}
              activeSymbols={activeSymbols}
              onSwitchWatchlist={handleSwitchWatchlist}
              onCreateWatchlist={handleCreateWatchlist}
              onToggleSymbol={toggleSymbolInWatchlist}
            />
          }
          leftBottom={<NavigatorPanel accounts={accounts} selectedAccount={selectedAccount} onSelectAccount={setSelectedAccount} />}
          centerTop={<ChartWorkspace symbol={selectedSymbol} />}
          centerBottom={<ToolboxPanel accountId={selectedAccount?.id} openTrades={openTrades} tradeHistory={tradeHistory} onCloseTrade={handleCloseTrade} />}
          right={
            <OrderDockPanel
              symbol={selectedSymbol}
              bid={bid}
              ask={ask}
              leverage={selectedAccount?.leverage || 5}
              freeMargin={selectedAccount?.free_margin || 0}
              onBuy={(qty) => placeOrderWithQty('buy', qty)}
              onSell={(qty) => placeOrderWithQty('sell', qty)}
            />
          }
        />
      </div>

      {/* Mobile */}
      <div className="lg:hidden flex-1 overflow-hidden pb-16">
        {activeTab === 'quotes' && <QuotesTab />}
        {activeTab === 'chart' && <ChartTab />}
        {activeTab === 'trade' && <TradeTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'messages' && <MessagesTab />}
        {activeTab === 'wallet' && (
          <WalletPage selectedAccount={selectedAccount} user={user} intent={walletIntent} />
        )}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'admin' && isAdmin && <AdminPanelPage />}
      </div>

      <MobileNav />
    </div>
  );
};

export default Dashboard;