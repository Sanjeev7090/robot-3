import { Fragment, useState } from "react";

export default function TradesLog({ trades }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="qsc-card" data-testid="trades-log">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Trade Log / Staggered Execution</span>
        <span className="text-[10px] font-mono text-neutral-500">{trades.length} TRADES</span>
      </div>
      {trades.length === 0 ? (
        <div className="p-6 text-center text-neutral-500 font-mono text-xs">No trades yet. Execute one from the panel on the left.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-neutral-500">
                <th className="text-left px-4 py-2">ID</th>
                <th className="text-left px-2 py-2">Sym</th>
                <th className="text-left px-2 py-2">Side</th>
                <th className="text-right px-2 py-2">Vol</th>
                <th className="text-right px-2 py-2">Avg Px</th>
                <th className="text-right px-2 py-2">Legs</th>
                <th className="text-right px-2 py-2">Status</th>
                <th className="text-right px-2 py-2">PnL</th>
                <th className="text-left px-4 py-2">Opened</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const open = t.status === "OPEN";
                return (
                  <Fragment key={t.id}>
                    <tr
                        className="border-t border-white/5 hover:bg-white/5 cursor-pointer"
                        onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                        data-testid={`trade-row-${t.id}`}>
                      <td className="px-4 py-2 text-neutral-400">{t.id.slice(0,8)}</td>
                      <td className="px-2 py-2 text-white">{t.symbol}</td>
                      <td className="px-2 py-2" style={{ color: t.direction === "LONG" ? "#3366FF" : "#FF3333" }}>{t.direction}</td>
                      <td className="px-2 py-2 text-right text-neutral-300">{t.total_volume}</td>
                      <td className="px-2 py-2 text-right text-neutral-300">{t.avg_price}</td>
                      <td className="px-2 py-2 text-right text-neutral-400">{t.legs.length}</td>
                      <td className="px-2 py-2 text-right">
                        <span className={`px-2 py-0.5 text-[10px] uppercase tracking-widest border ${open ? "border-[#3366FF] text-[#3366FF]" : "border-white/20 text-neutral-400"}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right" style={{ color: t.pnl >= 0 ? "#3366FF" : "#FF3333" }}>
                        {t.pnl >= 0 ? "+" : ""}{t.pnl?.toFixed?.(2) ?? "0.00"}
                      </td>
                      <td className="px-4 py-2 text-neutral-500">{new Date(t.opened_at).toUTCString().slice(17,25)}</td>
                    </tr>
                    {expanded === t.id && (
                      <tr className="bg-black/40">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {t.legs.map((leg, i) => (
                              <div key={i} className="border border-white/10 p-3">
                                <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">{leg.venue}</div>
                                <div className="font-mono text-white text-sm mt-1">{leg.side} {leg.quantity} @ {leg.price}</div>
                                <div className="text-[10px] font-mono text-neutral-500 mt-1">latency {leg.latency_ns}ns</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
