"""
NSEPython Provider
Uses nsepython library for NSE data.
NOTE: May be blocked in container environments (NSE IP restriction).
Works in production deployments with proper egress IPs.
"""
import logging
from typing import List, Optional, Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

try:
    from nsepython import (
        nse_quote_ltp,
        nse_quote,
        nse_get_top_gainers,
        nse_get_top_losers,
        nse_get_index_quote,
        equity_history,
        index_history,
        nse_optionchain_scrapper,
    )
    _OK = True
except ImportError:
    _OK = False
    logger.warning("nsepython not installed")

# Map yfinance index tickers → NSE index names
YF_TO_NSE_INDEX = {
    "^NSEI":      "NIFTY 50",
    "^NSEBANK":   "NIFTY BANK",
    "^CNXIT":     "NIFTY IT",
    "^CNXAUTO":   "NIFTY AUTO",
    "^CNXFMCG":   "NIFTY FMCG",
    "^CNXPHARMA": "NIFTY PHARMA",
    "^CNXMETAL":  "NIFTY METAL",
    "^CNXREALTY": "NIFTY REALTY",
    "^CNXENERGY": "NIFTY ENERGY",
    "^CNXINFRA":  "NIFTY INFRA",
    "^CNXMEDIA":  "NIFTY MEDIA",
    "^CNXPSUBANK":"NIFTY PSU BANK",
}


def _safe_call(fn, *args, **kwargs):
    """Call an nsepython function with timeout protection."""
    if not _OK:
        return None
    try:
        import signal

        def _timeout(signum, frame):
            raise TimeoutError("nsepython timeout")

        signal.signal(signal.SIGALRM, _timeout)
        signal.alarm(8)  # 8-second timeout
        result = fn(*args, **kwargs)
        signal.alarm(0)
        return result
    except Exception as e:
        logger.debug(f"nsepython {fn.__name__} error: {e}")
        return None


def get_quote(symbol: str) -> Optional[Dict]:
    """Get live quote for a stock symbol (NSE symbol, no .NS suffix)."""
    result = _safe_call(nse_quote, symbol)
    if not result:
        return None
    try:
        pi = result.get("priceInfo", {})
        return {
            "ltp":    float(pi.get("lastPrice", 0)),
            "open":   float(pi.get("open", 0)),
            "high":   float(pi.get("intraDayHighLow", {}).get("max", 0)),
            "low":    float(pi.get("intraDayHighLow", {}).get("min", 0)),
            "close":  float(pi.get("previousClose", 0)),
            "change": float(pi.get("change", 0)),
            "pct_change": float(pi.get("pChange", 0)),
            "source": "nsepython",
        }
    except Exception:
        return None


def get_ltp(symbol: str) -> Optional[float]:
    """Get last traded price for a stock."""
    result = _safe_call(nse_quote_ltp, symbol, "EQ")
    if result is not None:
        try:
            return float(result)
        except Exception:
            pass
    return None


def get_top_gainers(segment: str = "NIFTY") -> List[Dict]:
    """
    Get today's top gainers.
    segment: 'NIFTY' | 'BANKNIFTY' | 'SecGtr20' (F&O stocks >20 Cr turnover)
    """
    result = _safe_call(nse_get_top_gainers)
    if not result:
        return []
    try:
        if isinstance(result, dict):
            # Keys: NIFTY, BANKNIFTY, NIFTYNEXT50, SecGtr20, ...
            items = result.get(segment, result.get("NIFTY", []))
        elif isinstance(result, list):
            items = result
        else:
            return []

        gainers = []
        for item in items[:20]:
            try:
                gainers.append({
                    "symbol":      item.get("symbol", ""),
                    "company_name":item.get("companyName", item.get("symbol", "")),
                    "ltp":         float(item.get("ltp", 0)),
                    "change_pct":  float(item.get("pChange", 0)),
                    "volume":      int(item.get("tradedQuantity", 0)),
                    "source":      "nsepython",
                })
            except Exception:
                continue
        return gainers
    except Exception as e:
        logger.debug(f"nsepython get_top_gainers error: {e}")
        return []


def get_index_quote(index_name: str) -> Optional[Dict]:
    """Get live index quote. index_name: 'NIFTY 50', 'NIFTY BANK', etc."""
    result = _safe_call(nse_get_index_quote, index_name)
    if not result:
        return None
    try:
        return {
            "ltp":    float(result.get("last", 0)),
            "change": float(result.get("variation", 0)),
            "pct_change": float(result.get("percentChange", 0)),
            "open":   float(result.get("open", 0)),
            "high":   float(result.get("high", 0)),
            "low":    float(result.get("low", 0)),
            "source": "nsepython",
        }
    except Exception:
        return None


def get_equity_history_df(symbol: str, days: int = 8):
    """
    Get equity OHLCV history. Returns pd.DataFrame or None.
    symbol: NSE symbol without .NS (e.g. 'RELIANCE')
    """
    try:
        import pandas as pd
        end   = datetime.now().strftime("%d-%m-%Y")
        start = (datetime.now() - timedelta(days=days)).strftime("%d-%m-%Y")
        df    = _safe_call(equity_history, symbol, "EQ", start, end)
        if df is None or (hasattr(df, "empty") and df.empty):
            return None
        return df
    except Exception as e:
        logger.debug(f"nsepython equity_history error ({symbol}): {e}")
        return None


def get_option_chain(symbol: str) -> Optional[Dict]:
    """Get option chain for symbol (NIFTY, BANKNIFTY, or stock name)."""
    result = _safe_call(nse_optionchain_scrapper, symbol, "PE", 0, 999999)
    if not result:
        return None
    return {"data": result, "source": "nsepython"}
