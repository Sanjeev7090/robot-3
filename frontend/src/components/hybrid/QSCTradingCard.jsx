import React, { useMemo } from "react";

/* ─────────────────────────────────────────
   Cartoon: Happy Dancer (BUY)
───────────────────────────────────────── */
function HappyDancer() {
  return (
    <div className="flex flex-col items-center select-none">
      <div className="relative w-28 h-36" style={{ animation: "qsc-bounce 0.55s ease-in-out infinite" }}>
        {/* floating stars */}
        <span style={{ position:"absolute", top:-6, left:4, fontSize:16, animation:"qsc-star-float 0.7s ease-out infinite" }}>⭐</span>
        <span style={{ position:"absolute", top:-2, right:2, fontSize:12, animation:"qsc-star-float 1s ease-out infinite 0.3s" }}>✨</span>
        <span style={{ position:"absolute", top:-10, left:"45%", fontSize:18, animation:"qsc-confetti 0.9s ease-out infinite 0.15s" }}>🎉</span>

        <svg viewBox="0 0 100 130" width="112" height="140">
          {/* Body */}
          <ellipse cx="50" cy="100" rx="20" ry="24" fill="#00C853" />
          {/* Left arm raised */}
          <g style={{ transformOrigin:"28px 88px", animation:"qsc-arm-wave 0.55s ease-in-out infinite" }}>
            <line x1="28" y1="88" x2="8" y2="62" stroke="#00C853" strokeWidth="8" strokeLinecap="round" />
            <circle cx="8" cy="62" r="5" fill="#FFD740" />
          </g>
          {/* Right arm raised */}
          <g style={{ transformOrigin:"72px 88px", animation:"qsc-arm-wave 0.55s ease-in-out infinite reverse" }}>
            <line x1="72" y1="88" x2="92" y2="62" stroke="#00C853" strokeWidth="8" strokeLinecap="round" />
            <circle cx="92" cy="62" r="5" fill="#FFD740" />
          </g>
          {/* Legs dancing */}
          <line x1="43" y1="122" x2="30" y2="132" stroke="#00C853" strokeWidth="7" strokeLinecap="round" />
          <line x1="57" y1="122" x2="70" y2="132" stroke="#00C853" strokeWidth="7" strokeLinecap="round" />

          {/* Head */}
          <circle cx="50" cy="48" r="28" fill="#FFD740" />
          {/* Cheeks */}
          <circle cx="33" cy="54" r="7" fill="rgba(255,100,130,0.4)" />
          <circle cx="67" cy="54" r="7" fill="rgba(255,100,130,0.4)" />
          {/* Happy curved eyes */}
          <path d="M 35 44 Q 39 38 43 44" stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 57 44 Q 61 38 65 44" stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Big smile */}
          <path d="M 32 55 Q 50 70 68 55" stroke="#222" strokeWidth="2.5" fill="rgba(255,120,120,0.25)" strokeLinecap="round" />
          {/* Trader cap */}
          <rect x="24" y="22" width="52" height="10" rx="5" fill="#1a1a2e" />
          <rect x="20" y="26" width="60" height="7" rx="3.5" fill="#2d2d4a" />
          <text x="50" y="21" textAnchor="middle" fontSize="6" fill="#00E676" fontFamily="monospace" fontWeight="bold">QSC</text>
        </svg>
      </div>
      <div style={{ animation:"qsc-bounce 0.5s ease-in-out infinite" }}
           className="mt-1 text-green-400 font-black text-base tracking-[0.2em] drop-shadow-lg">
        BUY! 🚀
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Cartoon: Crying Seller (SELL)
───────────────────────────────────────── */
function CryingCharacter() {
  return (
    <div className="flex flex-col items-center select-none" style={{ animation:"qsc-sad-sway 1.4s ease-in-out infinite" }}>
      <div className="relative w-28 h-36">
        {/* Falling rain drops */}
        <span style={{ position:"absolute", top:0, left:8,  fontSize:10, animation:"qsc-tear-fall 0.8s linear infinite" }}>💧</span>
        <span style={{ position:"absolute", top:0, right:6, fontSize:10, animation:"qsc-tear-fall 1.1s linear infinite 0.4s" }}>💧</span>
        <span style={{ position:"absolute", top:4, left:"45%", fontSize:10, animation:"qsc-tear-fall 1s linear infinite 0.2s" }}>💧</span>

        <svg viewBox="0 0 100 130" width="112" height="140">
          {/* Body slumped */}
          <ellipse cx="50" cy="102" rx="20" ry="22" fill="#5C6BC0" />
          {/* Arms drooping down */}
          <line x1="30" y1="92" x2="14" y2="115" stroke="#5C6BC0" strokeWidth="8" strokeLinecap="round" />
          <circle cx="14" cy="115" r="5" fill="#7986CB" />
          <line x1="70" y1="92" x2="86" y2="115" stroke="#5C6BC0" strokeWidth="8" strokeLinecap="round" />
          <circle cx="86" cy="115" r="5" fill="#7986CB" />
          {/* Legs */}
          <line x1="43" y1="122" x2="40" y2="132" stroke="#5C6BC0" strokeWidth="7" strokeLinecap="round" />
          <line x1="57" y1="122" x2="60" y2="132" stroke="#5C6BC0" strokeWidth="7" strokeLinecap="round" />

          {/* Head */}
          <circle cx="50" cy="48" r="28" fill="#FFD740" />
          {/* Sad eyebrows angled inward */}
          <path d="M 30 35 Q 38 40 44 36" stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M 70 35 Q 62 40 56 36" stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Teary eyes */}
          <circle cx="38" cy="45" r="6" fill="#222" />
          <circle cx="62" cy="45" r="6" fill="#222" />
          <circle cx="40" cy="43" r="2" fill="white" />
          <circle cx="64" cy="43" r="2" fill="white" />
          {/* Tears streaming */}
          <ellipse cx="36" cy="57" rx="3.5" ry="8"
            fill="rgba(100,180,255,0.85)"
            style={{ animation:"qsc-tear-fall 0.9s ease-in infinite" }} />
          <ellipse cx="64" cy="57" rx="3.5" ry="8"
            fill="rgba(100,180,255,0.85)"
            style={{ animation:"qsc-tear-fall 1.2s ease-in infinite 0.3s" }} />
          {/* Frown */}
          <path d="M 34 62 Q 50 54 66 62" stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Cap - slightly tilted */}
          <rect x="24" y="22" width="52" height="10" rx="5" fill="#1a1a2e" transform="rotate(-8 50 27)" />
          <rect x="20" y="26" width="60" height="7" rx="3.5" fill="#2d2d4a" transform="rotate(-8 50 29)" />
          <text x="49" y="21" textAnchor="middle" fontSize="6" fill="#FF6B6B" fontFamily="monospace" fontWeight="bold" transform="rotate(-8 49 21)">QSC</text>
        </svg>
      </div>
      <div className="mt-1 text-red-400 font-black text-base tracking-[0.2em] drop-shadow-lg">
        SELL 😭
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Cartoon: Angry Screen Starer (NEUTRAL)
───────────────────────────────────────── */
function AngryStarer() {
  return (
    <div className="flex flex-col items-center select-none" style={{ animation:"qsc-angry-pulse 2s ease-in-out infinite" }}>
      <div className="relative w-32 h-40">
        <svg viewBox="0 0 110 145" width="128" height="160">
          {/* Small monitor on desk */}
          <rect x="20" y="110" width="70" height="30" rx="4" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" />
          <rect x="25" y="114" width="60" height="22" rx="2"
            fill="#001a0a"
            style={{ animation:"qsc-screen-glow 1.5s ease-in-out infinite" }} />
          {/* Monitor screen content - chart lines */}
          <polyline points="27,130 35,122 42,126 50,118 57,120 65,116 73,114 80,120 85,113"
            stroke="#00FF88" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation:"qsc-screen-glow 1.5s ease-in-out infinite" }} />
          <rect x="52" y="135" width="6" height="5" rx="1" fill="#333" />
          {/* Stand */}
          <rect x="48" y="140" width="14" height="5" rx="2" fill="#333" />

          {/* Body */}
          <ellipse cx="55" cy="90" rx="22" ry="20" fill="#757575" />
          {/* Arms crossed */}
          <path d="M 33 82 Q 42 88 55 85 Q 68 82 77 88" stroke="#757575" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M 33 92 Q 42 87 55 90 Q 68 93 77 87" stroke="#757575" strokeWidth="8" fill="none" strokeLinecap="round" />
          {/* Legs */}
          <line x1="46" y1="108" x2="42" y2="118" stroke="#757575" strokeWidth="7" strokeLinecap="round" />
          <line x1="64" y1="108" x2="68" y2="118" stroke="#757575" strokeWidth="7" strokeLinecap="round" />

          {/* Head */}
          <circle cx="55" cy="45" r="28" fill="#FFD740" />
          {/* Steam puffs from top */}
          <path d="M 70 18 Q 76 10 72 2" stroke="#FF5252" strokeWidth="3" fill="none" strokeLinecap="round"
            style={{ animation:"qsc-steam 1s ease-in-out infinite" }} />
          <path d="M 78 22 Q 84 14 80 6" stroke="#FF7777" strokeWidth="2" fill="none" strokeLinecap="round"
            style={{ animation:"qsc-steam 1.3s ease-in-out infinite 0.2s" }} />
          <path d="M 62 16 Q 68 8 64 0" stroke="#FF9999" strokeWidth="1.5" fill="none" strokeLinecap="round"
            style={{ animation:"qsc-steam 1.6s ease-in-out infinite 0.4s" }} />
          {/* Angry eyebrows V-shape */}
          <line x1="30" y1="34" x2="46" y2="41" stroke="#222" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="80" y1="34" x2="64" y2="41" stroke="#222" strokeWidth="3.5" strokeLinecap="round" />
          {/* Narrow angry eyes */}
          <rect x="30" y="44" rx="3" ry="3" width="14" height="6" fill="#222"
            style={{ animation:"qsc-eye-twitch 2.5s ease-in-out infinite" }} />
          <rect x="56" y="44" rx="3" ry="3" width="14" height="6" fill="#222"
            style={{ animation:"qsc-eye-twitch 2.5s ease-in-out infinite 0.4s" }} />
          {/* Angry pupils */}
          <circle cx="36" cy="47" r="2.5" fill="#FF3333"
            style={{ animation:"qsc-eye-twitch 2.5s ease-in-out infinite" }} />
          <circle cx="62" cy="47" r="2.5" fill="#FF3333"
            style={{ animation:"qsc-eye-twitch 2.5s ease-in-out infinite 0.4s" }} />
          {/* Tight gritted line */}
          <path d="M 37 60 Q 55 57 73 60" stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Gritted teeth marks */}
          <line x1="44" y1="60" x2="44" y2="57" stroke="#222" strokeWidth="1.5" />
          <line x1="51" y1="60" x2="51" y2="57" stroke="#222" strokeWidth="1.5" />
          <line x1="58" y1="60" x2="58" y2="57" stroke="#222" strokeWidth="1.5" />
          <line x1="65" y1="60" x2="65" y2="57" stroke="#222" strokeWidth="1.5" />
          {/* Cap */}
          <rect x="28" y="20" width="54" height="10" rx="5" fill="#1a1a2e" />
          <rect x="24" y="24" width="62" height="7" rx="3.5" fill="#2d2d4a" />
          <text x="55" y="20" textAnchor="middle" fontSize="6" fill="#888" fontFamily="monospace" fontWeight="bold">QSC</text>
        </svg>
      </div>
      <div className="mt-1 text-yellow-500 font-black text-sm tracking-[0.15em] drop-shadow-lg">
        WAITING... 😤
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Intraday Level Calculator
───────────────────────────────────────── */
function calcIntradayLevels(symbol, livePrice, direction) {
  if (!livePrice || livePrice <= 0) return null;
  const isCrypto = symbol?.includes("USDT");
  const isIndian = ["RELIANCE","TCS","INFY","HDFCBANK","NIFTY50","SENSEX"].includes(symbol);
  const atrPct = isCrypto ? 0.009 : isIndian ? 0.006 : 0.005;
  const atr = livePrice * atrPct;

  const isLong = direction === "LONG";
  const entry  = livePrice;
  const sl     = isLong ? entry - atr * 0.8  : entry + atr * 0.8;
  const t1     = isLong ? entry + atr * 1.0  : entry - atr * 1.0;
  const t2     = isLong ? entry + atr * 1.8  : entry - atr * 1.8;

  const fmt = (n) => n >= 1000 ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                                : n.toFixed(n < 10 ? 4 : 2);
  const pct = (n) => ((n - entry) / entry * 100).toFixed(2);

  return {
    entry: fmt(entry),
    sl: fmt(sl),    slPct: pct(sl),
    t1: fmt(t1),    t1Pct: pct(t1),
    t2: fmt(t2),    t2Pct: pct(t2),
    rr: (Math.abs(t1 - entry) / Math.abs(sl - entry)).toFixed(1),
  };
}

/* ─────────────────────────────────────────
   Main Component
───────────────────────────────────────── */
export default function QSCTradingCard({ signal, livePrice, symbol, displayName, loading }) {
  const direction = signal?.direction ?? "NEUTRAL";  // LONG | SHORT | NEUTRAL
  const confidence = signal ? Math.round(signal.confidence * 100) : 0;
  const isBuy  = direction === "LONG";
  const isSell = direction === "SHORT";

  // Use displayName if provided, else fallback to symbol
  const stockName = displayName || symbol || "—";

  const levels = useMemo(
    () => (isBuy || isSell) ? calcIntradayLevels(symbol, livePrice, direction) : null,
    [symbol, livePrice, direction, isBuy, isSell]
  );

  const signalColor = isBuy  ? "#00E676"
                    : isSell ? "#FF5252"
                    : "#888888";
  const signalBg   = isBuy  ? "rgba(0,230,118,0.08)"
                    : isSell ? "rgba(255,82,82,0.08)"
                    : "rgba(128,128,128,0.05)";

  return (
    <div
      className="qsc-card overflow-hidden relative"
      data-testid="qsc-trading-card"
      style={{ border: `1px solid ${signalColor}33` }}
    >
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            QSC Final Result
          </span>
          <span className="ml-2 text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
            Intraday
          </span>
        </div>
        <div className="flex items-center gap-2">
          {signal && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-sm font-mono"
              style={{ background: signalBg, color: signalColor, border: `1px solid ${signalColor}44` }}
            >
              CONF {confidence}%
            </span>
          )}
          {loading && (
            <span className="text-[9px] font-mono text-yellow-400 animate-pulse">Generating…</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex items-start gap-4">

        {/* ── Cartoon ── */}
        <div className="flex-shrink-0 flex flex-col items-center min-w-[130px]">
          {isBuy  ? <HappyDancer />   :
           isSell ? <CryingCharacter /> :
                    <AngryStarer />}
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col gap-2">

          {/* Stock name — prominently shown */}
          <div className="flex flex-col gap-0.5">
            <div
              className="font-black text-lg leading-tight tracking-tight text-white truncate"
              data-testid="trading-card-stockname"
            >
              {stockName}
            </div>
            <div className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">
              {symbol}
            </div>
          </div>

          {/* Big direction label */}
          <div>
            <span
              className="font-black text-4xl leading-none tracking-tighter"
              style={{ color: signalColor }}
              data-testid="trading-card-direction"
            >
              {isBuy ? "BUY" : isSell ? "SELL" : "WAIT"}
            </span>
          </div>

          {/* Trading levels */}
          {levels ? (
            <div className="space-y-1.5">
              {/* Entry */}
              <LevelRow label="ENTRY"     value={levels.entry} pct={null}                    color="#FFFFFF"  bg="rgba(255,255,255,0.08)" bold />
              {/* SL */}
              <LevelRow label="STOP LOSS" value={levels.sl}    pct={`${levels.slPct}%`}      color="#FF5252"  bg="rgba(255,82,82,0.08)" />
              {/* T1 */}
              <LevelRow label="TARGET 1"  value={levels.t1}    pct={`+${Math.abs(parseFloat(levels.t1Pct)).toFixed(2)}%`} color="#00E676"  bg="rgba(0,230,118,0.08)" />
              {/* T2 */}
              <LevelRow label="TARGET 2"  value={levels.t2}    pct={`+${Math.abs(parseFloat(levels.t2Pct)).toFixed(2)}%`} color="#40C4FF"  bg="rgba(64,196,255,0.08)" />
              {/* Risk:Reward */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">Risk:Reward</span>
                <span className="text-[11px] font-bold font-mono text-yellow-400">1 : {levels.rr}</span>
                <span className="ml-auto text-[9px] font-mono text-neutral-600">ATR-based</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 justify-center py-3">
              <div className="text-[11px] font-mono text-neutral-500 text-center">
                {loading ? "Generating signal…" : "Click any stock to get signal"}
              </div>
              <div className="text-[9px] font-mono text-neutral-700 text-center uppercase tracking-widest">
                Entry · SL · Target will appear here
              </div>
            </div>
          )}

          {/* AI reasoning snippet */}
          {signal?.reasoning && (
            <div className="border-t border-white/10 pt-2">
              <p className="text-[9px] font-mono text-neutral-500 leading-relaxed line-clamp-2">
                {signal.reasoning}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Level Row helper
───────────────────────────────────────── */
function LevelRow({ label, value, pct, color, bg, bold }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded-sm"
      style={{ background: bg }}
    >
      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-500 w-16 flex-shrink-0">
        {label}
      </span>
      <span
        className="font-mono text-xs flex-1 font-bold"
        style={{ color: bold ? color : color }}
      >
        {value}
      </span>
      {pct && (
        <span
          className="text-[9px] font-mono font-bold"
          style={{ color }}
        >
          {pct}
        </span>
      )}
    </div>
  );
}
