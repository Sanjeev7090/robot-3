import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { createChart } from 'lightweight-charts';
import {
  TrendUp, TrendDown, MagnifyingGlass, ArrowClockwise,
  ChartLine, CurrencyBtc, Lightning, Brain, CaretDown, CaretUp,
  Globe, ArrowsClockwise
} from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ---- Mini Sparkline ----
const Sparkline = ({ data, positive }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline fill="none" stroke={positive ? '#00E676' : '#FF3D3D'} strokeWidth="1.5" points={points} />
    </svg>
  );
};

// ---- Format helpers ----
const fmtPrice = (v) => {
  if (v == null) return '-';
  if (v >= 1) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${v.toFixed(6)}`;
};
const fmtMcap = (v) => {
  if (v == null) return '-';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
};
const fmtPct = (v) => {
  if (v == null) return '-';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
};

// ---- Crypto Chart Component ----
const CryptoChartPanel = ({ coinId, coinSymbol }) => {
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const [chartDays, setChartDays] = useState(7);
  const [chartLoading, setChartLoading] = useState(false);

  const loadChart = useCallback(async () => {
    if (!coinId) return;
    setChartLoading(true);
    try {
      const { data } = await axios.get(`${API}/crypto/chart/${coinId}?days=${chartDays}`);
      const bars = (data.bars || []).map(b => ({
        time: Math.floor(b.timestamp / 1000),
        open: b.open, high: b.high, low: b.low, close: b.close,
      }));
      if (!chartRef.current || bars.length === 0) { setChartLoading(false); return; }

      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }

      const chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: 320,
        layout: { background: { color: '#0A0A0A' }, textColor: '#888' },
        grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
        crosshair: { mode: 0 },
        localization: { locale: 'en-US' },
        timeScale: { borderColor: '#222', timeVisible: chartDays <= 1 },
        rightPriceScale: { borderColor: '#222' },
      });
      const series = chart.addCandlestickSeries({
        upColor: '#00E676', downColor: '#FF3D3D',
        borderUpColor: '#00E676', borderDownColor: '#FF3D3D',
        wickUpColor: '#00E676', wickDownColor: '#FF3D3D',
      });
      series.setData(bars);
      chart.timeScale().fitContent();
      chartInstanceRef.current = chart;

      const ro = new ResizeObserver(() => {
        if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
      });
      ro.observe(chartRef.current);
    } catch (err) {
      if (err?.response?.status === 429) {
        // Rate limit - silent, will use cache on next try
      } else {
        toast.error('Chart data load failed');
      }
    } finally {
      setChartLoading(false);
    }
  }, [coinId, chartDays]);

  useEffect(() => { loadChart(); }, [loadChart]);

  useEffect(() => {
    return () => { if (chartInstanceRef.current) chartInstanceRef.current.remove(); };
  }, []);

  const dayOptions = [
    { label: '24H', value: 1 }, { label: '7D', value: 7 },
    { label: '30D', value: 30 }, { label: '90D', value: 90 }, { label: '1Y', value: 365 },
  ];

  return (
    <div data-testid="crypto-chart-panel">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{coinSymbol}/USD Chart</span>
        <div className="flex gap-1">
          {dayOptions.map(o => (
            <button key={o.value} onClick={() => setChartDays(o.value)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded ${chartDays === o.value ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              data-testid={`chart-period-${o.value}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={chartRef} className="w-full rounded border border-white/5 bg-[#070707] relative" style={{ minHeight: 320 }}>
        {chartLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
            <ArrowsClockwise size={20} className="animate-spin text-[#00E676]" />
          </div>
        )}
      </div>
    </div>
  );
};

// ---- GPT Analysis Component ----
const CryptoAIAnalysis = ({ coinId, symbol }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/crypto/analyze?coin_id=${coinId}&symbol=${symbol}`);
      setAnalysis(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-white/10 rounded-lg p-3" data-testid="crypto-ai-analysis">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Brain size={14} className="text-purple-400" />
          <span className="text-xs font-bold text-zinc-300">AI Analysis</span>
        </div>
        <button onClick={runAnalysis} disabled={loading}
          className="px-2.5 py-1 text-[10px] font-bold bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 disabled:opacity-50"
          data-testid="run-crypto-ai-btn">
          {loading ? 'Analyzing...' : 'Run GPT'}
        </button>
      </div>
      {analysis && (
        <div className="space-y-2 mt-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] font-black rounded ${analysis.direction === 'Long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {analysis.direction?.toUpperCase()}
            </span>
            <span className="text-[10px] text-zinc-500">Confidence: {analysis.confidence}%</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="bg-white/5 rounded p-1.5">
              <span className="text-zinc-500 block">Entry</span>
              <span className="text-white font-mono">{analysis.entry_price}</span>
            </div>
            <div className="bg-white/5 rounded p-1.5">
              <span className="text-zinc-500 block">SL</span>
              <span className="text-red-400 font-mono">{analysis.stoploss}</span>
            </div>
            <div className="bg-white/5 rounded p-1.5">
              <span className="text-zinc-500 block">R:R</span>
              <span className="text-white font-mono">{analysis.risk_reward}</span>
            </div>
          </div>
          {analysis.targets?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {analysis.targets.map((t, i) => (
                <span key={i} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono">T{i + 1}: {t}</span>
              ))}
            </div>
          )}
          <p className="text-[10px] text-zinc-400 leading-relaxed">{analysis.reason}</p>
        </div>
      )}
    </div>
  );
};

// ---- Main CryptoDashboard ----
const CryptoDashboard = ({ preSelectedCoin }) => {
  const [coins, setCoins] = useState([]);
  const [overview, setOverview] = useState(null);
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [coinDetail, setCoinDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [view, setView] = useState('table'); // 'table' | 'detail'

  // If preSelectedCoin is passed (from left sidebar crypto selection), show detail directly
  useEffect(() => {
    if (preSelectedCoin && preSelectedCoin.type === 'CRYPTO') {
      const coin = {
        id: preSelectedCoin.coin_id,
        symbol: preSelectedCoin.symbol,
        name: preSelectedCoin.name,
        image: preSelectedCoin.image,
        current_price: preSelectedCoin.current_price,
        price_change_pct_24h: preSelectedCoin.price_change_pct_24h,
        market_cap: preSelectedCoin.market_cap,
        high_24h: preSelectedCoin.high_24h,
        low_24h: preSelectedCoin.low_24h,
        ath: preSelectedCoin.ath,
        ath_change_pct: preSelectedCoin.ath_change_pct,
        price_change_pct_7d: preSelectedCoin.price_change_pct_7d,
        total_volume: preSelectedCoin.total_volume,
      };
      setSelectedCoin(coin);
      setCoinDetail(coin);
      setView('detail');
      // Try to get extended detail
      axios.get(`${API}/crypto/detail/${coin.id}`).then(r => {
        setCoinDetail(prev => ({ ...prev, ...r.data }));
      }).catch(() => {});
    }
  }, [preSelectedCoin]);

  const fetchPrices = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/crypto/prices`);
      setCoins(data.coins || []);
    } catch {
      // silent - will retry
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/crypto/market-overview`);
      setOverview(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchPrices();
    fetchOverview();
    const iv = setInterval(fetchPrices, 120000); // refresh every 2 min
    return () => clearInterval(iv);
  }, [fetchPrices, fetchOverview]);

  const handleSearch = async (q) => {
    setSearchQ(q);
    if (q.length < 1) { setSearchResults([]); return; }
    try {
      const { data } = await axios.get(`${API}/crypto/search?q=${q}`);
      setSearchResults(data.results || []);
    } catch { /* silent */ }
  };

  const selectCoin = async (coin) => {
    const enriched = {
      ...coin,
      // Map table fields to detail fields for immediate display
      current_price: coin.current_price || coin.price,
      price_change_pct_24h: coin.price_change_pct_24h || coin.change_pct,
      market_cap: coin.market_cap,
      total_volume: coin.total_volume,
      high_24h: coin.high_24h,
      low_24h: coin.low_24h,
      ath: coin.ath,
      ath_change_pct: coin.ath_change_pct,
      price_change_pct_7d: coin.price_change_pct_7d,
      circulating_supply: coin.circulating_supply,
      total_supply: coin.total_supply,
    };
    setSelectedCoin(enriched);
    setCoinDetail(enriched);
    setView('detail');
    setSearchQ('');
    setSearchResults([]);
    // Fetch extended detail in background (description, 30d change, etc.)
    try {
      const { data } = await axios.get(`${API}/crypto/detail/${coin.id}`);
      setCoinDetail(prev => ({ ...prev, ...data }));
    } catch { /* fallback to table data already set */ }
  };

  const goBack = () => { setView('table'); setSelectedCoin(null); setCoinDetail(null); };

  // Filter coins by search
  const filteredCoins = searchQ
    ? coins.filter(c => c.symbol?.includes(searchQ.toUpperCase()) || c.name?.toLowerCase().includes(searchQ.toLowerCase()))
    : coins;

  return (
    <div className="flex flex-col h-full" data-testid="crypto-dashboard">
      {/* If pre-selected from left sidebar, show compact detail only (chart is in center) */}
      {preSelectedCoin && view === 'detail' && selectedCoin && (
        <div className="p-3 space-y-3 overflow-y-auto" data-testid="crypto-sidebar-detail">
          {/* Coin Header */}
          <div className="flex items-center gap-3">
            {(coinDetail?.image || selectedCoin?.image) && (
              <img src={coinDetail?.image || selectedCoin?.image} alt="" className="w-7 h-7 rounded-full" />
            )}
            <div>
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                {coinDetail?.name || selectedCoin?.name}
                <span className="text-zinc-500 text-[10px] font-mono">{(coinDetail?.symbol || selectedCoin?.symbol)?.toUpperCase()}</span>
                {coinDetail?.market_cap_rank && (
                  <span className="text-[8px] bg-white/10 px-1 py-0.5 rounded text-zinc-400">#{coinDetail.market_cap_rank}</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white font-mono" data-testid="crypto-detail-price">
                  {fmtPrice(coinDetail?.current_price)}
                </span>
                {coinDetail?.price_change_pct_24h != null && (
                  <span className={`text-[10px] font-bold ${coinDetail.price_change_pct_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {coinDetail.price_change_pct_24h >= 0 ? <CaretUp size={9} weight="bold" className="inline" /> : <CaretDown size={9} weight="bold" className="inline" />}
                    {Math.abs(coinDetail.price_change_pct_24h).toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          {coinDetail && (
            <div className="grid grid-cols-2 gap-1.5" data-testid="crypto-detail-stats">
              {[
                { label: '24h High', value: fmtPrice(coinDetail.high_24h), color: 'text-emerald-400' },
                { label: '24h Low', value: fmtPrice(coinDetail.low_24h), color: 'text-red-400' },
                { label: 'ATH', value: fmtPrice(coinDetail.ath), color: 'text-yellow-400' },
                { label: 'ATH %', value: fmtPct(coinDetail.ath_change_pct), color: (coinDetail.ath_change_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Market Cap', value: fmtMcap(coinDetail.market_cap), color: 'text-white' },
                { label: 'Volume', value: fmtMcap(coinDetail.total_volume), color: 'text-white' },
                { label: '7d', value: fmtPct(coinDetail.price_change_pct_7d), color: (coinDetail.price_change_pct_7d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                { label: '30d', value: fmtPct(coinDetail.price_change_pct_30d), color: (coinDetail.price_change_pct_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
              ].map(s => (
                <div key={s.label} className="bg-white/5 rounded p-1.5">
                  <span className="text-[8px] text-zinc-500 uppercase block">{s.label}</span>
                  <span className={`text-[10px] font-mono font-bold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Supply Info */}
          {coinDetail && (coinDetail.circulating_supply || coinDetail.total_supply) && (
            <div className="flex gap-2 text-[9px] text-zinc-400 flex-wrap">
              {coinDetail.circulating_supply && (
                <span>Circ: <span className="text-white font-mono">{(coinDetail.circulating_supply / 1e6).toFixed(1)}M</span></span>
              )}
              {coinDetail.total_supply && (
                <span>Total: <span className="text-white font-mono">{(coinDetail.total_supply / 1e6).toFixed(1)}M</span></span>
              )}
              {coinDetail.max_supply && (
                <span>Max: <span className="text-white font-mono">{(coinDetail.max_supply / 1e6).toFixed(1)}M</span></span>
              )}
            </div>
          )}

          {/* AI Analysis */}
          <CryptoAIAnalysis coinId={selectedCoin.id} symbol={selectedCoin.symbol || ''} />

          {/* Description */}
          {coinDetail?.description && (
            <div className="bg-white/5 rounded p-2">
              <span className="text-[8px] text-zinc-500 uppercase block mb-1">About</span>
              <p className="text-[9px] text-zinc-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: coinDetail.description }} />
            </div>
          )}
        </div>
      )}

      {/* Full standalone mode (no preSelectedCoin) */}
      {!preSelectedCoin && (
        <>
      {/* Market Overview Bar */}
      {overview && (
        <div className="border-b border-white/10 px-3 py-2 flex flex-wrap gap-3 text-[10px] bg-[#0D0D0D]" data-testid="crypto-market-bar">
          <div className="flex items-center gap-1">
            <Globe size={11} className="text-zinc-500" />
            <span className="text-zinc-500">Mkt Cap:</span>
            <span className="text-white font-mono">{fmtMcap(overview.total_market_cap)}</span>
            {overview.market_cap_change_pct_24h != null && (
              <span className={overview.market_cap_change_pct_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {fmtPct(overview.market_cap_change_pct_24h)}
              </span>
            )}
          </div>
          <div>
            <span className="text-zinc-500">Vol:</span>
            <span className="text-white font-mono ml-1">{fmtMcap(overview.total_volume)}</span>
          </div>
          <div>
            <span className="text-zinc-500">BTC:</span>
            <span className="text-orange-400 font-mono ml-1">{overview.btc_dominance?.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-zinc-500">ETH:</span>
            <span className="text-blue-400 font-mono ml-1">{overview.eth_dominance?.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Search + Back */}
      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
        {view === 'detail' && (
          <button onClick={goBack} className="text-[10px] text-zinc-400 hover:text-white font-bold shrink-0" data-testid="crypto-back-btn">
            &larr; Back
          </button>
        )}
        <div className="relative flex-1">
          <MagnifyingGlass size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" value={searchQ} onChange={e => handleSearch(e.target.value)}
            placeholder="Search crypto (BTC, ETH...)"
            className="w-full bg-white/5 border border-white/10 rounded pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20"
            data-testid="crypto-search-input" />
          {searchResults.length > 0 && searchQ && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#111] border border-white/10 rounded z-30 max-h-48 overflow-y-auto">
              {searchResults.map(r => (
                <button key={r.id} onClick={() => selectCoin(r)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex items-center gap-2"
                  data-testid={`crypto-search-result-${r.symbol}`}>
                  <CurrencyBtc size={12} className="text-orange-400" />
                  <span className="text-white font-bold">{r.symbol}</span>
                  <span className="text-zinc-500">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => { fetchPrices(); fetchOverview(); }} className="shrink-0 p-1.5 hover:bg-white/5 rounded" data-testid="crypto-refresh-btn">
          <ArrowClockwise size={14} className="text-zinc-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'table' && (
          <>
            {/* Gainers/Losers quick cards */}
            {overview && (overview.top_gainers?.length > 0 || overview.top_losers?.length > 0) && (
              <div className="px-3 py-2 grid grid-cols-2 gap-2" data-testid="crypto-gainers-losers">
                <div>
                  <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                    <TrendUp size={10} /> Top Gainers
                  </span>
                  {overview.top_gainers?.slice(0, 3).map(g => (
                    <button key={g.id} onClick={() => selectCoin(g)}
                      className="w-full flex items-center justify-between py-1 hover:bg-white/5 rounded px-1"
                      data-testid={`gainer-${g.symbol}`}>
                      <div className="flex items-center gap-1">
                        {g.image && <img src={g.image} alt="" className="w-3.5 h-3.5 rounded-full" />}
                        <span className="text-[10px] text-white font-bold">{g.symbol}</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono">{fmtPct(g.change_pct)}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                    <TrendDown size={10} /> Top Losers
                  </span>
                  {overview.top_losers?.slice(0, 3).map(l => (
                    <button key={l.id} onClick={() => selectCoin(l)}
                      className="w-full flex items-center justify-between py-1 hover:bg-white/5 rounded px-1"
                      data-testid={`loser-${l.symbol}`}>
                      <div className="flex items-center gap-1">
                        {l.image && <img src={l.image} alt="" className="w-3.5 h-3.5 rounded-full" />}
                        <span className="text-[10px] text-white font-bold">{l.symbol}</span>
                      </div>
                      <span className="text-[10px] text-red-400 font-mono">{fmtPct(l.change_pct)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Coins Table */}
            {loading ? (
              <div className="p-8 text-center">
                <ArrowsClockwise size={20} className="animate-spin text-[#00E676] mx-auto mb-2" />
                <p className="text-xs text-zinc-500">Loading crypto data...</p>
              </div>
            ) : (
              <div className="overflow-x-auto" data-testid="crypto-table">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-zinc-500 uppercase tracking-wider border-b border-white/10">
                      <th className="text-left px-3 py-2">#</th>
                      <th className="text-left px-2 py-2">Coin</th>
                      <th className="text-right px-2 py-2">Price</th>
                      <th className="text-right px-2 py-2">24h</th>
                      <th className="text-right px-2 py-2 hidden sm:table-cell">7d</th>
                      <th className="text-right px-2 py-2 hidden md:table-cell">Mkt Cap</th>
                      <th className="text-right px-2 py-2 hidden lg:table-cell">7d Chart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCoins.map((coin, idx) => (
                      <tr key={coin.id} onClick={() => selectCoin(coin)}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                        data-testid={`crypto-row-${coin.symbol}`}>
                        <td className="px-3 py-2 text-zinc-500">{coin.market_cap_rank || idx + 1}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            {coin.image && <img src={coin.image} alt="" className="w-4 h-4 rounded-full" />}
                            <span className="text-white font-bold">{coin.symbol}</span>
                            <span className="text-zinc-600 hidden sm:inline">{coin.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right text-white font-mono">{fmtPrice(coin.current_price)}</td>
                        <td className={`px-2 py-2 text-right font-mono ${(coin.price_change_pct_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmtPct(coin.price_change_pct_24h)}
                        </td>
                        <td className={`px-2 py-2 text-right font-mono hidden sm:table-cell ${(coin.price_change_pct_7d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmtPct(coin.price_change_pct_7d)}
                        </td>
                        <td className="px-2 py-2 text-right text-zinc-400 font-mono hidden md:table-cell">{fmtMcap(coin.market_cap)}</td>
                        <td className="px-2 py-2 text-right hidden lg:table-cell">
                          <Sparkline data={coin.sparkline_7d} positive={(coin.price_change_pct_7d || 0) >= 0} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredCoins.length === 0 && (
                  <div className="p-6 text-center text-zinc-500 text-xs">No coins found</div>
                )}
              </div>
            )}
          </>
        )}

        {/* Detail View */}
        {view === 'detail' && selectedCoin && (
          <div className="p-3 space-y-3" data-testid="crypto-detail-view">
            {/* Coin Header */}
            <div className="flex items-center gap-3">
              {(coinDetail?.image || selectedCoin?.image) && (
                <img src={coinDetail?.image || selectedCoin?.image} alt="" className="w-8 h-8 rounded-full" />
              )}
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  {coinDetail?.name || selectedCoin?.name}
                  <span className="text-zinc-500 text-xs font-mono">{(coinDetail?.symbol || selectedCoin?.symbol)?.toUpperCase()}</span>
                  {coinDetail?.market_cap_rank && (
                    <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-zinc-400">#{coinDetail.market_cap_rank}</span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-white font-mono" data-testid="crypto-detail-price">
                    {fmtPrice(coinDetail?.current_price || selectedCoin?.price)}
                  </span>
                  {coinDetail?.price_change_pct_24h != null && (
                    <span className={`text-xs font-bold ${coinDetail.price_change_pct_24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {coinDetail.price_change_pct_24h >= 0 ? <CaretUp size={10} weight="bold" className="inline" /> : <CaretDown size={10} weight="bold" className="inline" />}
                      {Math.abs(coinDetail.price_change_pct_24h).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            {coinDetail && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="crypto-detail-stats">
                {[
                  { label: '24h High', value: fmtPrice(coinDetail.high_24h), color: 'text-emerald-400' },
                  { label: '24h Low', value: fmtPrice(coinDetail.low_24h), color: 'text-red-400' },
                  { label: 'ATH', value: fmtPrice(coinDetail.ath), color: 'text-yellow-400' },
                  { label: 'ATH Change', value: fmtPct(coinDetail.ath_change_pct), color: (coinDetail.ath_change_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Market Cap', value: fmtMcap(coinDetail.market_cap), color: 'text-white' },
                  { label: 'Volume 24h', value: fmtMcap(coinDetail.total_volume), color: 'text-white' },
                  { label: '7d Change', value: fmtPct(coinDetail.price_change_pct_7d), color: (coinDetail.price_change_pct_7d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: '30d Change', value: fmtPct(coinDetail.price_change_pct_30d), color: (coinDetail.price_change_pct_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded p-2">
                    <span className="text-[9px] text-zinc-500 uppercase block">{s.label}</span>
                    <span className={`text-xs font-mono font-bold ${s.color}`}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Supply Info */}
            {coinDetail && (
              <div className="flex gap-3 text-[10px] text-zinc-400">
                {coinDetail.circulating_supply && (
                  <span>Circ: <span className="text-white font-mono">{(coinDetail.circulating_supply / 1e6).toFixed(1)}M</span></span>
                )}
                {coinDetail.total_supply && (
                  <span>Total: <span className="text-white font-mono">{(coinDetail.total_supply / 1e6).toFixed(1)}M</span></span>
                )}
                {coinDetail.max_supply && (
                  <span>Max: <span className="text-white font-mono">{(coinDetail.max_supply / 1e6).toFixed(1)}M</span></span>
                )}
              </div>
            )}

            {/* Chart */}
            <CryptoChartPanel coinId={selectedCoin.id} coinSymbol={(selectedCoin.symbol || '').toUpperCase()} />

            {/* AI Analysis */}
            <CryptoAIAnalysis coinId={selectedCoin.id} symbol={selectedCoin.symbol || ''} />

            {/* Description */}
            {coinDetail?.description && (
              <div className="bg-white/5 rounded p-2">
                <span className="text-[9px] text-zinc-500 uppercase block mb-1">About</span>
                <p className="text-[10px] text-zinc-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: coinDetail.description }} />
              </div>
            )}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};

export default CryptoDashboard;
