export default function PositionsTable({ positions, onClose }) {
  return (
    <div className="qsc-card" data-testid="positions-table">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Open Positions</span>
        <span className="text-[10px] font-mono text-neutral-500">{positions.length} OPEN</span>
      </div>
      {positions.length === 0 ? (
        <div className="p-6 text-center text-neutral-500 font-mono text-xs">No open positions.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-neutral-500">
                <th className="text-left px-4 py-2">Sym</th>
                <th className="text-left px-2 py-2">Side</th>
                <th className="text-right px-2 py-2">Qty</th>
                <th className="text-right px-2 py-2">Entry</th>
                <th className="text-right px-2 py-2">Now</th>
                <th className="text-right px-2 py-2">PnL</th>
                <th className="text-right px-4 py-2">Act</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const c = p.pnl >= 0 ? "#3366FF" : "#FF3333";
                return (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-2 text-white">{p.symbol}</td>
                    <td className="px-2 py-2" style={{ color: p.direction === "LONG" ? "#3366FF" : "#FF3333" }}>{p.direction}</td>
                    <td className="px-2 py-2 text-right text-neutral-300">{p.quantity}</td>
                    <td className="px-2 py-2 text-right text-neutral-300">{p.entry_price}</td>
                    <td className="px-2 py-2 text-right text-white">{p.current_price}</td>
                    <td className="px-2 py-2 text-right" style={{ color: c }}>{p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)} <span className="text-neutral-500">/ {p.pnl_pct.toFixed(2)}%</span></td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => onClose(/* must pass trade id; we don't have it here, but listing is for display only - close happens from TradesLog */ null)}
                        className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white"
                        disabled
                      >
                        —
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
