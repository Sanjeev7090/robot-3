import { AtomIcon as Atom, SparkleIcon as Sparkle } from "@phosphor-icons/react";

export default function QSCSignalPanel({ signals, selectedSymbol, onGenerate, loading }) {
  const latest = signals[0];
  return (
    <div className="qsc-card relative overflow-hidden" data-testid="qsc-signal-panel">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: "url('https://static.prod-images.emergentagent.com/jobs/3708009e-bb32-4bd9-823f-efdc36240f59/images/ae169434903b10d3309fc02ad3eedeac66108fd2a9754903bc718ab363d8cdf6.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 bg-black/70 pointer-events-none" />
      <div className="relative">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Atom size={14} className="text-[#3366FF]" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-300">QSC Signal</span>
          </div>
          <button
            onClick={onGenerate}
            disabled={loading}
            data-testid="generate-signal-btn"
            className="btn-flat text-[10px] px-3 py-1.5 flex items-center gap-1.5"
          >
            <Sparkle size={12} /> {loading ? "Computing..." : "Generate"}
          </button>
        </div>
        <div className="p-4 space-y-3">
          {latest ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Direction</div>
                  <div
                    className="font-display text-4xl tracking-tighter"
                    style={{ color: latest.direction === "LONG" ? "#3366FF" : latest.direction === "SHORT" ? "#FF3333" : "#FFCC00" }}
                    data-testid="signal-direction"
                  >
                    {latest.direction}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Confidence</div>
                  <div className="font-mono text-2xl text-white" data-testid="signal-confidence">{(latest.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Anchor" value={latest.anchor_asset} accent />
                <Stat label="Bridge" value={latest.bridge_asset} />
                <Stat label="Amp" value={latest.amplifier_asset} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <Stat label="Momentum" value={latest.momentum_score} />
                <Stat label="Risk Transfer" value={latest.risk_transfer_score} />
              </div>
              <div className="border-t border-white/10 pt-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 mb-1">AI Reasoning</div>
                <div className="text-xs font-mono text-neutral-300 leading-relaxed" data-testid="signal-reasoning">{latest.reasoning}</div>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="text-xs font-mono text-neutral-500 mb-2">No signal computed yet.</div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-600">Target: {selectedSymbol}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="border border-white/10 p-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`font-mono text-xs ${accent ? "text-[#3366FF]" : "text-white"} truncate`}>{value}</div>
    </div>
  );
}
