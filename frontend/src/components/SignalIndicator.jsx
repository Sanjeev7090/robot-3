import React from 'react';
import { TrendUp, TrendDown, Clock, Target, ShieldCheck } from '@phosphor-icons/react';

const SignalIndicator = ({ signalType, entryPrice, stopLoss, targets }) => {
  const isBuy = signalType === 'BUY';
  const isSell = signalType === 'SELL';
  const isWait = signalType === 'WAIT';

  if (isWait) {
    return (
      <div className="flex items-center gap-2 p-2 border border-white/10 bg-[#F5A623]/5" data-testid="signal-wait">
        <Clock size={14} className="text-[#F5A623]" weight="bold" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F5A623]">WAIT</span>
        <span className="text-[10px] text-zinc-500 ml-1">Conditions pending</span>
      </div>
    );
  }

  const color = isBuy ? '#00E676' : '#FF3B30';

  return (
    <div className="animate-fade-in" data-testid={`signal-${signalType.toLowerCase()}`}>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-black"
          style={{ backgroundColor: color, animation: isBuy ? 'pulse-buy 2s infinite' : 'pulse-sell 2s infinite' }}
        >
          {signalType}
        </span>
      </div>

      {(entryPrice || stopLoss || (targets && targets.length > 0)) && (
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          {entryPrice && (
            <div>
              <p className="text-zinc-500 mb-0.5">Entry</p>
              <p className="font-mono font-bold text-white">{entryPrice}</p>
            </div>
          )}
          {stopLoss && (
            <div>
              <p className="text-zinc-500 mb-0.5">SL</p>
              <p className="font-mono font-bold text-[#FF3B30]">{stopLoss}</p>
            </div>
          )}
          {targets && targets.length > 0 && (
            <div>
              <p className="text-zinc-500 mb-0.5">Targets</p>
              {targets.map((t, i) => (
                <p key={i} className="font-mono text-[#00E676]">T{i + 1}: {t}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SignalIndicator;
