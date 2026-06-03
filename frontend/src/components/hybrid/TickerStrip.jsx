import { useEffect, useRef, useState } from "react";

export default function TickerStrip({ assets, livePrices }) {
  const items = assets.length ? assets : [];
  // duplicate for seamless marquee
  const stream = [...items, ...items];
  return (
    <div className="border-b border-white/10 bg-[#0A0A0A] overflow-hidden">
      <div className="marquee-track py-2">
        {stream.map((a, i) => {
          const live = livePrices[a.symbol] ?? a.price;
          const up = a.change_24h >= 0;
          return (
            <span key={`${a.symbol}-${i}`} className="inline-flex items-center gap-2 px-6 font-mono text-xs">
              <span className="text-neutral-500 uppercase">{a.asset_class.slice(0,3)}</span>
              <span className="text-white">{a.symbol}</span>
              <FlashCell symbol={a.symbol} value={live} />
              <span style={{ color: up ? "#3366FF" : "#FF3333" }}>{up ? "+" : ""}{a.change_24h?.toFixed(2)}%</span>
              <span className="text-neutral-700">|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FlashCell({ symbol, value }) {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  useEffect(() => {
    if (prev.current == null) { prev.current = value; return; }
    if (value > prev.current) setCls("flash-up");
    else if (value < prev.current) setCls("flash-down");
    const t = setTimeout(() => setCls(""), 600);
    prev.current = value;
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span className={`px-1 ${cls}`} data-testid={`ticker-price-${symbol}`}>
      {value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
    </span>
  );
}
