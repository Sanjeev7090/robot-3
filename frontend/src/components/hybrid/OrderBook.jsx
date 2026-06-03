export default function OrderBook({ book }) {
  if (!book) {
    return (
      <div className="qsc-card p-5" data-testid="orderbook-card">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-2">Order Book / L2</div>
        <div className="text-neutral-500 font-mono text-xs animate-pulse">Loading...</div>
      </div>
    );
  }

  const maxBid = Math.max(...book.bids.map(b => b.qty), 0.001);
  const maxAsk = Math.max(...book.asks.map(a => a.qty), 0.001);
  const mid = book.mid;
  const rows = Math.max(book.bids.length, book.asks.length, 8);

  return (
    <div className="qsc-card flex flex-col" data-testid="orderbook-card">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Order Book / L2</span>
        <span className="text-[10px] font-mono text-neutral-500">{book.symbol}</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 border-b border-white/5">
        <div className="px-3 py-1.5 grid grid-cols-2 gap-1 text-[9px] font-mono uppercase tracking-widest">
          <span className="text-[#3366FF]">BUY</span>
          <span className="text-neutral-600 text-right">QTY</span>
        </div>
        <div className="px-3 py-1.5 grid grid-cols-2 gap-1 text-[9px] font-mono uppercase tracking-widest border-l border-white/5">
          <span className="text-neutral-600">PRICE</span>
          <span className="text-[#FF3333] text-right">SELL</span>
        </div>
      </div>

      {/* Mid price row */}
      <div className="grid grid-cols-2 bg-white/[0.03] border-b border-white/10">
        <div className="px-3 py-1.5 text-center col-span-2 font-mono text-xs flex items-center justify-center gap-3">
          <span className="text-neutral-500 text-[9px] uppercase tracking-widest">Mid</span>
          <span className="text-white font-bold" data-testid="ob-mid-price">
            {mid?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Bid / Ask rows side by side */}
      <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
        {Array.from({ length: rows }).map((_, i) => {
          const bid = book.bids[i];
          const ask = book.asks[i];
          return (
            <div key={i} className="grid grid-cols-2 border-b border-white/[0.03] hover:bg-white/[0.02]">
              {/* BUY side */}
              <div className="relative px-3 py-1 flex items-center justify-between overflow-hidden">
                {bid && (
                  <>
                    <div
                      className="absolute inset-y-0 right-0"
                      style={{ width: `${Math.min((bid.qty / maxBid) * 100, 100)}%`, background: "rgba(51,102,255,0.12)" }}
                    />
                    <span className="relative text-[#3366FF] font-mono text-[10px]">
                      {bid.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                    <span className="relative text-neutral-400 font-mono text-[10px]">
                      {bid.qty.toFixed(3)}
                    </span>
                  </>
                )}
              </div>
              {/* SELL side */}
              <div className="relative px-3 py-1 flex items-center justify-between overflow-hidden border-l border-white/5">
                {ask && (
                  <>
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${Math.min((ask.qty / maxAsk) * 100, 100)}%`, background: "rgba(255,51,51,0.12)" }}
                    />
                    <span className="relative text-neutral-400 font-mono text-[10px]">
                      {ask.qty.toFixed(3)}
                    </span>
                    <span className="relative text-[#FF3333] font-mono text-[10px]">
                      {ask.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
