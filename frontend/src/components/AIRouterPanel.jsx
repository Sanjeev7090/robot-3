import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Zap, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronUp, Copy, Loader2, Activity, Database, TrendingUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PROVIDER_BADGES = {
  'emergent-llm': { color: '#00E676', label: 'FREE' },
  'opencode-free': { color: '#F5A623', label: 'SETUP NEEDED' },
};

const MODEL_FAMILY_COLORS = {
  claude: '#FF6B35',
  gpt: '#74AA9C',
  gemini: '#4285F4',
  deepseek: '#8B5CF6',
  glm: '#F59E0B',
  minimax: '#EC4899',
  kimi: '#06B6D4',
  qwen: '#84CC16',
  grok: '#A855F7',
};

const getModelColor = (id) => {
  const prefix = Object.keys(MODEL_FAMILY_COLORS).find(k => id.toLowerCase().startsWith(k));
  return prefix ? MODEL_FAMILY_COLORS[prefix] : '#A1A1AA';
};

const Pill = ({ label, color }) => (
  <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
    style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
    {label}
  </span>
);

const StatCard = ({ label, value, sub, color = '#A1A1AA' }) => (
  <div className="flex flex-col px-3 py-2 border border-white/5 bg-[#0E0E10] rounded">
    <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">{label}</span>
    <span className="text-base font-mono font-black mt-0.5" style={{ color }}>{value}</span>
    {sub && <span className="text-[9px] text-zinc-600 mt-0.5">{sub}</span>}
  </div>
);

const AIRouterPanel = () => {
  const [providers, setProviders] = useState([]);
  const [stats, setStats] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [testingId, setTestingId] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [newProvider, setNewProvider] = useState({ name: '', base_url: '', api_key: '', description: '' });

  const fetchData = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        axios.get(`${API}/ai-router/providers`),
        axios.get(`${API}/ai-router/stats`),
      ]);
      setProviders(pRes.data.providers || []);
      setStats(sRes.data);
    } catch (e) {
      // silent
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/ai-router/models`);
      setModels(r.data.models || []);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    fetchData();
    fetchModels();
  }, [fetchData, fetchModels]);

  const handleToggleActive = async (provider) => {
    try {
      await axios.put(`${API}/ai-router/providers/${provider.id}`, {
        is_active: !provider.is_active,
      });
      toast.success(`${provider.name} ${provider.is_active ? 'disabled' : 'enabled'}`);
      fetchData();
    } catch (e) {
      toast.error('Failed to update provider');
    }
  };

  const handleDelete = async (provider) => {
    if (provider.id === 'opencode-free') {
      toast.error('Cannot delete default provider');
      return;
    }
    try {
      await axios.delete(`${API}/ai-router/providers/${provider.id}`);
      toast.success(`Deleted ${provider.name}`);
      fetchData();
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const handleTest = async (provider) => {
    setTestingId(provider.id);
    setTestResults(r => ({ ...r, [provider.id]: null }));
    try {
      const res = await axios.post(`${API}/ai-router/providers/${provider.id}/test`);
      setTestResults(r => ({ ...r, [provider.id]: res.data }));
    } catch (e) {
      setTestResults(r => ({ ...r, [provider.id]: { ok: false, error: e?.response?.data?.detail || 'Request failed' } }));
    } finally {
      setTestingId(null);
    }
  };

  const handleSyncModels = async (provider) => {
    setSyncingId(provider.id);
    try {
      const res = await axios.post(`${API}/ai-router/providers/${provider.id}/sync-models`);
      toast.success(`Synced ${res.data.count} models for ${provider.name}`);
      fetchData();
      fetchModels();
    } catch (e) {
      toast.error('Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const handleAddProvider = async () => {
    if (!newProvider.base_url) {
      toast.error('Base URL required');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/ai-router/providers`, newProvider);
      toast.success(`Added ${newProvider.name || newProvider.base_url}`);
      setNewProvider({ name: '', base_url: '', api_key: '', description: '' });
      setShowAddForm(false);
      fetchData();
      fetchModels();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Add failed');
    } finally {
      setLoading(false);
    }
  };

  const copyEndpoint = () => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/ai-router/v1`;
    navigator.clipboard?.writeText(url);
    toast.success('Endpoint copied!');
  };

  return (
    <div className="flex flex-col bg-[#0A0A0A] text-white min-h-full" data-testid="ai-router-panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 bg-[#0E0E10]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-[#00E676]/10 border border-[#00E676]/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#00E676]" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white">9ROUTER AI</div>
              <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
                Free LLM · Auto-Fallback · {stats?.total_models || 0} Models
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="p-1.5 text-zinc-500 hover:text-white transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="h-6 px-2.5 text-[9px] font-bold uppercase tracking-wider border border-[#00E676]/40 text-[#00E676] hover:bg-[#00E676]/10 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="px-3 py-2.5 grid grid-cols-2 gap-2 border-b border-white/5 bg-[#0B0B0D]">
          <StatCard
            label="Total Requests"
            value={stats.total_requests.toLocaleString()}
            color="#00E676"
            sub="via AI Router"
          />
          <StatCard
            label="Cost Saved"
            value={`$${stats.estimated_cost_saved_usd}`}
            color="#A855F7"
            sub="vs. paid APIs"
          />
          <StatCard
            label="Input Tokens"
            value={(stats.total_tokens_input / 1000).toFixed(1) + 'K'}
            color="#F5A623"
          />
          <StatCard
            label="Output Tokens"
            value={(stats.total_tokens_output / 1000).toFixed(1) + 'K'}
            color="#60A5FA"
          />
        </div>
      )}

      {/* Proxy Endpoint */}
      <div className="px-3 py-2 border-b border-white/5 bg-[#0C0C0E]">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Proxy Endpoint</span>
          <button onClick={copyEndpoint} className="flex items-center gap-1 text-[9px] font-mono text-[#00E676] hover:opacity-80">
            <Copy className="w-2.5 h-2.5" /> Copy
          </button>
        </div>
        <div className="text-[9px] font-mono text-zinc-400 mt-0.5 truncate">
          {process.env.REACT_APP_BACKEND_URL}/api/ai-router/v1
        </div>
      </div>

      {/* Add Provider Form */}
      {showAddForm && (
        <div className="px-3 py-3 border-b border-white/5 bg-[#0E0E10] space-y-2">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[#00E676] mb-2">Add Provider</div>
          <input
            placeholder="Name (e.g., My Proxy)"
            value={newProvider.name}
            onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))}
            className="w-full h-7 px-2.5 bg-white/5 border border-white/10 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-[#00E676]/50"
          />
          <input
            placeholder="Base URL (e.g., https://openai.com/v1)"
            value={newProvider.base_url}
            onChange={e => setNewProvider(p => ({ ...p, base_url: e.target.value }))}
            className="w-full h-7 px-2.5 bg-white/5 border border-white/10 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-[#00E676]/50"
          />
          <input
            placeholder="API Key (optional — leave empty for free providers)"
            value={newProvider.api_key}
            onChange={e => setNewProvider(p => ({ ...p, api_key: e.target.value }))}
            className="w-full h-7 px-2.5 bg-white/5 border border-white/10 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-[#00E676]/50"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddProvider}
              disabled={loading}
              className="flex-1 h-7 text-[10px] font-bold uppercase tracking-wider bg-[#00E676] text-black disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Provider'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 h-7 text-[10px] border border-white/10 text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Providers */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-2">
            Providers ({providers.length})
          </div>
          {providers.map(provider => {
            const tr = testResults[provider.id];
            const isExpanded = expandedProvider === provider.id;

            return (
              <div
                key={provider.id}
                className="mb-2 border border-white/8 bg-[#0E0E10] rounded overflow-hidden"
                data-testid={`provider-${provider.id}`}
              >
                {/* Provider Header */}
                <div className="px-3 py-2.5 flex items-center gap-2.5">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${provider.is_active ? 'bg-[#00E676]' : 'bg-zinc-600'}`}
                    style={provider.is_active ? { boxShadow: '0 0 6px #00E676' } : {}}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-white truncate">{provider.name}</span>
                      {PROVIDER_BADGES[provider.id] && (
                        <Pill label={PROVIDER_BADGES[provider.id].label} color={PROVIDER_BADGES[provider.id].color} />
                      )}
                      {provider.is_active && (
                        <Pill label={`${provider.models?.length || 0} models`} color="#A1A1AA" />
                      )}
                    </div>
                    <div className="text-[9px] font-mono text-zinc-500 truncate mt-0.5">{provider.base_url}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggleActive(provider)}
                      className={`h-5 w-9 rounded-full relative transition-colors ${provider.is_active ? 'bg-[#00E676]/30' : 'bg-white/10'}`}
                      title={provider.is_active ? 'Disable' : 'Enable'}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${provider.is_active ? 'right-0.5 bg-[#00E676]' : 'left-0.5 bg-zinc-500'}`} />
                    </button>
                    <button
                      onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                      className="text-zinc-500 hover:text-white"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-3 py-2.5 space-y-2">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Requests', value: provider.stats?.requests || 0, color: '#00E676' },
                        { label: 'Errors', value: provider.stats?.errors || 0, color: '#FF3B30' },
                        { label: 'Tokens In', value: ((provider.stats?.tokens_input || 0) / 1000).toFixed(1) + 'K', color: '#F5A623' },
                      ].map(s => (
                        <div key={s.label} className="bg-white/3 rounded p-1.5">
                          <div className="text-[8px] text-zinc-500 uppercase tracking-wider">{s.label}</div>
                          <div className="text-xs font-mono font-bold" style={{ color: s.color }}>{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Test result */}
                    {tr && (
                      <div className={`px-2 py-1.5 rounded text-[10px] font-mono ${tr.ok ? 'bg-[#00E676]/10 text-[#00E676]' : 'bg-[#FF3B30]/10 text-[#FF3B30]'}`}>
                        {tr.ok
                          ? `OK · ${tr.latency_ms}ms · "${tr.reply?.slice(0, 40)}"`
                          : `Error: ${tr.error?.slice(0, 80)}`}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleTest(provider)}
                        disabled={testingId === provider.id}
                        className="h-6 px-2.5 text-[9px] font-bold uppercase tracking-wider border border-[#00E676]/30 text-[#00E676] hover:bg-[#00E676]/10 flex items-center gap-1 disabled:opacity-50"
                      >
                        {testingId === provider.id
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <CheckCircle2 className="w-2.5 h-2.5" />
                        }
                        Test
                      </button>
                      <button
                        onClick={() => handleSyncModels(provider)}
                        disabled={syncingId === provider.id}
                        className="h-6 px-2.5 text-[9px] font-bold uppercase tracking-wider border border-white/10 text-zinc-400 hover:text-white flex items-center gap-1 disabled:opacity-50"
                      >
                        {syncingId === provider.id
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <RefreshCw className="w-2.5 h-2.5" />
                        }
                        Sync Models
                      </button>
                      {provider.id !== 'opencode-free' && (
                        <button
                          onClick={() => handleDelete(provider)}
                          className="h-6 px-2.5 text-[9px] font-bold uppercase tracking-wider border border-[#FF3B30]/30 text-[#FF3B30] hover:bg-[#FF3B30]/10 flex items-center gap-1 ml-auto"
                        >
                          <Trash2 className="w-2.5 h-2.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Models list */}
        {models.length > 0 && (
          <div className="px-3 pb-4">
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-2">
              Available Models ({models.length})
            </div>
            <div className="grid grid-cols-2 gap-1">
              {models.map(m => (
                <div
                  key={`${m.provider_id}-${m.id}`}
                  className="px-2 py-1 bg-white/3 border border-white/5 rounded flex items-center gap-1.5"
                  title={m.provider_name}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: getModelColor(m.id) }}
                  />
                  <span className="text-[9px] font-mono text-zinc-300 truncate">{m.id}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Integration hint */}
        <div className="mx-3 mb-4 px-3 py-2.5 border border-[#A855F7]/20 bg-[#A855F7]/5 rounded">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#A855F7] mb-1.5">
            How It Works
          </div>
          <div className="text-[9px] text-zinc-400 leading-relaxed space-y-1">
            <p>All AI features (MiroFish, GPT Analysis, AI Ensemble) auto-route through configured providers.</p>
            <p className="text-[#00E676]">Emergent LLM = FREE Claude Sonnet, GPT-4o, Gemini — active by default!</p>
            <p>OpenCode Free = 45+ models (Claude Opus 4.7, GPT-5.5...). Enable after running <span className="font-mono text-zinc-300">9router</span> locally.</p>
            <p>Add any OpenAI-compatible endpoint as a custom provider with your API key.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIRouterPanel;
