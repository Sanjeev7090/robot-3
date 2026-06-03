import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Wallet, Plus, Trash, TrendUp, TrendDown } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PortfolioTracker = ({ selectedStock }) => {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ buy_price: '', quantity: '', buy_date: '' });
  const [loading, setLoading] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    try {
      const [entriesRes, summaryRes] = await Promise.all([
        axios.get(`${API}/portfolio`),
        axios.get(`${API}/portfolio/summary`)
      ]);
      setEntries(entriesRes.data.entries || []);
      setSummary(summaryRes.data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  const addEntry = async () => {
    if (!selectedStock || !form.buy_price || !form.quantity) { toast.error('Fill all fields'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/portfolio`, {
        ticker: selectedStock.ticker,
        name: selectedStock.name,
        buy_price: parseFloat(form.buy_price),
        quantity: parseInt(form.quantity),
        buy_date: form.buy_date || null
      });
      toast.success('Added to portfolio');
      setShowAdd(false);
      setForm({ buy_price: '', quantity: '', buy_date: '' });
      fetchPortfolio();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setLoading(false); }
  };

  const removeEntry = async (id) => {
    try {
      await axios.delete(`${API}/portfolio/${id}`);
      toast.success('Removed');
      fetchPortfolio();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="p-3" data-testid="portfolio-tracker">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-[#007AFF]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Portfolio</span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} disabled={!selectedStock}
          className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
          data-testid="portfolio-add-btn">
          <Plus size={10} weight="bold" />
        </button>
      </div>

      {/* Summary */}
      {summary && summary.holdings_count > 0 && (
        <div className="border border-white/10 p-2 mb-3 animate-fade-in" data-testid="portfolio-summary">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <p className="text-zinc-500">Invested</p>
              <p className="font-mono font-bold text-white">{summary.total_invested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-zinc-500">Current</p>
              <p className="font-mono font-bold text-white">{summary.total_current.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-zinc-500">P&L</p>
              <p className={`font-mono font-bold ${summary.total_pnl >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                {summary.total_pnl >= 0 ? '+' : ''}{summary.total_pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Return</p>
              <p className={`font-mono font-bold ${summary.total_pnl_pct >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                {summary.total_pnl_pct >= 0 ? '+' : ''}{summary.total_pnl_pct.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAdd && selectedStock && (
        <div className="border border-white/10 p-2 mb-3 space-y-2 animate-fade-in" data-testid="portfolio-add-form">
          <p className="text-[10px] font-mono text-[#007AFF]">{selectedStock.ticker}</p>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="Buy Price" value={form.buy_price}
              onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
              className="bg-black border border-white/10 px-2 py-1 text-[10px] font-mono text-white placeholder:text-zinc-600 outline-none focus:border-white/40"
              data-testid="portfolio-buy-price" />
            <input type="number" placeholder="Qty" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="bg-black border border-white/10 px-2 py-1 text-[10px] font-mono text-white placeholder:text-zinc-600 outline-none focus:border-white/40"
              data-testid="portfolio-quantity" />
          </div>
          <input type="date" value={form.buy_date}
            onChange={(e) => setForm({ ...form, buy_date: e.target.value })}
            className="w-full bg-black border border-white/10 px-2 py-1 text-[10px] font-mono text-white outline-none focus:border-white/40"
            data-testid="portfolio-buy-date" />
          <button onClick={addEntry} disabled={loading}
            className="w-full py-1 text-[10px] font-bold uppercase tracking-wider bg-[#007AFF] text-white hover:bg-[#0060CC] transition-colors disabled:opacity-50"
            data-testid="portfolio-submit">
            {loading ? 'Adding...' : 'Add Position'}
          </button>
        </div>
      )}

      {/* Holdings */}
      {entries.length === 0 ? (
        <p className="text-[10px] text-zinc-600 text-center py-4">No holdings yet</p>
      ) : (
        <div className="space-y-0.5">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 px-2 border border-white/5 hover:border-white/10 transition-colors group" data-testid={`portfolio-entry-${idx}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono font-bold text-white">{entry.ticker.replace('.NS', '')}</span>
                  <span className="text-[8px] text-zinc-600">x{entry.quantity}</span>
                </div>
                <span className="text-[9px] text-zinc-500 font-mono">Avg: {entry.buy_price}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {entry.pnl != null && (
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-white">{entry.current_price}</p>
                    <p className={`text-[9px] font-mono flex items-center gap-0.5 ${entry.pnl >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                      {entry.pnl >= 0 ? <TrendUp size={8} weight="bold" /> : <TrendDown size={8} weight="bold" />}
                      {entry.pnl >= 0 ? '+' : ''}{entry.pnl_pct?.toFixed(2)}%
                    </p>
                  </div>
                )}
                <button onClick={() => removeEntry(entry.id)}
                  className="text-zinc-700 hover:text-[#FF3B30] opacity-0 group-hover:opacity-100 transition-all"
                  data-testid={`portfolio-remove-${idx}`}>
                  <Trash size={10} weight="bold" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortfolioTracker;
