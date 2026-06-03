import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calculator } from '@phosphor-icons/react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SquareOf9Calculator = ({ currentPrice }) => {
  const [targets, setTargets] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentPrice) calculateTargets(currentPrice);
  }, [currentPrice]);

  const calculateTargets = async (price) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/square-of-9`, { params: { center_price: price } });
      setTargets(response.data);
    } catch (error) {
      toast.error('Failed to calculate targets');
    } finally {
      setLoading(false);
    }
  };

  if (!targets) return null;

  return (
    <div className="p-3 animate-fade-in" data-testid="square-of-9">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={14} className="text-[#F5A623]" weight="bold" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Square of 9</span>
      </div>

      {loading ? (
        <p className="text-[10px] text-zinc-500 font-mono animate-pulse">Calculating...</p>
      ) : (
        <div className="space-y-2">
          <div className="text-center py-1 border border-white/10 bg-white/5">
            <p className="text-[10px] text-zinc-500">Center</p>
            <p className="text-sm font-mono font-bold text-white">{targets.center_price.toFixed(2)}</p>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[#00E676] mb-1">Resistance</p>
              {['resistance_3', 'resistance_2', 'resistance_1'].map((key, idx) => (
                <div key={key} className="flex justify-between py-0.5 text-[10px] font-mono border-b border-white/5">
                  <span className="text-zinc-500">R{3 - idx}</span>
                  <span className="text-white">{targets.targets[key].toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-[#FF3B30] mb-1">Support</p>
              {['support_1', 'support_2', 'support_3'].map((key, idx) => (
                <div key={key} className="flex justify-between py-0.5 text-[10px] font-mono border-b border-white/5">
                  <span className="text-zinc-500">S{idx + 1}</span>
                  <span className="text-white">{targets.targets[key].toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SquareOf9Calculator;
