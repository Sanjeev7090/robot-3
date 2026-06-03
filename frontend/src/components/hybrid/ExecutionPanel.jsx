import { useState } from "react";
import { RocketIcon as Rocket } from "@phosphor-icons/react";

export default function ExecutionPanel({ symbol, onExecute, regulatory }) {
  const [volume, setVolume] = useState(0.05);
  const [staggered, setStaggered] = useState(true);
  const mult = regulatory?.aggressiveness_multiplier ?? 1.0;

  const submit = (direction) => {
    onExecute({ symbol, direction, volume: Number(volume), use_staggered: staggered });
  };

  return (
    <div className="qsc-card" data-testid="execution-panel">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Paper Execution</span>
        <Rocket size={14} className="text-neutral-400" />
      </div>
      <div className="p-4 space-y-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Symbol</div>
          <div className="font-mono text-white text-sm" data-testid="exec-symbol">{symbol}</div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">Volume</div>
          <input
            type="number" step="0.001" min="0.001"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="input-line"
            data-testid="exec-volume-input"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-mono text-neutral-300 cursor-pointer">
          <input
            type="checkbox" checked={staggered}
            onChange={(e) => setStaggered(e.target.checked)}
            className="accent-white"
            data-testid="exec-staggered-toggle"
          />
          <span>Staggered across 3 venues</span>
        </label>
        <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
          Regulatory mult: <span className="text-white">{mult.toFixed(2)}x</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => submit("LONG")} className="btn-flat btn-long" data-testid="execute-long-btn">▲ Long</button>
          <button onClick={() => submit("SHORT")} className="btn-flat btn-short" data-testid="execute-short-btn">▼ Short</button>
        </div>
        <p className="text-[10px] font-mono text-neutral-600 leading-relaxed">
          Simulation only. No real orders are routed. Staggered execution models 3 venues with sub-microsecond latency offsets.
        </p>
      </div>
    </div>
  );
}
