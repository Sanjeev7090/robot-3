"""
NSE Direct Provider (curl_cffi)
Bypasses NSE bot-detection using Chrome impersonation.
Primary provider for option chains, live quotes, top gainers, and intraday data.
"""
import logging
import time
from typing import Optional, Dict, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

try:
    from curl_cffi import requests as _cffi_req
    _CFFI_OK = True
except ImportError:
    _CFFI_OK = False
    logger.warning("curl_cffi not installed — NSEDirect disabled")

# ─── Session Pool ─────────────────────────────────────────────────────
_session: Optional[object] = None
_session_ts: float = 0.0
_SESSION_TTL = 25 * 60  # 25 minutes


def _get_session():
    global _session, _session_ts
    if not _CFFI_OK:
        return None
    now = time.time()
    if _session is not None and (now - _session_ts) < _SESSION_TTL:
        return _session
    try:
        s = _cffi_req.Session(impersonate="chrome120")
        s.get("https://www.nseindia.com/", timeout=8)
        _session    = s
        _session_ts = now
        return s
    except Exception as e:
        logger.debug(f"NSEDirect session init error: {e}")
        return None


def _nse_get(url: str, timeout: int = 10) -> Optional[Dict]:
    """Perform an NSE API GET with cookie session. Returns parsed JSON or None."""
    s = _get_session()
    if not s:
        return None
    try:
        r = s.get(url, timeout=timeout)
        if r.status_code == 200 and len(r.content) > 10:
            return r.json()
    except Exception as e:
        logger.debug(f"NSEDirect GET error ({url[-60:]}): {e}")
    return None


# ─── Public Functions ─────────────────────────────────────────────────

def get_top_gainers_fno(n: int = 20) -> List[Dict]:
    """
    Fetch NSE F&O top gainers (SecGtr20 segment — stocks with >20 Cr daily turnover).
    """
    data = _nse_get("https://www.nseindia.com/api/live-analysis-variations?index=gainers")
    if not data:
        return []
    try:
        # SecGtr20 = F&O segment large stocks
        items = data.get("SecGtr20", data.get("NIFTY", []))
        gainers = []
        for item in items[:n]:
            try:
                gainers.append({
                    "symbol":       item["symbol"],
                    "company_name": item.get("companyName", item["symbol"]),
                    "ltp":          float(item.get("ltp", 0)),
                    "change_pct":   float(item.get("pChange", 0)),
                    "volume":       int(item.get("tradedQuantity", 0)),
                    "source":       "nse_direct",
                })
            except Exception:
                continue
        return gainers
    except Exception as e:
        logger.debug(f"NSEDirect top gainers error: {e}")
        return []


def get_quote(symbol: str) -> Optional[Dict]:
    """Live equity quote for an NSE symbol."""
    data = _nse_get(f"https://www.nseindia.com/api/quote-equity?symbol={symbol}")
    if not data:
        return None
    try:
        pi = data.get("priceInfo", {})
        return {
            "ltp":        float(pi.get("lastPrice", 0)),
            "open":       float(pi.get("open", 0)),
            "high":       float(pi.get("intraDayHighLow", {}).get("max", 0)),
            "low":        float(pi.get("intraDayHighLow", {}).get("min", 0)),
            "close":      float(pi.get("previousClose", 0)),
            "change":     float(pi.get("change", 0)),
            "pct_change": float(pi.get("pChange", 0)),
            "source":     "nse_direct",
        }
    except Exception:
        return None


def get_option_chain(symbol: str) -> Optional[Dict]:
    """
    Fetch NSE option chain for index (NIFTY, BANKNIFTY) or equity.
    Returns parsed option chain dict or None.
    """
    if symbol.upper() in ("NIFTY", "NIFTY 50"):
        url = "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY"
    elif symbol.upper() in ("BANKNIFTY", "NIFTY BANK"):
        url = "https://www.nseindia.com/api/option-chain-indices?symbol=BANKNIFTY"
    else:
        url = f"https://www.nseindia.com/api/option-chain-equities?symbol={symbol.upper()}"

    data = _nse_get(url, timeout=12)
    if not data:
        return None
    try:
        records = data.get("records", {})
        return {
            "expiry_dates": records.get("expiryDates", []),
            "timestamp":    records.get("timestamp", ""),
            "underlying":   records.get("underlyingValue", 0),
            "data":         records.get("data", []),
            "source":       "nse_direct",
        }
    except Exception as e:
        logger.debug(f"NSEDirect option chain parse error: {e}")
        return None


def get_indices() -> Optional[Dict]:
    """Fetch NIFTY 50, BANK NIFTY live prices."""
    data = _nse_get("https://www.nseindia.com/api/allIndices")
    if not data:
        return None
    try:
        result = {}
        for item in data.get("data", []):
            name = item.get("index", "")
            key_map = {
                "NIFTY 50":   "NIFTY",
                "NIFTY BANK": "BANKNIFTY",
                "NIFTY IT":   "CNXIT",
                "SENSEX":     "SENSEX",
            }
            for full, short in key_map.items():
                if name == full:
                    result[short] = {
                        "ltp":    float(item.get("last", 0)),
                        "change": float(item.get("variation", 0)),
                        "pct":    float(item.get("percentChange", 0)),
                    }
        return result if result else None
    except Exception as e:
        logger.debug(f"NSEDirect indices error: {e}")
        return None
