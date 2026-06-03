import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { Ghost, ArrowUp, ArrowDown, Minus } from '@phosphor-icons/react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const signalColor = (sig) => sig === 'BUY' ? '#00E676' : sig === 'SELL' ? '#FF3B30' : '#52525B';

const GhostModeScanner = ({ onStockSelect }) => {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [scanTime, setScanTime] = useState(null);
  const [error, setError] = useState(null);
  const [minMatch, setMinMatch] = useState(3);
  const [expanded, setExpanded] = useState(null);

  const startScan = useCallback(async () => {
    setScanning(true); setError(null); setResults(null);
    try {
      const response = await axios.get(`${API}/ghost/scan`, { params: { min_match: minMatch }, timeout: 300000 });
      setResults(response.data.results);
      setScanTime(response.data.scan_time);
    } catch (err) {
      setError(err.response?.data?.detail || 'Scan failed. Try again.');
    } finally {
      setScanning(false);
    }
  }, [minMatch]);

  const handleStockClick = (result) => {
    if (onStockSelect) onStockSelect({ ticker: result.ticker, name: result.name, type: 'STOCK' });
  };

  const getVerdictColor = (v) => {
    if (v?.includes('BUY')) return '#00E676';
    if (v?.includes('SELL')) return '#FF3B30';
    return '#F5A623';
  };

  return (
    <div className="p-3" data-testid="ghost-scanner">
      <div className="flex items-center gap-2 mb-3">
        <Ghost size={16} className="text-[#A855F7]" weight="fill" />
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">GHOST MODE</span>
          <p className="text-[9px] text-zinc-500">Auto-scan 50 stocks with DEMON</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-500">Min:</span>
          {[3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setMinMatch(n)}
              className={`text-[10px] px-1.5 py-0.5 font-mono font-bold transition-all ${minMatch === n ? 'bg-[#A855F7] text-white' : 'text-zinc-600 hover:text-zinc-300'}`}
              data-testid={`ghost-min-${n}`}
            >
              {n}/7
            </button>
          ))}
        </div>
        <button
          onClick={startScan}
          disabled={scanning}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#A855F7] text-white hover:bg-[#9333EA] transition-colors disabled:opacity-50"
          data-testid="ghost-scan-btn"
        >
          {scanning ? 'SCANNING...' : 'SCAN'}
        </button>
      </div>

      {/* Scanning */}
      {scanning && (
        <div className="py-6 text-center">
          <div className="w-full h-1 bg-zinc-800 overflow-hidden mb-3">
            <div className="h-full bg-[#A855F7] animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Scanning 50 stocks... ~1-2 min</p>
        </div>
      )}

      {error && <p className="text-[10px] text-[#FF3B30] font-mono">{error}</p>}

      {/* Results */}
      {results && !scanning && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-zinc-400">{results.length} found ({minMatch}+ match)</span>
            {scanTime && <span className="text-[9px] font-mono text-zinc-600">{scanTime}</span>}
          </div>

          {results.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-[10px] text-zinc-500">No stocks matched {minMatch}/7</p>
              <p className="text-[9px] text-zinc-600 mt-1">Try lowering to 3/7</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {results.map((result, idx) => (
                <div key={idx} className="border border-white/5 hover:border-white/10 transition-colors" data-testid={`ghost-result-${idx}`}>
                  <button
                    className="w-full text-left p-2 flex items-center justify-between"
                    onClick={() => setExpanded(expanded === idx ? null : idx)}
                    data-testid={`ghost-result-toggle-${idx}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {result.signal_type === 'BUY' ? <ArrowUp size={12} className="text-[#00E676] shrink-0" weight="bold" /> :
                       result.signal_type === 'SELL' ? <ArrowDown size={12} className="text-[#FF3B30] shrink-0" weight="bold" /> :
                       <Minus size={12} className="text-zinc-500 shrink-0" />}
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono font-bold text-white block truncate">{result.ticker.replace('.NS', '')}</span>
                        <span className="text-[9px] text-zinc-500 block truncate">{result.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] font-mono text-white">{result.price.toFixed(2)}</p>
                        <p className={`text-[9px] font-mono ${result.change_pct >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                          {result.change_pct >= 0 ? '+' : ''}{result.change_pct}%
                        </p>
                      </div>
                      <span
                        className="px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-black"
                        style={{ backgroundColor: getVerdictColor(result.verdict) }}
                        data-testid={`ghost-verdict-${idx}`}
                      >
                        {result.verdict.replace('DEMON ', '').replace('LEANING ', '')}
                      </span>
                    </div>
                  </button>

                  {expanded === idx && (
                    <div className="px-2 pb-2 border-t border-white/5 animate-fade-in">
                      <div className="grid grid-cols-2 gap-0.5 mt-1.5">
                        {Object.values(result.strategy_signals).map((s, i) => (
                          <div key={i} className="flex justify-between py-0.5 px-1 text-[9px] border border-white/5">
                            <span className="text-zinc-500 truncate">{s.name.replace(/\s*\(.*\)/, '')}</span>
                            <span className="font-mono font-bold" style={{ color: signalColor(s.signal) }}>{s.signal}</span>
                          </div>
                        ))}
                      </div>
                      {result.entry_price && (
                        <div className="flex gap-3 mt-1.5 text-[10px] font-mono">
                          <span>Entry: <span className="text-white">{result.entry_price}</span></span>
                          {result.stop_loss && <span>SL: <span className="text-[#FF3B30]">{result.stop_loss}</span></span>}
                        </div>
                      )}
                      <div className="mt-1.5">
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-[#A855F7] rounded-full" style={{ width: `${result.confidence}%` }} />
                        </div>
                        <p className="text-[9px] font-mono text-zinc-500 mt-0.5">Confidence: {result.confidence}%</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStockClick(result); }}
                        className="w-full mt-1.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#A855F7] text-white hover:bg-[#9333EA] transition-colors"
                        data-testid={`ghost-open-chart-${idx}`}
                      >
                        Open in Chart
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GhostModeScanner;
