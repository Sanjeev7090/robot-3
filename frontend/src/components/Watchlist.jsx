import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Star, Plus, Trash, ArrowUp, ArrowDown, Minus } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Watchlist = ({ onStockSelect, selectedStock }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/watchlist/prices`);
      setItems(res.data.items || []);
    } catch {
      const res = await axios.get(`${API}/watchlist`);
      setItems(res.data.items || []);
    }
  }, []);

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  const addToWatchlist = async () => {
    if (!selectedStock) { toast.error('Select a stock first'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/watchlist`, {
        ticker: selectedStock.ticker,
        name: selectedStock.name,
        stock_type: selectedStock.type || 'STOCK'
      });
      toast.success(`${selectedStock.ticker} added to watchlist`);
      fetchWatchlist();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add');
    } finally { setLoading(false); }
  };

  const removeFromWatchlist = async (ticker) => {
    try {
      await axios.delete(`${API}/watchlist/${ticker}`);
      toast.success('Removed');
      setItems(prev => prev.filter(i => i.ticker !== ticker));
    } catch { toast.error('Failed to remove'); }
  };

  const refreshPrices = async () => {
    setPricesLoading(true);
    try {
      const res = await axios.get(`${API}/watchlist/prices`);
      setItems(res.data.items || []);
      toast.success('Prices updated');
    } catch { toast.error('Failed to refresh'); }
    finally { setPricesLoading(false); }
  };

  return (
    <div className="p-3" data-testid="watchlist">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star size={14} className="text-[#F5A623]" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Watchlist</span>
          <span className="text-[9px] text-zinc-600 font-mono">{items.length}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={refreshPrices} disabled={pricesLoading}
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
            data-testid="watchlist-refresh">
            {pricesLoading ? '...' : 'REFRESH'}
          </button>
          <button onClick={addToWatchlist} disabled={loading || !selectedStock}
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#F5A623] text-black hover:bg-[#E09600] transition-colors disabled:opacity-50"
            data-testid="watchlist-add-btn">
            <Plus size={10} weight="bold" />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-[10px] text-zinc-600 text-center py-4">Add stocks to your watchlist</p>
      ) : (
        <div className="space-y-0.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 px-2 border border-white/5 hover:border-white/10 transition-colors group" data-testid={`watchlist-item-${idx}`}>
              <button onClick={() => onStockSelect({ ticker: item.ticker, name: item.name, type: item.stock_type })} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                <div className="min-w-0">
                  <span className="text-[10px] font-mono font-bold text-white block truncate">{item.ticker.replace('.NS', '')}</span>
                  <span className="text-[9px] text-zinc-600 block truncate">{item.name}</span>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {item.price != null && (
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-white">{item.price}</p>
                    <p className={`text-[9px] font-mono flex items-center gap-0.5 ${item.change_pct >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}`}>
                      {item.change_pct >= 0 ? <ArrowUp size={8} weight="bold" /> : <ArrowDown size={8} weight="bold" />}
                      {Math.abs(item.change_pct || 0).toFixed(2)}%
                    </p>
                  </div>
                )}
                <button onClick={(e) => { e.stopPropagation(); removeFromWatchlist(item.ticker); }}
                  className="text-zinc-700 hover:text-[#FF3B30] opacity-0 group-hover:opacity-100 transition-all"
                  data-testid={`watchlist-remove-${idx}`}>
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

export default Watchlist;
