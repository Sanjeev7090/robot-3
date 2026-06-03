import React, { useState } from 'react';
import axios from 'axios';
import { ChartLineUp, TrendUp, TrendDown, Clock, Target, Calendar } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const strategies = [
  { id: 'all', label: 'ALL', color: '#FFFFFF' },
  { id: 'falling_knife', label: 'F.Knife', color: '#FF3B30' },
  { id: 'golden_setup', label: 'Golden', color: '#F5A623' },
  { id: 'reverse_swings', label: 'R.Swings', color: '#A855F7' },
  { id: 'godzilla', label: 'Godzilla', color: '#FF0055' },
  { id: 'smc', label: 'SMC', color: '#00E676' },
  { id: 'demon', label: 'DEMON', color: '#007AFF' },
  { id: 'amds', label: 'AMDS', color: '#06B6D4' },
  { id: 'narrative_swing', label: 'Narrative', color: '#A78BFA' },
];

const timeframes = [
  { id: 'intraday', label: 'Intraday (1H)', icon: Clock },
  { id: 'short_term', label: 'Short (Daily)', icon: Calendar },
  { id: 'mid_term', label: 'Mid (Weekly)', icon: Target },
];

const BacktestModule = ({ selectedStock }) => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('all');
  const [selectedTF, setSelectedTF] = useState('intraday');
  const [days, setDays] = useState(90);
  const [showTrades, setShowTrades] = useState(false);
  const [showDaily, setShowDaily] = useState(false);

  const runBacktest = async () => {
    if (!selectedStock) { toast.error('Select a stock or crypto first'); return; }
    setLoading(true);
    setResults(null);
    try {
      const ticker = selectedStock.type === 'CRYPTO' ? selectedStock.coin_id : selectedStock.ticker;
      const response = await axios.post(`${API}/backtest`, {
        ticker: ticker,
        strategy: selectedStrategy,
        days: days,
        timeframe: selectedTF
      });
      setResults(response.data);
      toast.success(`Backtest: ${response.data.total_trades} trades, ${response.data.win_rate}% win rate`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3" data-testid="backtest-module">
      <div className="flex items-center gap-2 mb-3">
        <ChartLineUp size={14} className="text-[#00E676]" weight="bold" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Backtest Engine</span>
      </div>

      {/* Timeframe Selector */}
      <div className="mb-2">
        <p className="text-[9px] text-zinc-600 mb-1 font-bold uppercase tracking-wider">Timeframe</p>
        <div className="flex gap-1">
          {timeframes.map(tf => (
            <button key={tf.id} onClick={() => setSelectedTF(tf.id)}
              className={`flex-1 py-1 text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                selectedTF === tf.id ? 'bg-white text-black' : 'text-zinc-500 hover:text-white border border-white/10'
              }`}
              data-testid={`backtest-tf-${tf.id}`}>
              <tf.icon size={10} weight="bold" />
              {tf.id === 'intraday' ? '1H' : tf.id === 'short_term' ? 'DAY' : 'WEEK'}
            </button>
          ))}
        </div>
      </div>

      {/* Strategy Selector — scrollable on mobile */}
      <div className="mb-2">
        <p className="text-[9px] text-zinc-600 mb-1 font-bold uppercase tracking-wider">Strategy</p>
        <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
          <div className="flex gap-1 flex-nowrap min-w-max">
            {strategies.map(s => (
              <button key={s.id} onClick={() => setSelectedStrategy(s.id)}
                className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  selectedStrategy === s.id ? 'text-black' : 'text-zinc-500 hover:text-white'
                }`}
                style={selectedStrategy === s.id ? { backgroundColor: s.color } : {}}
                data-testid={`backtest-strategy-${s.id}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period + Run */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1">
          {[30, 60, 90, 180, 365].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-1.5 py-0.5 text-[9px] font-mono font-bold transition-all ${
                days === d ? 'bg-[#00E676] text-black' : 'text-zinc-500 hover:text-white'
              }`}
              data-testid={`backtest-days-${d}`}>
              {d}D
            </button>
          ))}
        </div>
        <button onClick={runBacktest} disabled={loading || !selectedStock}
          className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-[#00E676] text-black hover:bg-[#00C864] transition-colors disabled:opacity-50"
          data-testid="backtest-run-btn">
          {loading ? 'Running...' : `RUN ${selectedStock?.type === 'CRYPTO' ? 'CRYPTO' : ''} BACKTEST`}
        </button>
      </div>

      {loading && (
        <div className="py-4 text-center">
          <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Analyzing {days} days with {selectedTF} data...</p>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="animate-fade-in space-y-2">
          {/* Key Stats - Top Row */}
          <div className="grid grid-cols-3 gap-1" data-testid="backtest-results">
            <div className="border border-white/5 p-1.5 text-center">
              <p className="text-[8px] text-zinc-500 uppercase">Trades</p>
              <p className="text-lg font-mono font-bold text-white">{results.total_trades}</p>
            </div>
            <div className="border border-white/5 p-1.5 text-center">
              <p className="text-[8px] text-zinc-500 uppercase">Win Rate</p>
              <p className={`text-lg font-mono font-bold ${results.win_rate >= 80 ? 'text-[#00E676]' : results.win_rate >= 60 ? 'text-[#F5A623]' : 'text-[#FF3B30]'}`} data-testid="backtest-winrate">
                {results.win_rate}%
              </p>
            </div>
            <div className="border border-white/5 p-1.5 text-center">
              <p className="text-[8px] text-zinc-500 uppercase">Return</p>
              <p className={`text-lg font-mono font-bold ${results.total_return >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`} data-testid="backtest-return">
                {results.total_return >= 0 ? '+' : ''}{results.total_return}%
              </p>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-4 gap-1 text-[10px]">
            <div className="text-center py-1 border border-white/5">
              <p className="text-[8px] text-zinc-500">Avg/Day</p>
              <p className="font-mono font-bold text-white">{results.avg_trades_per_day}</p>
            </div>
            <div className="text-center py-1 border border-white/5">
              <p className="text-[8px] text-zinc-500">Days</p>
              <p className="font-mono font-bold text-white">{results.trading_days}</p>
            </div>
            <div className="text-center py-1 border border-white/5">
              <p className="text-[8px] text-zinc-500">Avg Ret</p>
              <p className={`font-mono font-bold ${results.avg_return >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>{results.avg_return}%</p>
            </div>
            <div className="text-center py-1 border border-white/5">
              <p className="text-[8px] text-zinc-500">Max DD</p>
              <p className="font-mono font-bold text-[#FF3B30]">{results.max_drawdown}%</p>
            </div>
          </div>

          {/* Win/Loss Bar */}
          <div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500 mb-0.5">
              <span>{results.winning_trades}W</span><span>{results.losing_trades}L</span>
            </div>
            <div className="flex h-2.5 overflow-hidden">
              <div className="bg-[#00E676]" style={{ width: `${results.win_rate}%` }} />
              <div className="bg-[#FF3B30]" style={{ width: `${100 - results.win_rate}%` }} />
            </div>
          </div>

          {/* Target Check */}
          <div className={`p-2 border text-center ${results.avg_trades_per_day >= 8 && results.win_rate >= 80 ? 'border-[#00E676]/30 bg-[#00E676]/5' : 'border-[#F5A623]/30 bg-[#F5A623]/5'}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider">
              {results.avg_trades_per_day >= 8 && results.win_rate >= 80 ? (
                <span className="text-[#00E676]">TARGET MET: {results.avg_trades_per_day} trades/day, {results.win_rate}% win</span>
              ) : (
                <span className="text-[#F5A623]">{results.avg_trades_per_day} trades/day, {results.win_rate}% win (Target: 10/day, 80%)</span>
              )}
            </p>
          </div>

          {/* Daily Summary Toggle */}
          {results.daily_summary && results.daily_summary.length > 0 && (
            <>
              <button onClick={() => setShowDaily(!showDaily)}
                className="w-full py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-white border border-white/5 transition-colors"
                data-testid="backtest-toggle-daily">
                {showDaily ? 'Hide' : 'Show'} Daily Summary ({results.daily_summary.length} days)
              </button>
              {showDaily && (
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {results.daily_summary.map((day, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 px-1.5 text-[9px] border border-white/5 font-mono">
                      <span className="text-zinc-400">{day.date.slice(0, 10)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">{day.total_trades}T</span>
                        <span className="text-[#00E676]">{day.winning}W</span>
                        <span className="text-[#FF3B30]">{day.losing}L</span>
                        <span className={`font-bold ${day.win_rate >= 80 ? 'text-[#00E676]' : day.win_rate >= 60 ? 'text-[#F5A623]' : 'text-[#FF3B30]'}`}>
                          {day.win_rate}%
                        </span>
                        <span className={day.day_pnl >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}>
                          {day.day_pnl >= 0 ? '+' : ''}{day.day_pnl}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Trades Toggle */}
          {results.trades.length > 0 && (
            <>
              <button onClick={() => setShowTrades(!showTrades)}
                className="w-full py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-white border border-white/5 transition-colors"
                data-testid="backtest-toggle-trades">
                {showTrades ? 'Hide' : 'Show'} Trades ({results.trades.length})
              </button>
              {showTrades && (
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {results.trades.map((trade, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 px-1.5 text-[9px] border border-white/5 font-mono">
                      <div className="flex items-center gap-1">
                        {trade.pnl_pct >= 0 ? <TrendUp size={8} className="text-[#00E676]" weight="bold" /> : <TrendDown size={8} className="text-[#FF3B30]" weight="bold" />}
                        <span className="text-zinc-500">{trade.entry_date.slice(0, 16)}</span>
                        {trade.strategy && <span className="text-zinc-600 text-[8px]">[{trade.strategy.slice(0,3).toUpperCase()}]</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">{trade.entry_price} &rarr; {trade.exit_price}</span>
                        <span className={trade.pnl_pct >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}>
                          {trade.pnl_pct >= 0 ? '+' : ''}{trade.pnl_pct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="text-center py-3">
          <p className="text-[10px] text-zinc-500 mb-1">Target: 10 trades/day, 80%+ win rate</p>
          <p className="text-[9px] text-zinc-600">Select ALL strategies + Intraday for best results</p>
        </div>
      )}
    </div>
  );
};

export default BacktestModule;
