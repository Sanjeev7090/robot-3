import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Lightning, Bell, X, TrendUp, TrendDown, Play, Pause, SpeakerHigh, CurrencyInr, Binoculars, ChartBar } from '@phosphor-icons/react';
import StockFinderModal from './StockFinderModal';
import MultiTFScannerModal from './MultiTFScannerModal';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ---- Sound Generator ----
const playAlertSound = (direction) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    if (direction === 'BUY') {
      // Bullish: ascending two-tone chime
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.35);
      });
    } else {
      // Bearish: descending two-tone
      const notes = [783.99, 523.25]; // G5, C5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.3);
      });
    }

    setTimeout(() => ctx.close(), 2000);
  } catch (e) { /* Audio not supported */ }
};

// ---- Signal Popup ----
const SignalPopup = ({ signal, ticker, isCrypto, onClose }) => {
  const isBuy = signal.direction === 'BUY';

  useEffect(() => {
    const timer = setTimeout(onClose, 15000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed z-[9999] animate-slide-in-right ${isBuy ? 'border-l-4 border-l-[#00E676]' : 'border-l-4 border-l-[#FF3B30]'}`}
      style={{ top: '80px', right: '20px', width: '340px' }}
      data-testid="signal-popup">
      <div className="bg-[#111] border border-white/10 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-3 py-2 flex items-center justify-between ${isBuy ? 'bg-[#00E676]/10' : 'bg-[#FF3B30]/10'}`}>
          <div className="flex items-center gap-2">
            {isBuy ? <TrendUp size={16} weight="bold" className="text-[#00E676]" /> : <TrendDown size={16} weight="bold" className="text-[#FF3B30]" />}
            <span className={`text-sm font-black ${isBuy ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
              {signal.direction} SIGNAL
            </span>
            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-zinc-300 font-bold">{ticker}</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white" data-testid="close-signal-popup">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{signal.strategy}</span>
            <span className="text-[10px] text-zinc-400 font-mono">Confidence: {signal.confidence}%</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-white/5 rounded p-1.5">
              <span className="text-[8px] text-zinc-500 block">ENTRY</span>
              <span className="text-xs font-mono font-bold text-white">{isCrypto ? '$' : ''}{signal.entry}</span>
            </div>
            <div className="bg-white/5 rounded p-1.5">
              <span className="text-[8px] text-zinc-500 block">STOPLOSS</span>
              <span className="text-xs font-mono font-bold text-red-400">{isCrypto ? '$' : ''}{signal.stoploss}</span>
            </div>
          </div>

          {signal.day_target && (
            <div className="flex items-center justify-between bg-[#00BCD4]/8 border border-[#00BCD4]/25 rounded px-2 py-1">
              <span className="text-[8px] font-bold text-[#00BCD4] uppercase tracking-wider">1D Target</span>
              <span className="text-xs font-black font-mono text-[#00BCD4]">{isCrypto ? '$' : ''}{signal.day_target}</span>
            </div>
          )}

          {signal.targets?.length > 0 && (
            <div className="flex gap-1">
              {signal.targets.map((t, i) => (
                <span key={i} className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono flex-1 text-center">
                  T{i + 1}: {isCrypto ? '$' : ''}{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- Multiple Signal Popup Stack ----
const SignalStack = ({ signals, ticker, isCrypto, onDismiss }) => {
  return (
    <div className="fixed z-[9999]" style={{ top: '80px', right: '20px', width: '340px' }}>
      <div className="space-y-2">
        {signals.map((sig, idx) => (
          <SignalPopup
            key={`${sig.strategy}-${idx}`}
            signal={sig}
            ticker={ticker}
            isCrypto={isCrypto}
            onClose={() => onDismiss(idx)}
          />
        ))}
      </div>
    </div>
  );
};

// ---- Main AutoScanner Component ----
// ---- Confluence Score Meter ----
const ConfluenceMeter = ({ score, label, direction, aligned, total }) => {
  const getColor = (s) => {
    if (s >= 85) return { bar: '#00E676', text: '#00E676', glow: 'shadow-[0_0_12px_#00E676aa]' };
    if (s >= 65) return { bar: '#69F0AE', text: '#69F0AE', glow: 'shadow-[0_0_8px_#69F0AEaa]' };
    if (s >= 45) return { bar: '#FFD600', text: '#FFD600', glow: '' };
    if (s >= 25) return { bar: '#FF9800', text: '#FF9800', glow: '' };
    return { bar: '#FF3B30', text: '#FF3B30', glow: '' };
  };
  const c = getColor(score);

  return (
    <div className="border border-white/10 rounded-lg p-2.5 bg-white/[0.02] mb-2" data-testid="confluence-meter">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">Confluence Score</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            direction === 'BUY'
              ? 'bg-[#00E676]/15 text-[#00E676]'
              : direction === 'SELL'
              ? 'bg-[#FF3B30]/15 text-[#FF3B30]'
              : 'bg-white/5 text-zinc-400'
          }`} data-testid="confluence-direction">{direction}</span>
          <span className="text-[9px] text-zinc-500 font-mono">{aligned}/{total}</span>
        </div>
      </div>

      {/* Score Bar */}
      <div className="relative h-2 bg-white/5 rounded-full overflow-hidden mb-1.5">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${c.glow}`}
          style={{ width: `${score}%`, backgroundColor: c.bar }}
          data-testid="confluence-bar"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black" style={{ color: c.text }} data-testid="confluence-label">{label}</span>
        <span className="text-base font-black font-mono" style={{ color: c.text }} data-testid="confluence-score">{score}</span>
      </div>
    </div>
  );
};

// ---- Main AutoScanner Component ----
const AutoScanner = ({ selectedStock, onPaperTrade, autoExecute, onAutoExecuteTrade, onStockSelect }) => {
  const [isActive, setIsActive] = useState(false);
  const [signals, setSignals] = useState([]);
  const [popupSignals, setPopupSignals] = useState([]);
  const [lastScan, setLastScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [confluenceData, setConfluenceData] = useState(null);
  const [showFinder,    setShowFinder]    = useState(false);
  const [showMultiTF,   setShowMultiTF]   = useState(false);
  const intervalRef = useRef(null);
  const seenSignalsRef = useRef(new Set());
  const autoExecuteRef = useRef(autoExecute);
  const onAutoExecuteTradeRef = useRef(onAutoExecuteTrade);

  // Keep refs in sync without causing runScan to recreate
  useEffect(() => { autoExecuteRef.current = autoExecute; }, [autoExecute]);
  useEffect(() => { onAutoExecuteTradeRef.current = onAutoExecuteTrade; }, [onAutoExecuteTrade]);

  const isCrypto = selectedStock?.type === 'CRYPTO';
  const ticker = isCrypto ? selectedStock?.coin_id : selectedStock?.ticker;

  const runScan = useCallback(async () => {
    if (!ticker) return;
    setScanning(true);
    try {
      const { data } = await axios.get(`${API}/auto-scan/${ticker}`);
      setLastScan(new Date().toLocaleTimeString());

      // Always update confluence data (even with no signals)
      setConfluenceData({
        score: data.confluence_score ?? 0,
        label: data.confluence_label ?? 'WEAK',
        direction: data.dominant_direction ?? 'NEUTRAL',
        aligned: data.aligned_count ?? 0,
        total: data.total_strategies ?? 11,
      });

      if (data.has_signal && data.signals?.length > 0) {
        setSignals(data.signals);

        // Find new signals (not seen before)
        const newSignals = data.signals.filter(s => {
          const key = `${s.strategy}-${s.direction}`;
          if (seenSignalsRef.current.has(key)) return false;
          seenSignalsRef.current.add(key);
          return true;
        });

        if (newSignals.length > 0) {
          setPopupSignals(prev => [...newSignals, ...prev].slice(0, 5));
          if (soundEnabled) {
            playAlertSound(newSignals[0].direction);
          }
          // Auto-execute paper trade if enabled
          if (autoExecuteRef.current && onAutoExecuteTradeRef.current && newSignals.length > 0) {
            onAutoExecuteTradeRef.current(newSignals[0]);
          }
        }
      } else {
        setSignals([]);
      }
    } catch (e) { /* silent */ }
    finally { setScanning(false); }
  }, [ticker, soundEnabled]);

  // Start/stop auto scan
  useEffect(() => {
    if (isActive && ticker) {
      seenSignalsRef.current.clear();
      runScan(); // Immediate first scan
      intervalRef.current = setInterval(runScan, 30000); // Every 30s
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, ticker, runScan]);

  // Reset when stock changes
  useEffect(() => {
    seenSignalsRef.current.clear();
    setSignals([]);
    setPopupSignals([]);
    setLastScan(null);
    setConfluenceData(null);
  }, [ticker]);

  const toggleScanner = () => {
    if (!selectedStock) return;
    setIsActive(!isActive);
    if (isActive) {
      setSignals([]);
      setPopupSignals([]);
      setConfluenceData(null);
      seenSignalsRef.current.clear();
    }
  };

  const dismissPopup = (idx) => {
    setPopupSignals(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <>
      {/* Popup Notifications */}
      {popupSignals.length > 0 && (
        <SignalStack
          signals={popupSignals}
          ticker={isCrypto ? selectedStock?.symbol?.toUpperCase() : selectedStock?.ticker}
          isCrypto={isCrypto}
          onDismiss={dismissPopup}
        />
      )}

      {/* Scanner Panel */}
      <div className="p-3" data-testid="auto-scanner">
        {/* Header + Toggle */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lightning size={14} className={isActive ? 'text-[#00E676]' : 'text-zinc-500'} weight="fill" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Auto Scanner</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMultiTF(true)}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1 bg-sky-500/15 text-sky-400 hover:bg-sky-500/25 border border-sky-500/25 transition-all"
              data-testid="open-mtf-scanner"
              title="Multi-Timeframe + Multi-Asset Scanner"
            >
              <ChartBar size={11} weight="bold" />
              Multi-TF
            </button>
            <button
              onClick={() => setShowFinder(true)}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1 bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 border border-yellow-500/25 transition-all"
              data-testid="open-stock-finder"
              title="Sabhi stocks scan karo"
            >
              <Binoculars size={11} weight="bold" />
              Finder
            </button>
            <button onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1 rounded ${soundEnabled ? 'text-[#00E676]' : 'text-zinc-600'}`}
              data-testid="sound-toggle"
              title={soundEnabled ? 'Sound ON' : 'Sound OFF'}>
              <SpeakerHigh size={12} weight={soundEnabled ? 'fill' : 'regular'} />
            </button>
            <button onClick={toggleScanner} disabled={!selectedStock}
              className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1.5 transition-all ${
                isActive
                  ? 'bg-[#FF3B30]/20 text-[#FF3B30] hover:bg-[#FF3B30]/30'
                  : 'bg-[#00E676]/20 text-[#00E676] hover:bg-[#00E676]/30'
              } disabled:opacity-30`}
              data-testid="scanner-toggle">
              {isActive ? <Pause size={10} weight="bold" /> : <Play size={10} weight="bold" />}
              {isActive ? 'STOP' : 'START'}
            </button>
          </div>
        </div>

        {/* Status */}
        {!selectedStock && (
          <p className="text-[10px] text-zinc-600 text-center py-2">Pehle stock ya crypto select karo</p>
        )}

        {isActive && (
          <div className="space-y-2">
            {/* Scan status */}
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-zinc-500">
                Scanning: <span className="text-white font-bold">{isCrypto ? selectedStock?.symbol?.toUpperCase() : selectedStock?.ticker}</span>
              </span>
              <span className="text-zinc-600">
                {scanning ? (
                  <span className="text-[#00E676] animate-pulse">Scanning...</span>
                ) : lastScan ? (
                  `Last: ${lastScan}`
                ) : ''}
              </span>
            </div>

            {/* Scan interval indicator */}
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#00E676] animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-[9px] text-zinc-500">Auto-scan har 30 sec | All 11 strategies active</span>
            </div>

            {/* Confluence Score Meter */}
            {confluenceData && (
              <ConfluenceMeter
                score={confluenceData.score}
                label={confluenceData.label}
                direction={confluenceData.direction}
                aligned={confluenceData.aligned}
                total={confluenceData.total}
              />
            )}

            {/* Active Signals */}
            {signals.length > 0 ? (
              <div className="space-y-1.5" data-testid="active-signals-list">
                <p className="text-[9px] text-[#00E676] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Bell size={10} weight="fill" /> {signals.length} Active Signal{signals.length > 1 ? 's' : ''}
                </p>
                {signals.map((sig, idx) => (
                  <div key={idx}
                    className={`border rounded p-2 ${sig.direction === 'BUY' ? 'border-[#00E676]/30 bg-[#00E676]/5' : 'border-[#FF3B30]/30 bg-[#FF3B30]/5'}`}
                    data-testid={`signal-card-${idx}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        {sig.direction === 'BUY' ? <TrendUp size={10} className="text-[#00E676]" weight="bold" /> : <TrendDown size={10} className="text-[#FF3B30]" weight="bold" />}
                        <span className={`text-[10px] font-black ${sig.direction === 'BUY' ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                          {sig.direction}
                        </span>
                        <span className="text-[9px] text-zinc-400">{sig.strategy}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-zinc-500 font-mono">{sig.confidence}%</span>
                        {onPaperTrade && (
                          <button
                            onClick={() => onPaperTrade(sig)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 border border-yellow-500/20 transition-colors"
                            data-testid={`paper-trade-btn-${idx}`}
                            title="Paper Trade this signal"
                          >
                            <CurrencyInr size={8} weight="bold" />
                            Trade
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-mono">
                      <span className="text-zinc-400">Entry: <span className="text-white">{isCrypto ? '$' : ''}{sig.entry}</span></span>
                      <span className="text-zinc-400">SL: <span className="text-red-400">{isCrypto ? '$' : ''}{sig.stoploss}</span></span>
                    </div>

                    {/* Day Target — highlighted separately */}
                    {sig.day_target && (
                      <div className="mt-1.5 flex items-center gap-1.5 bg-[#00BCD4]/8 border border-[#00BCD4]/20 rounded px-1.5 py-1">
                        <span className="text-[8px] font-bold text-[#00BCD4] uppercase tracking-wider">1D Target</span>
                        <span className="text-[10px] font-black font-mono text-[#00BCD4]" data-testid={`day-target-${idx}`}>
                          {isCrypto ? '$' : ''}{sig.day_target}
                        </span>
                      </div>
                    )}

                    {sig.targets?.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {sig.targets.map((t, i) => (
                          <span key={i} className="text-[8px] bg-white/5 text-emerald-400 px-1 py-0.5 rounded font-mono">
                            T{i + 1}: {isCrypto ? '$' : ''}{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-[10px] text-zinc-500">Koi signal nahi abhi... scanning jaari hai</p>
                <p className="text-[8px] text-zinc-600 mt-1">Signal milte hi notification aayega + sound bajega</p>
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        {!isActive && selectedStock && (
          <div className="space-y-1.5 py-2">
            <p className="text-[10px] text-zinc-400 font-bold">Auto Scanner kaise kaam karta hai:</p>
            <div className="space-y-1 text-[9px] text-zinc-500">
              <p>1. START press karo — har 30 sec mein scan hoga</p>
              <p>2. 11 strategies ek saath chalti hain (incl. PAC+S&O & MiroFish AI)</p>
              <p>3. Signal milte hi popup + sound alert</p>
              <p>4. Entry, Stoploss, Targets sab dikhega</p>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {['SMC', 'AMDS', 'PAC+S&O', 'MiroFish', 'Falling Knife', 'Golden Setup', 'Reverse Swings', 'Explosive Vol', 'AI Indicator', 'Godzilla', 'DEMON'].map(s => (
                <span key={s} className={`text-[8px] px-1.5 py-0.5 rounded ${s === 'MiroFish' ? 'bg-[#00BCD4]/15 text-[#00BCD4]' : s === 'PAC+S&O' ? 'bg-[#FF6D00]/15 text-[#FF6D00]' : 'bg-white/5 text-zinc-400'}`}>{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stock Finder Modal */}
      {showFinder && (
        <StockFinderModal
          onClose={() => setShowFinder(false)}
          onStockSelect={(stock) => {
            if (onStockSelect) onStockSelect(stock);
            setShowFinder(false);
          }}
        />
      )}

      {/* Multi-TF Scanner Modal */}
      {showMultiTF && (
        <MultiTFScannerModal
          onClose={() => setShowMultiTF(false)}
          onStockSelect={(stock) => {
            if (onStockSelect) onStockSelect(stock);
            setShowMultiTF(false);
          }}
        />
      )}
    </>
  );
};

export default AutoScanner;
