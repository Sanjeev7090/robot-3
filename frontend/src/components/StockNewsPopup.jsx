import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Newspaper, ArrowSquareOut, Clock } from '@phosphor-icons/react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StockNewsPopup = ({ ticker, onClose }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    const fetchNews = async () => {
      setLoading(true);
      try {
        const { data } = await axios.get(`${API}/news/${ticker}`);
        if (!cancelled) setNews(data.news || []);
      } catch {
        if (!cancelled) setNews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchNews();
    return () => { cancelled = true; };
  }, [ticker]);

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now - d;
      const diffH = Math.floor(diffMs / 3600000);
      if (diffH < 1) return `${Math.floor(diffMs / 60000)}m ago`;
      if (diffH < 24) return `${diffH}h ago`;
      const diffD = Math.floor(diffH / 24);
      return `${diffD}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 px-4" data-testid="news-popup-overlay">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#111] border border-white/10 rounded-lg shadow-2xl max-h-[70vh] flex flex-col animate-fade-in" data-testid="news-popup-modal">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Newspaper size={16} className="text-sky-400" weight="fill" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">{ticker}</span>
            <span className="text-[10px] text-zinc-500">Latest News</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors" data-testid="news-popup-close">
            <X size={16} className="text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && (
            <div className="py-8 text-center animate-pulse">
              <Newspaper size={24} className="text-sky-400/50 mx-auto mb-2" />
              <p className="text-[10px] text-zinc-500">Fetching news...</p>
            </div>
          )}

          {!loading && news.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-[10px] text-zinc-500">No recent news found for {ticker}</p>
            </div>
          )}

          {!loading && news.map((item, idx) => (
            <a
              key={idx}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2.5 border border-white/5 rounded hover:border-white/15 hover:bg-white/[0.02] transition-all group"
              data-testid={`news-item-${idx}`}
            >
              <div className="flex gap-2.5">
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    className="w-16 h-12 object-cover rounded shrink-0 bg-zinc-800"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-[11px] font-semibold text-zinc-200 leading-tight line-clamp-2 group-hover:text-white transition-colors">
                    {item.title}
                    <ArrowSquareOut size={10} className="inline ml-1 text-zinc-600 group-hover:text-sky-400" />
                  </h4>
                  {item.summary && (
                    <p className="text-[9px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{item.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {item.source && (
                      <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider">{item.source}</span>
                    )}
                    {item.published && (
                      <span className="flex items-center gap-0.5 text-[8px] text-zinc-600">
                        <Clock size={8} />
                        {formatTime(item.published)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StockNewsPopup;
