import React, { useState } from 'react';
import axios from 'axios';
import { ChartBar, TrendUp, TrendDown } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OIAnalysis = ({ symbol }) => {
  const [oiData, setOiData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchOI = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/nse/oi/${symbol}`);
      setOiData(response.data);
      toast.success('OI data loaded');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load OI data');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)}L`;
    return num.toLocaleString('en-IN');
  };

  return (
    <div className="p-3" data-testid="oi-analysis">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ChartBar size={14} className="text-[#007AFF]" weight="bold" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Open Interest</span>
        </div>
        <button
          onClick={fetchOI}
          disabled={loading}
          className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-white text-black hover:bg-zinc-200 transition-colors disabled:opacity-50"
          data-testid="fetch-oi-btn"
        >
          {loading ? 'Loading...' : 'Fetch OI'}
        </button>
      </div>

      {oiData && (
        <div className="animate-fade-in space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-black"
              style={{ backgroundColor: oiData.signal === 'BULLISH' ? '#00E676' : oiData.signal === 'BEARISH' ? '#FF3B30' : '#F5A623' }}
              data-testid="oi-signal"
            >
              {oiData.signal}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><p className="text-zinc-500">Call OI</p><p className="font-mono font-bold">{formatNumber(oiData.total_call_oi)}</p></div>
            <div><p className="text-zinc-500">Put OI</p><p className="font-mono font-bold">{formatNumber(oiData.total_put_oi)}</p></div>
            <div><p className="text-zinc-500">PCR</p><p className="font-mono font-bold">{oiData.pcr.toFixed(2)}</p></div>
          </div>

          {oiData.top_strikes.length > 0 && (
            <div className="mt-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Top Strikes</p>
              {oiData.top_strikes.slice(0, 5).map((strike, idx) => (
                <div key={idx} className="flex justify-between py-0.5 text-[10px] font-mono border-b border-white/5">
                  <span className="text-white">{strike.strike}</span>
                  <span className="text-[#00E676]">CE:{formatNumber(strike.call_oi)}</span>
                  <span className="text-[#FF3B30]">PE:{formatNumber(strike.put_oi)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OIAnalysis;
