import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  X, TelegramLogo, Plus, Trash, PencilSimple, CheckCircle,
  PaperPlaneTilt, ArrowsClockwise,
} from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ---- Empty form preset ----
const blankForm = { name: '', bot_token: '', chat_id: '', enabled: true };

const TelegramChannelsPanel = ({ open, onClose, resultsToSend = [], onSentSuccess }) => {
  const [channels, setChannels]       = useState([]);
  const [loading,  setLoading]        = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [form,     setForm]           = useState(blankForm);
  const [editingId,setEditingId]      = useState(null);
  const [testingId,setTestingId]      = useState(null);
  const [selected, setSelected]       = useState(new Set());
  const [sending,  setSending]        = useState(false);
  const [status,   setStatus]         = useState(null);   // {type:'success'|'error', msg}

  // ---- API helpers ----
  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/stock-finder/telegram-channels`);
      setChannels(data.channels || []);
      // Default-select all enabled channels
      const enabledIds = new Set((data.channels || []).filter(c => c.enabled).map(c => c.id));
      setSelected(enabledIds);
    } catch (e) {
      setStatus({ type: 'error', msg: 'Could not load channels' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) loadChannels(); }, [open, loadChannels]);

  const saveChannel = async () => {
    if (!form.name.trim() || !form.bot_token.trim() || !form.chat_id.trim()) {
      setStatus({ type: 'error', msg: 'All fields required' });
      return;
    }
    try {
      if (editingId) {
        await axios.put(`${API}/stock-finder/telegram-channels/${editingId}`, form);
        setStatus({ type: 'success', msg: 'Channel updated' });
      } else {
        await axios.post(`${API}/stock-finder/telegram-channels`, form);
        setStatus({ type: 'success', msg: 'Channel added' });
      }
      setForm(blankForm);
      setEditingId(null);
      setShowForm(false);
      await loadChannels();
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Save failed' });
    }
  };

  const deleteChannel = async (id) => {
    if (!window.confirm('Delete this channel?')) return;
    try {
      await axios.delete(`${API}/stock-finder/telegram-channels/${id}`);
      await loadChannels();
      setStatus({ type: 'success', msg: 'Channel removed' });
    } catch (e) {
      setStatus({ type: 'error', msg: 'Delete failed' });
    }
  };

  const testChannel = async (id) => {
    setTestingId(id);
    setStatus(null);
    try {
      const { data } = await axios.post(`${API}/stock-finder/telegram-test/${id}`);
      if (data.ok) setStatus({ type: 'success', msg: 'Test message sent successfully!' });
      else setStatus({ type: 'error', msg: data.telegram?.description || data.error || 'Test failed' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Test failed' });
    } finally {
      setTestingId(null);
    }
  };

  const sendNow = async () => {
    if (selected.size === 0) {
      setStatus({ type: 'error', msg: 'Select at least one channel' });
      return;
    }
    if (resultsToSend.length === 0) {
      setStatus({ type: 'error', msg: 'No results to send — run a scan first' });
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const { data } = await axios.post(`${API}/stock-finder/telegram-send`, {
        channel_ids: Array.from(selected),
        results:     resultsToSend,
      });
      if (data.ok) {
        setStatus({ type: 'success',
          msg: `Sent to ${data.channels_sent}/${data.total_channels} channel(s) · ${data.chunks_per_channel} msg each` });
        if (onSentSuccess) onSentSuccess(data);
      } else {
        const errMsgs = (data.results || [])
          .filter(r => !r.ok)
          .map(r => `${r.name}: ${r.errors.join(', ')}`).join(' | ');
        setStatus({ type: 'error', msg: `Partial failure — ${errMsgs}` });
      }
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Send failed' });
    } finally {
      setSending(false);
    }
  };

  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openEditForm = (ch) => {
    setForm({
      name:      ch.name,
      bot_token: '',                          // Don't prefill token (security)
      chat_id:   ch.chat_id,
      enabled:   ch.enabled,
    });
    setEditingId(ch.id);
    setShowForm(true);
  };

  const openAddForm = () => {
    setForm(blankForm);
    setEditingId(null);
    setShowForm(true);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3"
      onClick={onClose}
      data-testid="telegram-channels-panel"
    >
      <div
        className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-2xl flex flex-col shadow-2xl"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/25 flex items-center justify-center">
              <TelegramLogo size={16} className="text-[#229ED9]" weight="fill" />
            </div>
            <div>
              <h3 className="text-[13px] font-black text-white">Telegram Channels</h3>
              <p className="text-[9px] text-zinc-600">
                {resultsToSend.length > 0
                  ? `${resultsToSend.length} setups ready to send`
                  : 'Run a scan to enable Send'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1.5" data-testid="close-telegram-panel">
            <X size={16} />
          </button>
        </div>

        {/* Status */}
        {status && (
          <div className={`px-4 py-2 text-[10px] font-bold border-b ${
            status.type === 'success'
              ? 'bg-[#00E676]/10 text-[#00E676] border-[#00E676]/20'
              : 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20'
          }`} data-testid="telegram-status">
            {status.msg}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Channel list */}
          {loading ? (
            <p className="text-[10px] text-zinc-600 text-center py-4">Loading channels…</p>
          ) : channels.length === 0 && !showForm ? (
            <div className="text-center py-6 space-y-3">
              <TelegramLogo size={32} weight="duotone" className="text-zinc-700 mx-auto" />
              <div>
                <p className="text-[12px] font-bold text-white mb-1">No channels yet</p>
                <p className="text-[10px] text-zinc-500 max-w-xs mx-auto">
                  Bot create karo (@BotFather), token paao, channel me add karo as admin, fir yahaan save kar do
                </p>
              </div>
              <button
                onClick={openAddForm}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold bg-[#229ED9]/15 text-[#229ED9] border border-[#229ED9]/25 hover:bg-[#229ED9]/25 transition-colors"
                data-testid="add-channel-empty"
              >
                <Plus size={11} weight="bold" /> Add First Channel
              </button>
            </div>
          ) : (
            channels.map(ch => (
              <div
                key={ch.id}
                className={`border rounded-lg p-3 transition-colors ${
                  selected.has(ch.id) ? 'border-[#229ED9]/40 bg-[#229ED9]/[0.06]' : 'border-white/10 bg-white/[0.02]'
                }`}
                data-testid={`channel-row-${ch.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-start gap-2 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(ch.id)}
                      onChange={() => toggleSelected(ch.id)}
                      className="mt-1 accent-[#229ED9]"
                      data-testid={`channel-checkbox-${ch.id}`}
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{ch.name}</p>
                      <p className="text-[9px] text-zinc-500 font-mono truncate">
                        chat: {ch.chat_id} · bot: {ch.bot_token_preview}
                      </p>
                      {!ch.enabled && (
                        <span className="inline-block mt-1 text-[8px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 font-bold">DISABLED</span>
                      )}
                    </div>
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => testChannel(ch.id)}
                      disabled={testingId === ch.id}
                      title="Send test message"
                      className="p-1.5 rounded text-zinc-400 hover:text-[#00E676] hover:bg-[#00E676]/10 transition-colors disabled:opacity-40"
                      data-testid={`channel-test-${ch.id}`}
                    >
                      {testingId === ch.id
                        ? <ArrowsClockwise size={12} weight="bold" className="animate-spin" />
                        : <CheckCircle size={12} weight="bold" />}
                    </button>
                    <button
                      onClick={() => openEditForm(ch)}
                      title="Edit"
                      className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                      data-testid={`channel-edit-${ch.id}`}
                    >
                      <PencilSimple size={12} weight="bold" />
                    </button>
                    <button
                      onClick={() => deleteChannel(ch.id)}
                      title="Delete"
                      className="p-1.5 rounded text-zinc-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 transition-colors"
                      data-testid={`channel-delete-${ch.id}`}
                    >
                      <Trash size={12} weight="bold" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Add button when channels exist */}
          {!showForm && channels.length > 0 && (
            <button
              onClick={openAddForm}
              className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-white/15 text-[10px] font-bold text-zinc-400 hover:text-white hover:border-white/30 transition-colors"
              data-testid="add-channel-btn"
            >
              <Plus size={11} weight="bold" /> Add Another Channel
            </button>
          )}

          {/* Add / Edit form */}
          {showForm && (
            <div className="border border-[#229ED9]/30 bg-[#229ED9]/[0.04] rounded-lg p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#229ED9]">
                {editingId ? 'Edit Channel' : 'New Channel'}
              </p>
              <div>
                <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Channel Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="My Trading Signals"
                  className="w-full mt-1 bg-[#0A0A0A] border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-[#229ED9]/50"
                  data-testid="channel-form-name"
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                  Bot Token{editingId && <span className="ml-1 text-zinc-600 normal-case">(leave blank to keep existing)</span>}
                </label>
                <input
                  type="password"
                  value={form.bot_token}
                  onChange={e => setForm({ ...form, bot_token: e.target.value })}
                  placeholder="123456789:ABC-DEF..."
                  className="w-full mt-1 bg-[#0A0A0A] border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white font-mono outline-none focus:border-[#229ED9]/50"
                  data-testid="channel-form-token"
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Chat ID</label>
                <input
                  type="text"
                  value={form.chat_id}
                  onChange={e => setForm({ ...form, chat_id: e.target.value })}
                  placeholder="@yourchannel or -100123456789"
                  className="w-full mt-1 bg-[#0A0A0A] border border-white/10 rounded px-2.5 py-1.5 text-[11px] text-white font-mono outline-none focus:border-[#229ED9]/50"
                  data-testid="channel-form-chatid"
                />
              </div>
              <label className="flex items-center gap-2 text-[10px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => setForm({ ...form, enabled: e.target.checked })}
                  className="accent-[#229ED9]"
                />
                Enabled
              </label>

              <div className="text-[9px] text-zinc-500 bg-white/[0.03] rounded p-2 leading-relaxed">
                <p className="font-bold text-zinc-400 mb-1">Setup help:</p>
                <p>1. Open <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-[#229ED9] underline">@BotFather</a> → /newbot → copy token</p>
                <p>2. Create channel → add your bot as Admin (with Post permission)</p>
                <p>3. For chat_id: use @channelname OR forward a channel message to <a href="https://t.me/getidsbot" target="_blank" rel="noopener noreferrer" className="text-[#229ED9] underline">@getidsbot</a></p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={saveChannel}
                  className="flex-1 px-3 py-1.5 rounded-full text-[10px] font-bold bg-[#229ED9]/20 text-[#229ED9] border border-[#229ED9]/30 hover:bg-[#229ED9]/30 transition-colors"
                  data-testid="channel-form-save"
                >
                  {editingId ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowForm(false); setForm(blankForm); setEditingId(null); }}
                  className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 transition-colors"
                  data-testid="channel-form-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer — Send button */}
        <div className="px-4 py-3 border-t border-white/10 shrink-0 flex items-center justify-between gap-2">
          <span className="text-[9px] text-zinc-500">
            {selected.size > 0 ? `${selected.size} channel${selected.size > 1 ? 's' : ''} selected` : 'None selected'}
          </span>
          <button
            onClick={sendNow}
            disabled={sending || selected.size === 0 || resultsToSend.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black bg-[#229ED9]/20 text-[#229ED9] border border-[#229ED9]/30 hover:bg-[#229ED9]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            data-testid="send-to-channels"
          >
            {sending
              ? <><ArrowsClockwise size={12} weight="bold" className="animate-spin" /> Sending…</>
              : <><PaperPlaneTilt size={12} weight="fill" /> Send to Channels</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TelegramChannelsPanel;
