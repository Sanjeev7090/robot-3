"""
Groww Provider
Wrapper around the existing groww_service.py for live prices and candles.
Only available when GROWW_API_KEY + GROWW_API_SECRET are configured.
"""
import logging
import os
from typing import Optional, Dict, List

import pandas as pd

logger = logging.getLogger(__name__)

_GROWW_OK: Optional[bool] = None   # None = not yet tested


def _check_groww() -> bool:
    global _GROWW_OK
    if _GROWW_OK is not None:
        return _GROWW_OK
    has_keys = bool(os.environ.get("GROWW_API_KEY")) and bool(os.environ.get("GROWW_API_SECRET"))
    if not has_keys:
        _GROWW_OK = False
        return False
    try:
        import groww_service  # noqa — just check it's importable
        _GROWW_OK = True
    except Exception as e:
        logger.warning(f"Groww service unavailable: {e}")
        _GROWW_OK = False
    return _GROWW_OK


def get_ltp(symbol: str, exchange: str = "NSE") -> Optional[float]:
    """Get last traded price via Groww. symbol = 'RELIANCE' (no exchange prefix)."""
    if not _check_groww():
        return None
    try:
        import groww_service as gs
        key = f"{exchange}_{symbol.upper()}"
        result = gs.get_ltp([key])
        if result and key in result:
            return float(result[key])
    except Exception as e:
        logger.debug(f"Groww LTP error ({symbol}): {e}")
    return None


def get_multi_ltp(symbols: List[str], exchange: str = "NSE") -> Dict[str, float]:
    """
    Get multiple LTPs at once. Returns {symbol: ltp} dict.
    symbols = ['RELIANCE', 'TCS', ...]
    """
    if not _check_groww():
        return {}
    try:
        import groww_service as gs
        keys = [f"{exchange}_{s.upper()}" for s in symbols]
        result = gs.get_ltp(keys)
        return {
            s: float(result[f"{exchange}_{s.upper()}"])
            for s in symbols
            if f"{exchange}_{s.upper()}" in result
        }
    except Exception as e:
        logger.debug(f"Groww multi LTP error: {e}")
        return {}


def get_ohlcv(
    symbol:    str,
    interval:  str = "1d",
    days_back: int = 120,
    exchange:  str = "NSE",
) -> List[Dict]:
    """
    Get OHLCV candles via Groww.
    Returns list of {timestamp, open, high, low, close, volume}.
    """
    if not _check_groww():
        return []
    try:
        import groww_service as gs
        return gs.get_candles(symbol, interval=interval, days_back=days_back, exchange=exchange)
    except Exception as e:
        logger.debug(f"Groww OHLCV error ({symbol}): {e}")
        return []


def candles_to_df(candles: List[Dict]) -> pd.DataFrame:
    """Convert Groww candle list → OHLCV DataFrame with datetime index."""
    if not candles:
        return pd.DataFrame()
    try:
        df = pd.DataFrame(candles)
        df["datetime"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("datetime").sort_index()
        df = df.rename(columns={
            "open": "Open", "high": "High",
            "low": "Low", "close": "Close", "volume": "Volume",
        })
        return df[["Open", "High", "Low", "Close", "Volume"]]
    except Exception as e:
        logger.debug(f"candles_to_df error: {e}")
        return pd.DataFrame()


def is_available() -> bool:
    return _check_groww()
