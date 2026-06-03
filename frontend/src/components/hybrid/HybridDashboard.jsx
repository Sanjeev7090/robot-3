import { useEffect, useState, useRef, useCallback } from "react";
import {
  Lightning, ArrowsLeftRight, Shield, ChartLineUp, ChartBar,
  Database, List, ArrowLeft, MagnifyingGlass, X
} from "@phosphor-icons/react";
import {
  fetchAssets, fetchPriceSeries, fetchCorrelation, fetchRegulatory,
  fetchPositions, fetchPortfolio, listTrades, listSignals,
  openPriceSocket, executeTrade, closeTrade, generateSignal, fetchOrderBook,
  hybridApi,
} from "../../lib/hybridApi";
import { toast } from "sonner";

import QSCChart        from "./QSCChart";
import OrderBook       from "./OrderBook";
import QSCSignalPanel  from "./QSCSignalPanel";
import QSCTradingCard  from "./QSCTradingCard";
import CorrelationHeatmap from "./CorrelationHeatmap";
import RegulatoryGauge   from "./RegulatoryGauge";
import PositionsTable    from "./PositionsTable";
import TradesLog         from "./TradesLog";
import ExecutionPanel    from "./ExecutionPanel";
import PortfolioSummary  from "./PortfolioSummary";
import TickerStrip       from "./TickerStrip";

const CRYPTO_OPTIONS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT"];

export default function HybridDashboard({ onBack }) {
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [istTime, setIstTime] = useState("");
  
  // IST clock
  useEffect(() => {
    const tick = () => setIstTime(new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const [livePrices,  setLivePrices]  = useState({});
  const [assets,      setAssets]      = useState([]);
  const [book,        setBook]        = useState(null);
  const [correlation, setCorrelation] = useState({ symbols: [], cells: [] });
  const [regulatory,  setRegulatory]  = useState(null);
  const [positions,   setPositions]   = useState([]);
  const [portfolio,   setPortfolio]   = useState({});
  const [trades,      setTrades]      = useState([]);
  const [signals,     setSignals]     = useState([]);
  const [genLoading,  setGenLoading]  = useState(false);
  const wsRef = useRef(null);

  const refreshAll = useCallback(async () => {
    const [a, c, r, p, port, t, sg] = await Promise.allSettled([
      fetchAssets(), fetchCorrelation(), fetchRegulatory(),
      fetchPositions(), fetchPortfolio(), listTrades(), listSignals(),
    ]);
    if (a.status === "fulfilled") {
      setAssets(a.value);
      // Fallback: sync REST-polled prices into livePrices so chart & ticker always have data
      setLivePrices(prev => {
        const merged = { ...prev };
        (a.value || []).forEach(asset => {
          if (!merged[asset.symbol] && asset.price) merged[asset.symbol] = asset.price;
          else if (asset.price) merged[asset.symbol] = asset.price; // always update from REST
        });
        return merged;
      });
    }
    if (c.status === "fulfilled") setCorrelation(c.value);
    if (r.status === "fulfilled") setRegulatory(r.value);
    if (p.status === "fulfilled") setPositions(p.value);
    if (port.status === "fulfilled") setPortfolio(port.value);
    if (t.status === "fulfilled") setTrades(t.value);
    if (sg.status === "fulfilled") setSignals(sg.value);
  }, []);

  const refreshChart = useCallback(async () => {
    try {
      const b = await fetchOrderBook(selectedSymbol);
      setBook(b);
    } catch { /* noop */ }
  }, [selectedSymbol]);

  useEffect(() => {
    refreshAll();
    const id = setInterval(refreshAll, 5000);
    return () => clearInterval(id);
  }, [refreshAll]);

  useEffect(() => {
    refreshChart();
    const id = setInterval(refreshChart, 2500);
    return () => clearInterval(id);
  }, [refreshChart]);

  useEffect(() => {
    const sock = openPriceSocket((msg) => {
      if (msg?.type === "tick") setLivePrices(msg.prices);
    });
    wsRef.current = sock;
    return () => { try { sock.close(); } catch {} };
  }, []);

  const onGenerateSignal = async () => {
    await onGenerateSignalForSymbol(selectedSymbol);
  };

  // Called on one-click stock select — generates signal immediately for that symbol
  const onGenerateSignalForSymbol = async (sym) => {
    setGenLoading(true);
    try {
      const sig = await generateSignal(sym);
      setSignals((prev) => [sig, ...prev].slice(0, 10));
      const assetName = assets.find(a => a.symbol === sym)?.name || sym;
      toast.success(`Signal: ${sig.direction} ${assetName} • conf ${(sig.confidence * 100).toFixed(0)}%`);
    } catch { toast.error("Signal generation failed"); }
    finally { setGenLoading(false); }
  };

  // One-click handler: select symbol AND auto-generate signal
  const handleSelectSymbol = (sym) => {
    setSelectedSymbol(sym);
    onGenerateSignalForSymbol(sym);
  };

  const onExecute = async (payload) => {
    try {
      const t = await executeTrade(payload);
      toast.success(`Executed ${t.direction} ${t.total_volume} ${t.symbol} @ ${t.avg_price}`);
      refreshAll();
    } catch (e) { toast.error(e?.response?.data?.detail || "Trade failed"); }
  };

  const onClose = async (id) => {
    try {
      const r = await closeTrade(id);
      toast.success(`Closed • PnL ${r.pnl >= 0 ? "+" : ""}${r.pnl}`);
      refreshAll();
    } catch { toast.error("Close failed"); }
  };

  return (
    <div className="hybrid-mode min-h-screen w-full grid-bg" data-testid="hybrid-dashboard">
      {/* TOP BAR */}
      <header className="border-b border-white/10 px-4 lg:px-6 py-3 flex items-center justify-between bg-[#0A0A0A] sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-zinc-400 hover:text-white border border-white/10 hover:border-white/30 px-2.5 py-1.5 transition-colors"
            data-testid="hybrid-back-btn"
          >
            <ArrowLeft size={12} />
            <span>Exit</span>
          </button>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#3366FF] pulse-dot rounded-full" />
            <span className="font-display text-xl tracking-tighter font-semibold">
              QSC<span className="text-[#3366FF]">.</span>ENGINE
            </span>
          </div>
          <span className="text-[10px] font-mono text-neutral-500 hidden md:inline" data-testid="hybrid-tagline">
            QUANTUM-CASCADE SIGNAL CORE / PAPER-TRADING SIMULATOR
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-neutral-400">
          <span className="flex items-center gap-1.5">
            <Lightning size={12} className="text-[#3366FF]" /> Live
          </span>
          <span className="hidden md:inline">SIM-MODE</span>
          <span className="text-white">{istTime} IST</span>
        </div>
      </header>

      {/* TICKER STRIP */}
      <TickerStrip assets={assets} livePrices={livePrices} />

      {/* MAIN GRID */}
      <main className="px-4 lg:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT */}
        <aside className="lg:col-span-3 flex flex-col gap-4">
          <HybridWatchlist assets={assets} livePrices={livePrices} selected={selectedSymbol} onSelect={handleSelectSymbol} />
          <ExecutionPanel symbol={selectedSymbol} onExecute={onExecute} regulatory={regulatory} />
        </aside>

        {/* CENTER */}
        <section className="lg:col-span-6 flex flex-col gap-4">
          <QSCChart
            symbol={selectedSymbol}
            livePrice={livePrices[selectedSymbol]}
            onChangeSymbol={handleSelectSymbol}
            options={CRYPTO_OPTIONS}
            allAssets={assets}
          />
          {/* QSC Trading Card — cartoon + intraday levels */}
          <QSCTradingCard
            signal={signals[0] ?? null}
            livePrice={livePrices[selectedSymbol] ?? assets.find(a => a.symbol === selectedSymbol)?.price ?? 0}
            symbol={selectedSymbol}
            displayName={assets.find(a => a.symbol === selectedSymbol)?.name ?? selectedSymbol}
            loading={genLoading}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OrderBook book={book} />
            <QSCSignalPanel
              signals={signals}
              selectedSymbol={selectedSymbol}
              onGenerate={onGenerateSignal}
              loading={genLoading}
            />
          </div>
        </section>

        {/* RIGHT */}
        <aside className="lg:col-span-3 flex flex-col gap-4">
          <PortfolioSummary portfolio={portfolio} />
          <RegulatoryGauge data={regulatory} />
        </aside>

        {/* BOTTOM */}
        <div className="lg:col-span-7">
          <CorrelationHeatmap data={correlation} />
        </div>
        <div className="lg:col-span-5">
          <PositionsTable positions={positions} onClose={(id) => onClose(id)} />
        </div>
        <div className="lg:col-span-12">
          <TradesLog trades={trades} />
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-[9px] font-mono uppercase tracking-widest text-neutral-700">
        QSC ENGINE V1.0 / PAPER-TRADING ONLY / NOT FINANCIAL ADVICE
      </footer>
    </div>
  );
}

/* ---- Watchlist sub-component ---- */
function HybridWatchlist({ assets, livePrices, selected, onSelect }) {
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const { data } = await hybridApi.get("/search", { params: { q } });
      setSearchResults(data || []);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  }, []);

  const handleSearch = (e) => {
    const v = e.target.value;
    setSearchQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 350);
  };

  const clearSearch = () => { setSearchQ(""); setSearchResults([]); };

  const groups = { crypto: [], stock: [], commodity: [], macro: [], indian: [] };
  for (const a of assets) {
    if (groups[a.asset_class]) groups[a.asset_class].push(a);
  }

  const Section = ({ label, icon, items }) => {
    if (!items.length) return null;
    return (
      <div>
        <div className="px-4 py-1.5 text-[8px] font-bold uppercase tracking-[0.25em] text-neutral-600 flex items-center gap-1.5 bg-white/[0.015] border-b border-white/5">
          {icon}<span>{label}</span>
        </div>
        {items.map((a) => {
          const price = livePrices[a.symbol] ?? a.price;
          const up = (a.change_24h ?? 0) >= 0;
          const isSel = a.symbol === selected;
          const isINR = a.currency === "INR";
          return (
            <button
              key={a.symbol}
              onClick={() => onSelect(a.symbol)}
              data-testid={`hybrid-watch-${a.symbol}`}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between border-b border-white/[0.04] transition-all duration-150 group
                ${isSel ? "bg-[#3366FF]/10 border-l-2 border-l-[#3366FF]" : "hover:bg-white/5 border-l-2 border-l-transparent"}`}
            >
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-white tracking-tight leading-tight">{a.symbol}</div>
                <div className="text-[9px] text-neutral-500 truncate mt-0.5">{a.name}</div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <div className="text-[11px] font-mono font-bold text-white leading-tight" data-testid={`hybrid-price-${a.symbol}`}>
                  {isINR ? "₹" : ""}{price?.toLocaleString('en-IN', { maximumFractionDigits: isINR ? 2 : 4 })}
                </div>
                <div className="text-[9px] font-mono mt-0.5" style={{ color: up ? "#3366FF" : "#FF3333" }}>
                  {up ? "▲" : "▼"} {Math.abs(a.change_24h ?? 0).toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="qsc-card flex flex-col" data-testid="hybrid-watchlist">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <Database size={13} className="text-neutral-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Watchlist</span>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-white/5 relative" style={{ zIndex: 50 }}>
        <div className="relative">
          <MagnifyingGlass size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQ}
            onChange={handleSearch}
            placeholder="Search RELIANCE, TCS, BTC..."
            className="w-full bg-white/5 border border-white/10 pl-7 pr-7 py-1.5 text-[10px] font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-white/30"
            data-testid="hybrid-search-input"
          />
          {searchQ && (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white">
              <X size={10} />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {(searchResults.length > 0 || searchLoading) && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-[#1A1A1A] border border-white/20 shadow-xl max-h-72 overflow-y-auto" style={{ zIndex: 60 }} data-testid="hybrid-search-results">
            {searchLoading && (
              <div className="px-3 py-2 text-[10px] font-mono text-neutral-500 animate-pulse">Searching NSE / BSE / Crypto...</div>
            )}
            {!searchLoading && searchResults.length === 0 && (
              <div className="px-3 py-2 text-[10px] font-mono text-neutral-500">No matches</div>
            )}
            {searchResults.map((r, i) => (
              <button key={i}
                onClick={() => { onSelect(r.symbol); clearSearch(); }}
                className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center justify-between font-mono text-xs border-b border-white/5 last:border-0"
                data-testid={`search-result-${r.symbol}`}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-white font-bold">{r.symbol}</span>
                  <span className="text-neutral-500 text-[9px] ml-2">{r.name}</span>
                  <span className={`ml-2 text-[8px] px-1 py-0.5 ${
                    r.asset_class === "indian" ? "text-orange-400 bg-orange-400/10" :
                    r.asset_class === "crypto" ? "text-[#3366FF] bg-[#3366FF]/10" :
                    "text-neutral-400 bg-white/5"
                  }`}>{r.asset_class?.toUpperCase()}</span>
                </div>
                <span className="text-neutral-300 text-[10px] ml-2 shrink-0">
                  {r.currency === "INR" ? "₹" : "$"}{r.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Asset sections */}
      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
        <Section label="Crypto"         icon={<ChartLineUp size={11} />}                    items={groups.crypto} />
        <Section label="Indian Markets" icon={<span className="text-[9px]">₹</span>}        items={groups.indian} />
        <Section label="Equities"       icon={<ChartBar size={11} />}                       items={groups.stock} />
        <Section label="Commodities"    icon={<Lightning size={11} />}                      items={groups.commodity} />
        <Section label="Macro"          icon={<Shield size={11} />}                         items={groups.macro} />
      </div>
    </div>
  );
}
