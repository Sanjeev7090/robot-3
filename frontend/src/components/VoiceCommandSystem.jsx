import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Microphone, MicrophoneSlash, X, CheckCircle, Warning } from '@phosphor-icons/react';

const COMMANDS = [
  { pattern: /^(?:load|open|analyze|chart)\s+([A-Z0-9.]+)/i, action: 'LOAD_STOCK',    hint: '"Load RELIANCE" or "Analyze TCS"' },
  { pattern: /^run\s+(mirofish|smc|demon|godzilla|pac|amds|vwap|gpt)/i, action: 'RUN_STRATEGY', hint: '"Run MiroFish" or "Run SMC"' },
  { pattern: /^(?:go to|switch to|show)\s+(scanner|strategies|ghost|paper|rl|workspace|monte)/i, action: 'NAVIGATE', hint: '"Go to Scanner" or "Show Strategies"' },
  { pattern: /^set alert (?:at\s+)?(\d+(?:\.\d+)?)/i, action: 'SET_ALERT',    hint: '"Set alert at 2500"' },
  { pattern: /^(?:buy|sell|hold)/i,                     action: 'TRADE_SIGNAL', hint: '"Buy" or "Sell"' },
  { pattern: /^scan (?:the )?market/i,                  action: 'SCAN_MARKET',  hint: '"Scan the market"' },
];

const STRATEGY_TAB_MAP = {
  scanner: 'scanner', strategies: 'strategies', ghost: 'ghost',
  paper: 'paper', rl: 'rlagent', workspace: 'workspace', monte: 'montecarlo',
};

const STRATEGY_NAME_MAP = {
  mirofish: 'MiroFish', smc: 'SMC', demon: 'DEMON', godzilla: 'Godzilla',
  pac: 'PAC+S&O', amds: 'AMDS', vwap: 'VWAP', gpt: 'GPT',
};

export default function VoiceCommandSystem({ onLoadStock, onNavigate, onSetAlert, onRunStrategy, onScanMarket }) {
  const [listening,   setListening]   = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [feedback,    setFeedback]    = useState(null);   // {type, message}
  const [supported,   setSupported]   = useState(true);
  const [showHelp,    setShowHelp]    = useState(false);
  const recognitionRef = useRef(null);
  const feedbackTimer  = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    const rec = new SR();
    rec.continuous    = false;
    rec.interimResults = true;
    rec.lang          = 'en-IN';    // Indian English
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      const result = e.results[0];
      const text = result[0].transcript;
      setTranscript(text);
      if (result.isFinal) processCommand(text);
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech') showFeedback('error', `Error: ${e.error}`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFeedback = (type, message) => {
    clearTimeout(feedbackTimer.current);
    setFeedback({ type, message });
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  };

  const processCommand = useCallback((text) => {
    const t = text.trim();
    for (const cmd of COMMANDS) {
      const m = t.match(cmd.pattern);
      if (!m) continue;

      switch (cmd.action) {
        case 'LOAD_STOCK': {
          let symbol = m[1].toUpperCase();
          if (!symbol.includes('.')) symbol += '.NS';
          onLoadStock?.(symbol);
          showFeedback('success', `Loading ${symbol}…`);
          break;
        }
        case 'RUN_STRATEGY': {
          const strat = STRATEGY_NAME_MAP[m[1].toLowerCase()] || m[1];
          onRunStrategy?.(strat);
          showFeedback('success', `Running ${strat} analysis…`);
          break;
        }
        case 'NAVIGATE': {
          const dest = m[1].toLowerCase();
          const tabId = STRATEGY_TAB_MAP[dest] || dest;
          onNavigate?.(tabId);
          showFeedback('success', `Navigated to ${m[1]}`);
          break;
        }
        case 'SET_ALERT': {
          const price = parseFloat(m[1]);
          onSetAlert?.(price);
          showFeedback('success', `Alert set at ₹${price.toFixed(2)}`);
          break;
        }
        case 'TRADE_SIGNAL':
          showFeedback('success', `Signal: ${t.toUpperCase()}`);
          break;
        case 'SCAN_MARKET':
          onScanMarket?.();
          showFeedback('success', 'Scanning market…');
          break;
        default: break;
      }
      setTranscript('');
      return;
    }
    showFeedback('error', `Unrecognized: "${t.substring(0, 40)}"`);
    setTranscript('');
  }, [onLoadStock, onNavigate, onSetAlert, onRunStrategy, onScanMarket]);

  const toggleListen = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      setTranscript('');
    } else {
      try {
        rec.start();
        setListening(true);
        setTranscript('');
      } catch { /* already running */ }
    }
  };

  if (!supported) return null;

  return (
    <div className="fixed bottom-20 right-4 z-[90] flex flex-col items-end gap-2" data-testid="voice-command-system">

      {/* Help panel */}
      {showHelp && (
        <div className="bg-[#0d0d0d] border border-white/10 rounded-xl p-4 w-72 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">Voice Commands</span>
            <button onClick={() => setShowHelp(false)} className="text-zinc-500 hover:text-white"><X size={14} /></button>
          </div>
          <div className="space-y-2">
            {COMMANDS.map((c, i) => (
              <div key={i} className="text-[10px]">
                <span className="text-violet-400 font-mono">{c.hint}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-zinc-600 mt-3 border-t border-white/5 pt-2">
            Supports Hindi accented English (en-IN)
          </p>
        </div>
      )}

      {/* Transcript bubble */}
      {(listening || transcript) && (
        <div className="bg-[#0d0d0d] border border-violet-500/30 rounded-xl px-4 py-2 max-w-[280px] shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-[10px] text-violet-400 font-bold uppercase tracking-widest">Listening…</span>
          </div>
          {transcript && <p className="text-xs text-white font-mono">{transcript}</p>}
        </div>
      )}

      {/* Feedback bubble */}
      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2 border shadow-xl ${
          feedback.type === 'success'
            ? 'bg-emerald-950/80 border-emerald-500/30'
            : 'bg-red-950/80 border-red-500/30'
        }`}>
          {feedback.type === 'success'
            ? <CheckCircle size={14} className="text-emerald-400 shrink-0" />
            : <Warning      size={14} className="text-red-400 shrink-0" />}
          <span className={`text-xs font-mono ${feedback.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
            {feedback.message}
          </span>
        </div>
      )}

      {/* Mic button */}
      <div className="flex items-center gap-2">
        {/* Help toggle */}
        <button
          onClick={() => setShowHelp(h => !h)}
          className="w-8 h-8 rounded-full bg-[#1a1a2e] border border-white/10 flex items-center justify-center text-zinc-500 hover:text-white hover:border-white/30 transition-all"
          title="Voice command help"
          data-testid="voice-help-btn"
        >
          <span className="text-[11px] font-bold">?</span>
        </button>

        {/* Main mic button */}
        <button
          onClick={toggleListen}
          data-testid="voice-mic-btn"
          className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
            listening
              ? 'bg-violet-600 scale-110 shadow-violet-500/40'
              : 'bg-[#1a1a2e] border border-white/15 hover:border-violet-500/50 hover:scale-105'
          }`}
        >
          {/* Pulse rings when listening */}
          {listening && (
            <>
              <span className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
              <span className="absolute inset-[-4px] rounded-full border border-violet-500/30 animate-pulse" />
            </>
          )}
          {listening
            ? <MicrophoneSlash size={20} weight="fill" className="text-white relative z-10" />
            : <Microphone      size={20} weight="fill" className="text-violet-400 relative z-10" />}
        </button>
      </div>
    </div>
  );
}
