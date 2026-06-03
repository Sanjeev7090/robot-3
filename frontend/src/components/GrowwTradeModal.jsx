import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X, Lightning } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const GrowwTradeModal = ({ ticker, currentPrice, onClose }) => {
  const symbol = (ticker || '').replace('.NS', '').replace('.BO', '');
  const exchange = (ticker || '').endsWith('.BO') ? 'BSE' : 'NSE';
  const [tx, setTx] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [product, setProduct] = useState('CNC');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(currentPrice ? currentPrice.toFixed(2) : '');
  const [trigger, setTrigger] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [margin, setMargin] = useState(null);

  useEffect(() => {
    axios.get(`${API}/groww/margin`).then(r => setMargin(r.data)).catch(() => {});
  }, []);

  const submit = async () => {
    if (qty < 1) { toast.error('Quantity must be at least 1'); return; }
    if (orderType === 'LIMIT' && !price) { toast.error('Price required for LIMIT'); return; }
    if ((orderType === 'SL' || orderType === 'SL_M') && !trigger) {
      toast.error('Trigger price required for SL'); return;
    }
    setSubmitting(true);
    try {
      const body = {
        trading_symbol: symbol,
        quantity: Number(qty),
        transaction_type: tx,
        order_type: orderType,
        product,
        exchange,
        segment: 'CASH',
        validity: 'DAY',
      };
      if (orderType === 'LIMIT' || orderType === 'SL') body.price = Number(price);
      if (orderType === 'SL' || orderType === 'SL_M') body.trigger_price = Number(trigger);
      const resp = await axios.post(`${API}/groww/orders`, body);
      const oid = resp.data?.groww_order_id || resp.data?.order_id || 'placed';
      toast.success(`Order placed: ${oid}`);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  const txColor = tx === 'BUY' ? '#00E676' : '#FF3B30';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" data-testid="groww-trade-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0D0D0D] border border-white/10 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Lightning size={14} weight="fill" className="text-[#00E676]" />
            <span className="text-xs font-black uppercase tracking-widest">Place Order · Groww</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10" data-testid="groww-trade-close">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Symbol */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 font-mono">{exchange}</span>
            <span className="text-lg font-bold text-[#00E676] font-mono">{symbol}</span>
          </div>

          {/* BUY / SELL toggle */}
          <div className="grid grid-cols-2 gap-2">
            {['BUY', 'SELL'].map(t => (
              <button key={t} onClick={() => setTx(t)}
                className={`py-2.5 text-sm font-black uppercase tracking-wider border ${
                  tx === t
                    ? (t === 'BUY' ? 'bg-[#00E676] text-black border-[#00E676]' : 'bg-[#FF3B30] text-white border-[#FF3B30]')
                    : 'text-zinc-500 border-white/10'
                }`}
                data-testid={`groww-tx-${t.toLowerCase()}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Qty */}
          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Quantity</span>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full mt-1 bg-[#141414] border border-white/10 px-3 py-2 text-sm font-mono focus:border-[#00E676] outline-none"
              data-testid="groww-qty-input" />
          </label>

          {/* Product */}
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Product</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {['CNC', 'MIS', 'NRML'].map(p => (
                <button key={p} onClick={() => setProduct(p)}
                  className={`py-2 text-xs font-bold border ${
                    product === p ? 'bg-white text-black border-white' : 'text-zinc-500 border-white/10'
                  }`}
                  data-testid={`groww-product-${p.toLowerCase()}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Order type */}
          <div>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Order Type</span>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {['MARKET', 'LIMIT', 'SL', 'SL_M'].map(o => (
                <button key={o} onClick={() => setOrderType(o)}
                  className={`py-2 text-[10px] font-bold border ${
                    orderType === o ? 'bg-white text-black border-white' : 'text-zinc-500 border-white/10'
                  }`}
                  data-testid={`groww-otype-${o.toLowerCase()}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          {(orderType === 'LIMIT' || orderType === 'SL') && (
            <label className="block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Price</span>
              <input type="number" step="0.05" value={price} onChange={e => setPrice(e.target.value)}
                className="w-full mt-1 bg-[#141414] border border-white/10 px-3 py-2 text-sm font-mono focus:border-[#00E676] outline-none"
                data-testid="groww-price-input" />
            </label>
          )}

          {(orderType === 'SL' || orderType === 'SL_M') && (
            <label className="block">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Trigger Price</span>
              <input type="number" step="0.05" value={trigger} onChange={e => setTrigger(e.target.value)}
                className="w-full mt-1 bg-[#141414] border border-white/10 px-3 py-2 text-sm font-mono focus:border-[#00E676] outline-none"
                data-testid="groww-trigger-input" />
            </label>
          )}

          {margin && (
            <div className="text-[10px] text-zinc-500 font-mono border-t border-white/10 pt-2">
              Available: ₹{Number(margin.equity_margin_details?.cnc_balance_available ?? margin.clear_cash ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              {' · '}Used: ₹{Number(margin.net_margin_used ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          )}

          <button onClick={submit} disabled={submitting}
            className="w-full py-3 font-black text-sm tracking-widest mt-2 disabled:opacity-50"
            style={{ backgroundColor: txColor, color: tx === 'BUY' ? '#000' : '#fff' }}
            data-testid="groww-submit-order">
            {submitting ? 'PLACING…' : `${tx} ${qty} @ ${orderType}`}
          </button>
          <p className="text-[9px] text-zinc-600 text-center">Live order on your Groww account.</p>
        </div>
      </div>
    </div>
  );
};

export default GrowwTradeModal;
