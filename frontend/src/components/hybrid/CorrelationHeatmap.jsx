import { Fragment, useMemo, useState } from "react";

function colorFor(v) {
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) return `rgba(51,102,255,${0.12 + t * 0.78})`;
  return `rgba(255,51,51,${0.12 + (-t) * 0.78})`;
}

const SHORT_NAME = {
  BTCUSDT: "BTC", ETHUSDT: "ETH", SOLUSDT: "SOL", ADAUSDT: "ADA",
  SPY: "SPY", QQQ: "QQQ", NVDA: "NVDA", XAU: "XAU", WTI: "WTI",
  DXY: "DXY", US10Y: "10Y", VIX: "VIX",
  RELIANCE: "REL", TCS: "TCS", INFY: "INF", HDFCBANK: "HDF", NIFTY50: "NIFTY",
};

export default function CorrelationHeatmap({ data }) {
  const { symbols = [], cells = [] } = data || {};
  const [hover,    setHover]    = useState(null);
  const [mode,     setMode]     = useState("fused"); // fused | classical | quantum

  const matrix = useMemo(() => {
    const m = {};
    for (const s of symbols) m[s] = {};
    for (const c of cells) {
      m[c.a] = m[c.a] || {};
      m[c.b] = m[c.b] || {};
      m[c.a][c.b] = c;
      m[c.b][c.a] = c;
    }
    return m;
  }, [symbols, cells]);

  const getValue = (c) => {
    if (!c) return 0;
    if (mode === "classical") return c.classical ?? 0;
    if (mode === "quantum")   return c.quantum   ?? 0;
    return c.fused ?? 0;
  };

  const getDiagValue = (sym) => {
    const c = matrix[sym]?.[sym];
    if (!c) return null;
    if (mode === "classical") return c.classical ?? 1.0;
    if (mode === "quantum")   return c.quantum   ?? null;
    return c.fused ?? null;
  };

  if (!symbols.length) {
    return (
      <div className="qsc-card p-5" data-testid="correlation-heatmap">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-3">
          Correlation Matrix
        </div>
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-3 bg-white/5 animate-pulse rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="qsc-card" data-testid="correlation-heatmap">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Correlation Matrix
          </span>
          <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-neutral-500">
            {mode === "fused" ? "Classical × Quantum Kernel" : mode === "classical" ? "Classical Pearson" : "Quantum Kernel"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {["classical", "quantum", "fused"].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`text-[8px] font-bold uppercase tracking-widest px-2 py-1 border transition-colors ${
                mode === m
                  ? "border-white/40 text-white bg-white/10"
                  : "border-white/10 text-neutral-500 hover:border-white/20 hover:text-neutral-300"
              }`}
              data-testid={`corr-mode-${m}`}
            >
              {m === "classical" ? "CLASSICAL" : m === "quantum" ? "QUANTUM" : "FUSED"}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-3 text-[9px] font-mono text-neutral-500">
            <span className="inline-block w-10 h-2" style={{ background: "linear-gradient(to right, rgba(255,51,51,0.9), rgba(255,255,255,0.1), rgba(51,102,255,0.9))" }} />
            <span>−1 → +1</span>
          </div>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="p-3 overflow-x-auto">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `56px repeat(${symbols.length}, minmax(36px, 1fr))` }}
          data-testid="corr-grid"
        >
          {/* Column headers */}
          <div />
          {symbols.map(s => (
            <div key={`h-${s}`}
              className="text-[8px] font-mono text-neutral-500 text-center py-1 truncate"
              title={s}
            >
              {SHORT_NAME[s] || s.slice(0, 5)}
            </div>
          ))}

          {/* Rows */}
          {symbols.map(row => (
            <Fragment key={`row-${row}`}>
              {/* Row label */}
              <div
                className="text-[8px] font-mono text-neutral-500 py-1 pr-1 truncate flex items-center"
                title={row}
              >
                {SHORT_NAME[row] || row.slice(0, 5)}
              </div>

              {/* Cells */}
              {symbols.map(col => {
                const c = matrix[row]?.[col];
                const v = getValue(c);
                const isDiag = row === col;
                const diagVal = isDiag ? getDiagValue(row) : null;
                return (
                  <div
                    key={`${row}-${col}`}
                    className="heat-cell relative"
                    style={{
                      background: isDiag
                        ? (diagVal !== null ? colorFor(diagVal) : "rgba(255,255,255,0.06)")
                        : colorFor(v),
                      aspectRatio: "1",
                      minHeight: 28,
                    }}
                    onMouseEnter={() => setHover({ row, col, c })}
                    onMouseLeave={() => setHover(null)}
                    data-testid={`heat-${row}-${col}`}
                  >
                    <span className="text-[7.5px] font-mono" style={{ color: isDiag ? "#fff" : (Math.abs(v) > 0.5 ? "#fff" : "#aaa") }}>
                      {isDiag
                        ? (diagVal !== null ? diagVal.toFixed(2) : "—")
                        : v.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>

        {/* Hover tooltip */}
        {hover?.c && (
          <div className="mt-3 pt-3 border-t border-white/10 font-mono text-[10px] text-neutral-300 flex flex-wrap items-center gap-4">
            {hover.row === hover.col ? (
              <>
                <span><span className="text-neutral-500">ASSET</span> <span className="text-white font-bold">{hover.row}</span></span>
                <span><span className="text-amber-400 font-bold">AUTOCORR LAG-1</span></span>
                <span><span className="text-neutral-500">CLASSICAL</span> <span style={{ color: (hover.c.classical ?? 0) >= 0 ? "#3366FF" : "#FF3333" }}>{hover.c.classical?.toFixed(3)}</span></span>
                <span><span className="text-neutral-500">QUANTUM</span> <span style={{ color: (hover.c.quantum ?? 0) >= 0 ? "#3366FF" : "#FF3333" }}>{hover.c.quantum?.toFixed(3)}</span></span>
                <span><span className="text-neutral-500">FUSED</span> <span className="text-white font-bold">{hover.c.fused?.toFixed(3)}</span></span>
                <span className="text-neutral-600 text-[8px]">+= momentum · −= mean-revert</span>
              </>
            ) : (
              <>
                <span><span className="text-neutral-500">PAIR</span> <span className="text-white">{hover.row}</span> ↔ <span className="text-white">{hover.col}</span></span>
                <span><span className="text-neutral-500">CLASSICAL</span> <span style={{ color: colorFor(hover.c.classical ?? 0).includes("255,51") ? "#FF3333" : "#3366FF" }}>{hover.c.classical?.toFixed(3)}</span></span>
                <span><span className="text-neutral-500">QUANTUM</span> <span style={{ color: colorFor(hover.c.quantum ?? 0).includes("255,51") ? "#FF3333" : "#3366FF" }}>{hover.c.quantum?.toFixed(3)}</span></span>
                <span><span className="text-neutral-500">FUSED</span> <span className="text-white font-bold">{hover.c.fused?.toFixed(3)}</span></span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
