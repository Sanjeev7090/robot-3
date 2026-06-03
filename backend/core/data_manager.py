"""
Unified Data Manager
Provides a single entry point for all market data with:
  - Priority-based provider fallback
  - In-memory TTL caching (Redis-compatible interface; swap in real Redis as needed)
  - Async wrappers for FastAPI compatibility

Priority order (fastest / most reliable first):
  get_quote       : Groww > NSEDirect > NSEPython > yfinance
  download_multi  : Cache > yfinance (primary for historical/index data)
  get_option_chain: NSEDirect > NSEPython
  get_top_gainers : NSEDirect > NSEPython > yfinance-compute
  get_single_ohlcv: Groww > yfinance
"""
import asyncio
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Any

import pandas as pd

from data_providers import yfinance_fb, nse_python, nse_direct, groww

logger = logging.getLogger(__name__)

# ─── TTL Cache (Redis-drop-in for future swap) ─────────────────────
class TTLCache:
    """
    Thread-safe in-memory cache with per-key TTL.
    Interface mirrors redis-py: get / set / delete / clear.
    To swap for real Redis: replace _store operations with redis.Redis calls.
    """

    def __init__(self):
        self._store: Dict[str, Dict[str, Any]] = {}
        self._lock  = threading.RLock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            if time.monotonic() > item["exp"]:
                del self._store[key]
                return None
            return item["val"]

    def set(self, key: str, val: Any, ttl: float) -> None:
        with self._lock:
            self._store[key] = {"val": val, "exp": time.monotonic() + ttl}

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        with self._lock:
            now = time.monotonic()
            self._store = {k: v for k, v in self._store.items() if v["exp"] > now}
            return len(self._store)


# ─── TTL Constants (seconds) ──────────────────────────────────────
TTL_QUOTE       = 10     # Live quote
TTL_INTRADAY    = 30     # Intraday OHLCV
TTL_DAILY       = 300    # Daily OHLCV  (5 min)
TTL_WEEKLY      = 1800   # Weekly OHLCV (30 min)
TTL_GAINERS     = 60     # Top gainers
TTL_OI          = 30     # Option chain
TTL_INDICES     = 10     # Index prices


# ─── DataManager ─────────────────────────────────────────────────
class DataManager:
    """
    Singleton unified data manager.
    All methods have sync AND async variants.
    """

    def __init__(self):
        self.cache    = TTLCache()
        self._executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="dm")

    # ─── Quote ──────────────────────────────────────────────────────
    def get_quote_sync(self, symbol: str) -> Optional[Dict]:
        """Get live quote. symbol = 'RELIANCE' (no .NS suffix)."""
        key = f"quote:{symbol}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        # 1. Groww (fastest, real-time)
        ltp = groww.get_ltp(symbol)
        if ltp:
            result = {"ltp": ltp, "source": "groww"}
            self.cache.set(key, result, TTL_QUOTE)
            return result

        # 2. NSEDirect (curl_cffi)
        result = nse_direct.get_quote(symbol)
        if result:
            self.cache.set(key, result, TTL_QUOTE)
            return result

        # 3. NSEPython
        result = nse_python.get_quote(symbol)
        if result:
            self.cache.set(key, result, TTL_QUOTE)
            return result

        # 4. yfinance
        result = yfinance_fb.get_quote_single(f"{symbol}.NS")
        if result:
            self.cache.set(key, result, TTL_QUOTE)
        return result

    async def get_quote(self, symbol: str) -> Optional[Dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.get_quote_sync, symbol)

    # ─── Multi-ticker OHLCV Download (yfinance-compatible) ───────────
    def download_multi_sync(
        self,
        tickers: List[str],
        period:  str = "1y",
        interval:str = "1d",
    ) -> pd.DataFrame:
        """
        Download OHLCV for multiple tickers.
        Returns yfinance-style MultiIndex DataFrame (same as yf.download).
        Caches aggressively — 30 min for weekly, 5 min for daily.
        """
        key = f"ohlcv_multi:{','.join(sorted(tickers)[:5])}:{period}:{interval}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        ttl = TTL_WEEKLY if interval in ("1wk", "1mo") else TTL_DAILY

        # yfinance is primary for historical/index data (reliable, always works)
        df = yfinance_fb.download_multi(tickers, period=period, interval=interval)
        if not df.empty:
            self.cache.set(key, df, ttl)
            return df

        logger.warning(f"download_multi: all providers failed for {tickers[:3]}")
        return pd.DataFrame()

    async def download_multi(
        self,
        tickers:  List[str],
        period:   str = "1y",
        interval: str = "1d",
    ) -> pd.DataFrame:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor, self.download_multi_sync, tickers, period, interval
        )

    # ─── Single-ticker OHLCV ──────────────────────────────────────────
    def get_single_ohlcv_sync(
        self,
        ticker:   str,
        period:   str = "5d",
        interval: str = "1h",
    ) -> pd.DataFrame:
        """
        Get OHLCV for a single ticker (e.g. 'RELIANCE.NS' or 'RELIANCE').
        Tries Groww candles first, falls back to yfinance.
        """
        # Normalise: 'RELIANCE' → Groww, 'RELIANCE.NS' → yfinance
        sym_clean = ticker.replace(".NS", "").upper()
        key = f"ohlcv_single:{sym_clean}:{period}:{interval}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        ttl = TTL_INTRADAY if interval in ("1m", "5m", "15m", "1h") else TTL_DAILY

        # 1. Groww candles (real-time, best for intraday)
        interval_to_groww = {
            "1h": "1h", "4h": "4h", "1d": "1d",
            "30m": "30m", "15m": "15m", "5m": "5m", "1m": "1m",
        }
        if interval in interval_to_groww and groww.is_available():
            days_map = {"5d": 5, "1d": 1, "8d": 8, "30d": 30}
            days = days_map.get(period, 5)
            candles = groww.get_ohlcv(sym_clean, interval=interval_to_groww[interval], days_back=days)
            if candles:
                df = groww.candles_to_df(candles)
                if not df.empty:
                    self.cache.set(key, df, ttl)
                    return df

        # 2. yfinance
        yf_ticker = ticker if "." in ticker else f"{ticker}.NS"
        df = yfinance_fb.get_history_single(yf_ticker, period=period, interval=interval)
        if not df.empty:
            self.cache.set(key, df, ttl)
        return df

    async def get_single_ohlcv(
        self,
        ticker:   str,
        period:   str = "5d",
        interval: str = "1h",
    ) -> pd.DataFrame:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor, self.get_single_ohlcv_sync, ticker, period, interval
        )

    # ─── Weekly % Change (for Moneycontrol Movers) ───────────────────
    def get_weekly_change_sync(self, tickers: List[str]) -> Dict[str, float]:
        """
        Compute 1-week % price change for a list of tickers.
        Returns {ticker: pct_change} dict. tickers can be yf-format (.NS) or plain.
        """
        key = f"wkchg:{','.join(sorted(tickers)[:8])}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        raw = self.download_multi_sync(tickers, period="8d", interval="1d")
        result: Dict[str, float] = {}

        if raw.empty:
            return result

        closes = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw[["Close"]]

        for ticker in tickers:
            try:
                col = closes[ticker] if ticker in closes.columns else None
                if col is None:
                    continue
                col = col.dropna()
                if len(col) < 2:
                    continue
                pct = float((col.iloc[-1] - col.iloc[0]) / col.iloc[0] * 100)
                result[ticker] = round(pct, 2)
            except Exception:
                continue

        if result:
            self.cache.set(key, result, TTL_DAILY)
        return result

    async def get_weekly_change(self, tickers: List[str]) -> Dict[str, float]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.get_weekly_change_sync, tickers)

    # ─── Top F&O Gainers ──────────────────────────────────────────────
    def get_top_gainers_fno_sync(self, n: int = 20) -> List[Dict]:
        """
        Fetch top F&O gainers today. Priority: NSEDirect > NSEPython.
        Returns list of {symbol, company_name, ltp, change_pct, ...}
        """
        key = f"top_gainers_fno:{n}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        # 1. NSEDirect (curl_cffi — best in production)
        result = nse_direct.get_top_gainers_fno(n)
        if len(result) >= 3:
            self.cache.set(key, result, TTL_GAINERS)
            return result

        # 2. NSEPython
        result = nse_python.get_top_gainers("SecGtr20")
        if len(result) >= 3:
            self.cache.set(key, result, TTL_GAINERS)
            return result

        return []

    async def get_top_gainers_fno(self, n: int = 20) -> List[Dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.get_top_gainers_fno_sync, n)

    # ─── Option Chain ─────────────────────────────────────────────────
    def get_option_chain_sync(self, symbol: str) -> Optional[Dict]:
        """
        Get NSE option chain. Priority: NSEDirect > NSEPython.
        """
        key = f"optchain:{symbol.upper()}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        result = nse_direct.get_option_chain(symbol)
        if result:
            self.cache.set(key, result, TTL_OI)
            return result

        result = nse_python.get_option_chain(symbol)
        if result:
            self.cache.set(key, result, TTL_OI)
        return result

    async def get_option_chain(self, symbol: str) -> Optional[Dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.get_option_chain_sync, symbol)

    # ─── Indices ──────────────────────────────────────────────────────
    def get_indices_sync(self) -> Optional[Dict]:
        """Get live index prices. Priority: NSEDirect > NSEPython."""
        key = "indices:live"
        cached = self.cache.get(key)
        if cached is not None:
            return cached

        result = nse_direct.get_indices()
        if result:
            self.cache.set(key, result, TTL_INDICES)
            return result

        # NSEPython fallback for each index
        try:
            nse_indices = {"NIFTY 50": "NIFTY", "NIFTY BANK": "BANKNIFTY"}
            result = {}
            for nse_name, key_short in nse_indices.items():
                q = nse_python.get_index_quote(nse_name)
                if q:
                    result[key_short] = {"ltp": q["ltp"], "pct": q["pct_change"]}
            if result:
                self.cache.set("indices:live", result, TTL_INDICES)
                return result
        except Exception:
            pass
        return None

    async def get_indices(self) -> Optional[Dict]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.get_indices_sync)

    # ─── Cache Management ─────────────────────────────────────────────
    def cache_stats(self) -> Dict:
        return {"size": self.cache.size()}

    def invalidate(self, pattern: str = "") -> None:
        """Clear cache entries matching pattern prefix, or all if empty."""
        if not pattern:
            self.cache.clear()
        else:
            with self.cache._lock:
                keys_to_del = [k for k in self.cache._store if k.startswith(pattern)]
                for k in keys_to_del:
                    del self.cache._store[k]


# ─── Singleton ───────────────────────────────────────────────────────
dm = DataManager()
