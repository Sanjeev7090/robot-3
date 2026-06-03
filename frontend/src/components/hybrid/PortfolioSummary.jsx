import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react";

export default function PortfolioSummary({ portfolio }) {
  const total = portfolio?.total_pnl ?? 0;
  const realized = portfolio?.realized_pnl ?? 0;
  const unrealized = portfolio?.unrealized_pnl ?? 0;
  const color = total >= 0 ? "#3366FF" : "#FF3333";
  return (
    <div className="qsc-card" data-testid="portfolio-summary">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <ChartLineUp size={14} className="text-neutral-400" />
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">Portfolio</span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Total PnL</div>
          <div className="font-mono text-3xl tracking-tighter" style={{ color }} data-testid="port-total-pnl">
            {total >= 0 ? "+" : ""}{total.toFixed(2)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Realized" value={realized} />
          <Cell label="Unrealized" value={unrealized} />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
          <Cell label="Open" value={portfolio?.open_positions ?? 0} raw />
          <Cell label="Total trades" value={portfolio?.total_trades ?? 0} raw />
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, raw }) {
  const c = !raw ? (value >= 0 ? "#3366FF" : "#FF3333") : "#FFFFFF";
  return (
    <div className="border border-white/10 p-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="font-mono text-sm" style={{ color: c }}>{raw ? value : (value >= 0 ? "+" : "") + Number(value).toFixed(2)}</div>
    </div>
  );
}
