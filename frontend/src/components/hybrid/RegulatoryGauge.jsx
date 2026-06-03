import { Shield } from "@phosphor-icons/react";

export default function RegulatoryGauge({ data }) {
  if (!data) {
    return (
      <div className="qsc-card p-5" data-testid="regulatory-gauge">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-3 flex items-center gap-2">
          <Shield size={13} className="text-neutral-400" />
          Regulatory Watchdog
        </div>
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-3 bg-white/5 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Gauge angle: score -1..1 → angle -90..+90 (pointing left = hostile, right = supportive)
  const angle = (data.score + 1) / 2 * 180 - 90;
  const color = data.score > 0.2 ? "#3366FF" : data.score < -0.2 ? "#FF3333" : "#FFCC00";

  // Indian market specific color coding
  const getHeadlineColor = (weight) => {
    if (weight > 0.3) return "#3366FF";
    if (weight < -0.2) return "#FF3333";
    return "#FFCC00";
  };

  return (
    <div className="qsc-card" data-testid="regulatory-gauge">
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
        <Shield size={13} className="text-neutral-400" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Regulatory Watchdog</span>
        <span className="ml-auto text-[8px] font-mono text-neutral-600">GLOBAL + IN</span>
      </div>

      <div className="p-4">
        {/* Semi-circle gauge */}
        <div className="relative w-full flex items-end justify-center" style={{ height: 90 }}>
          <svg viewBox="0 0 200 110" className="w-full h-full">
            {/* Background arc */}
            <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" strokeLinecap="round"/>
            {/* Hostile zone */}
            <path d="M 10 100 A 90 90 0 0 1 100 10" fill="none" stroke="rgba(255,51,51,0.25)" strokeWidth="14" strokeLinecap="butt"/>
            {/* Neutral zone */}
            <path d="M 85 11 A 90 90 0 0 1 115 11" fill="none" stroke="rgba(255,204,0,0.3)" strokeWidth="14" strokeLinecap="butt"/>
            {/* Supportive zone */}
            <path d="M 100 10 A 90 90 0 0 1 190 100" fill="none" stroke="rgba(51,102,255,0.25)" strokeWidth="14" strokeLinecap="butt"/>
            {/* Needle */}
            <line
              x1="100" y1="100"
              x2={100 + 72 * Math.cos((angle - 90) * Math.PI / 180)}
              y2={100 + 72 * Math.sin((angle - 90) * Math.PI / 180)}
              stroke={color} strokeWidth="2.5" strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="5" fill={color} />
            <circle cx="100" cy="100" r="2" fill="#0A0A0A" />
            {/* Labels */}
            <text x="10" y="115" fill="rgba(255,51,51,0.6)" fontSize="9" fontFamily="monospace">HOSTILE</text>
            <text x="155" y="115" fill="rgba(51,102,255,0.6)" fontSize="9" fontFamily="monospace">SUPPORT</text>
          </svg>
        </div>

        {/* Score display */}
        <div className="text-center mt-1 mb-3">
          <div className="text-xl font-bold tracking-tight" style={{ color }} data-testid="reg-label">
            {data.label}
          </div>
          <div className="text-[9px] font-mono text-neutral-500 mt-0.5">
            Score <span style={{ color }}>{data.score > 0 ? "+" : ""}{data.score}</span>
            &nbsp;·&nbsp;Multiplier <span className="text-white">{data.aggressiveness_multiplier}×</span>
          </div>
        </div>

        {/* Indian market indicator */}
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-white/[0.03] border border-white/5">
          <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-wider">🇮🇳 NSE/BSE</span>
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-[9px] font-mono" style={{ color }}>
            {data.score > 0.2 ? "POSITIVE FLOW" : data.score < -0.2 ? "RISK-OFF" : "NEUTRAL"}
          </span>
        </div>

        {/* Headlines */}
        <div className="space-y-2">
          {(data.headlines || []).slice(0, 4).map((h, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: getHeadlineColor(h.weight) }} />
              <div className="min-w-0">
                <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-500">{h.src}</span>
                <p className="text-[9px] font-mono text-neutral-300 leading-tight mt-0.5 truncate" title={h.headline}>
                  {h.headline}
                </p>
              </div>
              <span className="text-[9px] font-mono shrink-0 ml-auto" style={{ color: getHeadlineColor(h.weight) }}>
                {h.weight > 0 ? "+" : ""}{h.weight}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
