import React, { useState, useCallback, useEffect } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Plus, FloppyDisk, ArrowCounterClockwise, X } from '@phosphor-icons/react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LS_KEY = 'gann_workspace_layout_v2';

const ALL_PANELS = [
  { id: 'scanner',    label: 'Auto Scanner',      color: '#00e676', icon: '⚡' },
  { id: 'mirofish',   label: 'MiroFish AI',        color: '#3b82f6', icon: '🐟' },
  { id: 'smc',        label: 'SMC Analysis',       color: '#8b5cf6', icon: '📐' },
  { id: 'demon',      label: 'DEMON Confluence',   color: '#ef4444', icon: '👾' },
  { id: 'godzilla',   label: 'Godzilla TTE',       color: '#f59e0b', icon: '🦖' },
  { id: 'pacso',      label: 'PAC + S&O Matrix',   color: '#06b6d4', icon: '🔮' },
  { id: 'amds',       label: 'AMDS Hybrid',        color: '#10b981', icon: '🔄' },
  { id: 'vwap',       label: 'Hybrid VWAP+TWAP',   color: '#f97316', icon: '📊' },
  { id: 'rl',         label: 'RL Agent',           color: '#7c3aed', icon: '🤖' },
  { id: 'ghost',      label: 'Ghost Mode',         color: '#64748b', icon: '👻' },
  { id: 'paper',      label: 'Paper Trading',      color: '#84cc16', icon: '📝' },
  { id: 'montecarlo', label: 'Monte Carlo',        color: '#ec4899', icon: '🎲' },
];

const DEFAULT_LAYOUT = [
  { i: 'scanner',   x: 0, y: 0, w: 6, h: 3 },
  { i: 'mirofish',  x: 6, y: 0, w: 6, h: 3 },
  { i: 'smc',       x: 0, y: 3, w: 4, h: 3 },
  { i: 'demon',     x: 4, y: 3, w: 4, h: 3 },
  { i: 'godzilla',  x: 8, y: 3, w: 4, h: 3 },
  { i: 'rl',        x: 0, y: 6, w: 6, h: 3 },
  { i: 'vwap',      x: 6, y: 6, w: 6, h: 3 },
];

// Minimal strategy signal fetcher
function useStrategySignal(panelId, ticker) {
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker || !panelId) return;
    let cancelled = false;

    const fetchSignal = async () => {
      setLoading(true);
      try {
        let res;
        if (panelId === 'rl') {
          res = await axios.post(`${API}/rl-agent/predict`, { ticker });
          if (!cancelled) setSignal({ direction: res.data.signal, confidence: res.data.confidence, strategy: 'RL Agent' });
        } else if (panelId !== 'scanner' && panelId !== 'montecarlo' && panelId !== 'paper' && panelId !== 'ghost') {
          res = await axios.get(`${API}/auto-scan/${ticker}`);
          if (!cancelled) {
            const s = (res.data.signals || []).find(s => s.strategy.toLowerCase().includes(panelId.replace('pacso','pac')));
            if (s) setSignal({ direction: s.direction, confidence: s.confidence, strategy: s.strategy });
          }
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    };

    fetchSignal();
    return () => { cancelled = true; };
  }, [panelId, ticker]);

  return { signal, loading };
}

// Individual workspace card
function WorkspaceCard({ panelMeta, ticker, onRemove, onNavigate }) {
  const { signal, loading } = useStrategySignal(panelMeta.id, ticker);

  const dirColor = signal?.direction === 'BUY'  ? '#10b981'
    : signal?.direction === 'SELL' ? '#ef4444' : '#6b7280';

  return (
    <div
      className="h-full flex flex-col bg-[#0d0d0d] border border-white/8 rounded-xl overflow-hidden"
      style={{ borderTop: `2px solid ${panelMeta.color}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-sm">{panelMeta.icon}</span>
          <span className="text-[11px] font-bold text-white truncate">{panelMeta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNavigate?.(panelMeta.id === 'mirofish' || panelMeta.id === 'smc' || panelMeta.id === 'demon' || panelMeta.id === 'godzilla' || panelMeta.id === 'pacso' || panelMeta.id === 'amds' || panelMeta.id === 'vwap' ? 'strategies' : panelMeta.id)}
            className="text-[9px] text-zinc-500 hover:text-white px-1.5 py-0.5 rounded border border-white/10 hover:border-white/30 transition-colors"
          >
            Open
          </button>
          <button onClick={onRemove} className="text-zinc-600 hover:text-red-400 ml-1 transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Signal display */}
      <div className="flex-1 flex flex-col items-center justify-center p-3">
        {!ticker ? (
          <p className="text-[10px] text-zinc-600 text-center">Select a stock to see signals</p>
        ) : loading ? (
          <div className="space-y-2 w-full">
            <div className="h-2 bg-white/5 rounded animate-pulse" />
            <div className="h-2 bg-white/5 rounded animate-pulse w-3/4" />
          </div>
        ) : signal ? (
          <>
            <span className="text-2xl font-black mb-1" style={{ color: dirColor }}>
              {signal.direction}
            </span>
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-1">
              <div className="h-full rounded-full" style={{ width: `${signal.confidence}%`, backgroundColor: dirColor }} />
            </div>
            <span className="text-[9px] text-zinc-500">{signal.confidence}% confidence</span>
          </>
        ) : (
          <p className="text-[10px] text-zinc-600 text-center">No signal yet</p>
        )}
      </div>

      {/* Ticker badge */}
      {ticker && (
        <div className="px-3 py-1.5 border-t border-white/5 shrink-0">
          <span className="text-[9px] font-mono text-zinc-600">{ticker}</span>
        </div>
      )}
    </div>
  );
}

// Panel picker modal
function PanelPicker({ active, onAdd, onClose }) {
  const inactive = ALL_PANELS.filter(p => !active.includes(p.id));
  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="bg-[#0d0d0d] border border-white/15 rounded-2xl p-5 w-80 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-white">Add Panel</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {inactive.length === 0 && <p className="text-[11px] text-zinc-500 text-center py-4">All panels are active</p>}
          {inactive.map(p => (
            <button key={p.id} onClick={() => { onAdd(p.id); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left">
              <span className="text-base">{p.icon}</span>
              <span className="text-xs text-white">{p.label}</span>
              <div className="ml-auto w-2 h-2 rounded-full" style={{ background: p.color }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePanel({ selectedStock, onNavigate }) {
  const ticker = selectedStock?.ticker || selectedStock?.symbol || null;

  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
    } catch { return DEFAULT_LAYOUT; }
  });
  const [activePanels, setActivePanels] = useState(() => layout.map(l => l.i));
  const [showPicker, setShowPicker] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const containerRef = React.useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  const saveLayout = useCallback(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(layout));
  }, [layout]);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    setActivePanels(DEFAULT_LAYOUT.map(l => l.i));
    localStorage.removeItem(LS_KEY);
  }, []);

  const addPanel = (id) => {
    if (activePanels.includes(id)) return;
    const newItem = { i: id, x: 0, y: Infinity, w: 6, h: 3 };
    setLayout(l => [...l, newItem]);
    setActivePanels(ap => [...ap, id]);
  };

  const removePanel = (id) => {
    setLayout(l => l.filter(item => item.i !== id));
    setActivePanels(ap => ap.filter(p => p !== id));
  };

  const panelMetas = activePanels.map(id => ALL_PANELS.find(p => p.id === id)).filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-[#080808]" data-testid="workspace-panel" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 shrink-0">
        <span className="text-[10px] font-black uppercase tracking-widest text-white">Workspace</span>
        <div className="flex gap-1.5">
          <button onClick={() => setShowPicker(true)} data-testid="add-panel-btn"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-violet-700/40 text-violet-300 hover:bg-violet-700/60 transition-colors">
            <Plus size={10} /> Add
          </button>
          <button onClick={saveLayout} data-testid="save-layout-btn"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors">
            <FloppyDisk size={10} /> Save
          </button>
          <button onClick={resetLayout} data-testid="reset-layout-btn"
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors">
            <ArrowCounterClockwise size={10} /> Reset
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto relative">
        {showPicker && (
          <PanelPicker active={activePanels} onAdd={addPanel} onClose={() => setShowPicker(false)} />
        )}

        {activePanels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-zinc-600 text-sm">No panels added yet</p>
            <button onClick={() => setShowPicker(true)}
              className="px-4 py-2 rounded-lg bg-violet-700/40 text-violet-300 text-xs font-bold hover:bg-violet-700/60 transition-colors">
              Add your first panel
            </button>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={layout}
            cols={12}
            rowHeight={80}
            width={containerWidth || 800}
            onLayoutChange={(newLayout) => setLayout(newLayout)}
            draggableHandle=".drag-handle"
            margin={[8, 8]}
            containerPadding={[8, 8]}
          >
            {panelMetas.map(p => (
              <div key={p.id} data-testid={`workspace-card-${p.id}`}>
                <div className="drag-handle absolute top-0 left-0 right-0 h-7 cursor-grab active:cursor-grabbing z-10" />
                <WorkspaceCard
                  panelMeta={p}
                  ticker={ticker}
                  onRemove={() => removePanel(p.id)}
                  onNavigate={onNavigate}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}
