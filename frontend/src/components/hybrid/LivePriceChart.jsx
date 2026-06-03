import { useEffect, useState, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function LivePriceChart({ symbol, series, livePrice, onChangeSymbol, options }) {
  const data = (series || []).map((p, i) => ({ i, t: p.t, p: p.p }));
  const last = data[data.length - 1]?.p ?? livePrice ?? 0;
  const first = data[0]?.p ?? last;
  const change = first ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;
  const prevRef = useRef(last);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (livePrice == null) return;
    if (livePrice > prevRef.current) setFlash("flash-up");
    else if (livePrice < prevRef.current) setFlash("flash-down");
    prevRef.current = livePrice;
    const t = setTimeout(() => setFlash(""), 600);
    return () => clearTimeout(t);
  }, [livePrice]);

  const stroke = up ? "#3366FF" : "#FF3333";

  return (
    <div className="qsc-card" data-testid="live-price-chart">
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-4">
          <select
            value={symbol}
            onChange={(e) => onChangeSymbol(e.target.value)}
            className="bg-transparent border border-white/15 text-white font-mono text-xs px-3 py-2 rounded-none focus:outline-none focus:border-white"
            data-testid="chart-symbol-select"
          >
            {options.map((o) => <option key={o} value={o} className="bg-[#0A0A0A]">{o}</option>)}
          </select>
          <div>
            <div className={`font-mono text-3xl tracking-tighter ${flash}`} data-testid="chart-live-price">
              {(livePrice ?? last).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] font-mono uppercase tracking-widest" style={{ color: stroke }}>
              {up ? "▲" : "▼"} {change.toFixed(2)}% / WINDOW
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Last Update</div>
          <div className="text-xs font-mono text-white">{new Date().toUTCString().slice(17, 25)}</div>
        </div>
      </div>
      <div style={{ width: "100%", height: 280, minHeight: 280 }}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="i" hide />
            <YAxis domain={["auto", "auto"]} tick={{ fill: "#666", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} width={60} />
            <Tooltip
              contentStyle={{ background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 11 }}
              labelStyle={{ color: "#888" }}
              itemStyle={{ color: "#fff" }}
              formatter={(v) => v.toFixed(2)}
            />
            <Line type="monotone" dataKey="p" stroke={stroke} strokeWidth={1.2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
