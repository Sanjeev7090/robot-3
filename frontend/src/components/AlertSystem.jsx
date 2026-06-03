import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bell, BellRinging, Plus, Trash, TrendUp, TrendDown, Lightning } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AlertSystem = ({ selectedStock }) => {
  const [alerts, setAlerts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ alert_type: 'price_above', threshold: '' });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/alerts`);
      setAlerts(res.data.alerts || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Auto-check alerts every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.post(`${API}/alerts/check`);
        if (res.data.triggered?.length > 0) {
          res.data.triggered.forEach(a => {
            toast.success(`Alert Triggered: ${a.ticker} - ${a.alert_type} at ${a.current_price}`, { duration: 8000 });
          });
          fetchAlerts();
        }
      } catch { /* silent */ }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const createAlert = async () => {
    if (!selectedStock) { toast.error('Select a stock first'); return; }
    if ((form.alert_type === 'price_above' || form.alert_type === 'price_below') && !form.threshold) {
      toast.error('Set a price threshold'); return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/alerts`, {
        ticker: selectedStock.ticker,
        name: selectedStock.name,
        alert_type: form.alert_type,
        threshold: form.threshold ? parseFloat(form.threshold) : null
      });
      toast.success('Alert created');
      setShowAdd(false);
      setForm({ alert_type: 'price_above', threshold: '' });
      fetchAlerts();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setLoading(false); }
  };

  const deleteAlert = async (id) => {
    try {
      await axios.delete(`${API}/alerts/${id}`);
      setAlerts(prev => prev.filter(a => a.id !== id));
      toast.success('Alert deleted');
    } catch { toast.error('Failed'); }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await axios.post(`${API}/alerts/check`);
      if (res.data.triggered?.length > 0) {
        res.data.triggered.forEach(a => {
          toast.success(`Triggered: ${a.ticker} - ${a.alert_type}`, { duration: 8000 });
        });
        fetchAlerts();
      } else {
        toast.info(`Checked ${res.data.checked} alerts - none triggered`);
      }
    } catch { toast.error('Check failed'); }
    finally { setChecking(false); }
  };

  const alertTypeLabel = (type) => {
    const labels = { price_above: 'Price Above', price_below: 'Price Below', demon_buy: 'DEMON BUY', demon_sell: 'DEMON SELL' };
    return labels[type] || type;
  };

  const alertTypeColor = (type) => {
    if (type.includes('buy') || type === 'price_above') return '#00E676';
    if (type.includes('sell') || type === 'price_below') return '#FF3B30';
    return '#F5A623';
  };

  return (
    <div className="p-3" data-testid="alert-system">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BellRinging size={14} className="text-[#F5A623]" weight="fill" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Alerts</span>
          <span className="text-[9px] text-zinc-600 font-mono">{alerts.filter(a => !a.triggered).length} active</span>
        </div>
        <div className="flex gap-1">
          <button onClick={checkNow} disabled={checking}
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
            data-testid="alert-check-btn">
            {checking ? '...' : 'CHECK'}
          </button>
          <button onClick={() => setShowAdd(!showAdd)} disabled={!selectedStock}
            className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#F5A623] text-black hover:bg-[#E09600] transition-colors disabled:opacity-50"
            data-testid="alert-create-btn">
            <Plus size={10} weight="bold" />
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAdd && selectedStock && (
        <div className="border border-white/10 p-2 mb-3 space-y-2 animate-fade-in" data-testid="alert-add-form">
          <p className="text-[10px] font-mono text-[#F5A623]">{selectedStock.ticker}</p>
          <select value={form.alert_type}
            onChange={(e) => setForm({ ...form, alert_type: e.target.value })}
            className="w-full bg-black border border-white/10 px-2 py-1 text-[10px] font-mono text-white outline-none focus:border-white/40"
            data-testid="alert-type-select">
            <option value="price_above">Price Above</option>
            <option value="price_below">Price Below</option>
            <option value="demon_buy">DEMON BUY Signal</option>
            <option value="demon_sell">DEMON SELL Signal</option>
          </select>
          {(form.alert_type === 'price_above' || form.alert_type === 'price_below') && (
            <input type="number" placeholder="Target Price" value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              className="w-full bg-black border border-white/10 px-2 py-1 text-[10px] font-mono text-white placeholder:text-zinc-600 outline-none focus:border-white/40"
              data-testid="alert-threshold" />
          )}
          <button onClick={createAlert} disabled={loading}
            className="w-full py-1 text-[10px] font-bold uppercase tracking-wider bg-[#F5A623] text-black hover:bg-[#E09600] transition-colors disabled:opacity-50"
            data-testid="alert-submit">
            {loading ? 'Creating...' : 'Create Alert'}
          </button>
        </div>
      )}

      {/* Alert List */}
      {alerts.length === 0 ? (
        <p className="text-[10px] text-zinc-600 text-center py-4">No alerts set</p>
      ) : (
        <div className="space-y-0.5">
          {alerts.map((alert, idx) => (
            <div key={idx}
              className={`flex items-center justify-between py-1.5 px-2 border transition-colors group ${alert.triggered ? 'border-[#F5A623]/30 bg-[#F5A623]/5' : 'border-white/5 hover:border-white/10'}`}
              data-testid={`alert-item-${idx}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {alert.triggered ? <BellRinging size={10} className="text-[#F5A623]" weight="fill" /> : <Bell size={10} className="text-zinc-500" />}
                  <span className="text-[10px] font-mono font-bold text-white">{alert.ticker.replace('.NS', '')}</span>
                  <span className="text-[8px] px-1 py-0.5 font-bold uppercase tracking-wider" style={{ color: alertTypeColor(alert.alert_type), borderColor: alertTypeColor(alert.alert_type) + '40', borderWidth: 1 }}>
                    {alertTypeLabel(alert.alert_type)}
                  </span>
                </div>
                {alert.threshold && <span className="text-[9px] text-zinc-500 font-mono">@ {alert.threshold}</span>}
                {alert.triggered && <span className="text-[9px] text-[#F5A623] font-mono block">Triggered!</span>}
              </div>
              <button onClick={() => deleteAlert(alert.id)}
                className="text-zinc-700 hover:text-[#FF3B30] opacity-0 group-hover:opacity-100 transition-all shrink-0"
                data-testid={`alert-delete-${idx}`}>
                <Trash size={10} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertSystem;
