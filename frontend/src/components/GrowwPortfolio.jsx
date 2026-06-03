import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Wallet, ArrowsClockwise } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const GrowwPortfolio = () => {
  const [tab, setTab] = useState('holdings');
  const [holdings, setHoldings] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [margin, setMargin] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, p, o, m] = await Promise.allSettled([
        axios.get(`${API}/groww/holdings`),
        axios.get(`${API}/groww/positions`),
        axios.get(`${API}/groww/orders`),
        axios.get(`${API}/groww/margin`),
      ]);
      if (h.status === 'fulfilled') setHoldings(h.value.data.holdings || []);
      if (p.status === 'fulfilled') setPositions(p.value.data.positions || []);
      if (o.status === 'fulfilled') setOrders(o.value.data.orders || []);
      if (m.status === 'fulfilled') setMargin(m.value.data || null);
    } catch (e) {
      toast.error('Failed to load Groww data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cancel = async (orderId) => {
    try {
      await axios.delete(`${API}/groww/orders/${orderId}`);
      toast.success('Order cancelled');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cancel failed');
    }
  };

  const tabs = [
    { id: 'holdings', label: `HOLDINGS (${holdings.length})` },
    { id: 'positions', label: `POSITIONS (${positions.length})` },
    { id: 'orders', label: `ORDERS (${orders.length})` },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="groww-portfolio">
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Wallet size={14} weight="fill" className="text-[#00E676]" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Groww Account</span>
        </div>
        <button onClick={load} className="p-1 hover:bg-white/10" data-testid="groww-refresh">
          <ArrowsClockwise size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {margin && (
        <div className="px-3 py-2 border-b border-white/10 grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div>
            <div className="text-zinc-500 uppercase tracking-widest text-[9px]">Available</div>
            <div className="text-[#00E676]">₹{num(margin.equity_margin_details?.cnc_balance_available ?? margin.clear_cash)}</div>
          </div>
          <div>
            <div className="text-zinc-500 uppercase tracking-widest text-[9px]">Used</div>
            <div className="text-[#FF3B30]">₹{num(margin.net_margin_used)}</div>
          </div>
        </div>
      )}

      <div className="flex border-b border-white/10 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-widest ${
              tab === t.id ? 'text-white border-b-2 border-[#00E676] bg-white/5' : 'text-zinc-500'
            }`}
            data-testid={`groww-tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'holdings' && (
          holdings.length === 0
            ? <div className="p-6 text-center text-xs text-zinc-500">No holdings</div>
            : holdings.map((h, i) => (
              <div key={i} className="p-3 border-b border-white/5" data-testid={`groww-holding-${i}`}>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold">{h.trading_symbol || h.isin}</span>
                  <span className="text-xs font-mono">Qty {num(h.quantity)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-0.5">
                  <span>Avg ₹{num(h.average_price)}</span>
                  <span>Free {num(h.demat_free_quantity)}</span>
                </div>
              </div>
            ))
        )}

        {tab === 'positions' && (
          positions.length === 0
            ? <div className="p-6 text-center text-xs text-zinc-500">No open positions</div>
            : positions.map((p, i) => (
              <div key={i} className="p-3 border-b border-white/5" data-testid={`groww-position-${i}`}>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold">{p.trading_symbol}</span>
                  <span className="text-xs font-mono">Net {num(p.net_quantity || p.quantity)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-0.5">
                  <span>Avg ₹{num(p.average_price || p.net_price)}</span>
                  <span className={Number(p.pnl) >= 0 ? 'text-[#00E676]' : 'text-[#FF3B30]'}>
                    P&L ₹{num(p.pnl)}
                  </span>
                </div>
              </div>
            ))
        )}

        {tab === 'orders' && (
          orders.length === 0
            ? <div className="p-6 text-center text-xs text-zinc-500">No orders today</div>
            : orders.map((o, i) => (
              <div key={i} className="p-3 border-b border-white/5" data-testid={`groww-order-${i}`}>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold">
                    <span className={o.transaction_type === 'BUY' ? 'text-[#00E676]' : 'text-[#FF3B30]'}>
                      {o.transaction_type}
                    </span>{' '}
                    {o.trading_symbol}
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.5 border border-white/10">{o.order_status}</span>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-0.5">
                  <span>{o.order_type} · Qty {o.quantity}</span>
                  <span>₹{num(o.price)}</span>
                </div>
                {['NEW', 'PLACED', 'OPEN', 'TRIGGER_PENDING'].includes(o.order_status) && (
                  <button onClick={() => cancel(o.groww_order_id || o.order_id)}
                    className="mt-1 text-[10px] text-[#FF3B30] hover:underline">
                    Cancel
                  </button>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );
};

export default GrowwPortfolio;
