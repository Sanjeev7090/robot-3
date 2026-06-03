import React from 'react';
import { TrendUp, TrendDown, Warning } from '@phosphor-icons/react';

const SignalDashboard = ({ signal }) => {
  if (!signal) return null;

  const isBuy = signal.signal.includes('BUY');
  const isSell = signal.signal.includes('SELL');
  const color = isBuy ? '#00E676' : isSell ? '#FF3B30' : '#F5A623';

  return (
    <div className="p-3 animate-fade-in" data-testid="signal-dashboard">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Signal</span>
        <span
          className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-black"
          style={{ backgroundColor: color, animation: isBuy ? 'pulse-buy 2s infinite' : isSell ? 'pulse-sell 2s infinite' : 'none' }}
          data-testid="signal-badge"
        >
          {signal.signal}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-zinc-500">Price</p>
          <p className="text-sm font-mono font-bold" data-testid="signal-price">{signal.price.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500">1x1 Angle</p>
          <p className="text-sm font-mono" data-testid="signal-angle">{signal.angle_1x1.toFixed(2)}</p>
        </div>
      </div>
      <div className="mt-2">
        <p className="text-[10px] text-zinc-500">Diff</p>
        <p className="text-xs font-mono" style={{ color }} data-testid="price-difference">
          {signal.price > signal.angle_1x1 ? '+' : ''}{(signal.price - signal.angle_1x1).toFixed(2)}
        </p>
      </div>
    </div>
  );
};

export default SignalDashboard;
