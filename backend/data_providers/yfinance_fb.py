"""
YFinance Fallback Provider
Always-available last-resort provider for historical OHLCV and basic quotes.
"""
import logging
from typing import List, Optional, Dict

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


def download_multi(
    tickers: List[str],
    period: str = "1y",
    interval: str = "1d",
    **kwargs,
) -> pd.DataFrame:
    """
    yf.download wrapper — returns MultiIndex DataFrame identical to yf.download output.
    Handles both single-ticker and multi-ticker cases uniformly.
    """
    try:
        raw = yf.download(
            tickers if isinstance(tickers, list) else [tickers],
            period=period,
            interval=interval,
            progress=False,
            threads=True,
            **kwargs,
        )
        return raw
    except Exception as e:
        logger.warning(f"yfinance download_multi error ({tickers[:2]}...): {e}")
        return pd.DataFrame()


def get_history_single(
    ticker: str,
    period: str = "5d",
    interval: str = "1h",
) -> pd.DataFrame:
    """Single ticker history with OHLCV columns, timezone-aware index."""
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period=period, interval=interval)
        return hist
    except Exception as e:
        logger.debug(f"yfinance single history error ({ticker}): {e}")
        return pd.DataFrame()


def get_quote_single(ticker: str) -> Optional[Dict]:
    """Current price info for one ticker."""
    try:
        t = yf.Ticker(ticker)
        info = t.fast_info
        return {
            "ltp":    float(info.last_price or 0),
            "open":   float(info.open or 0),
            "high":   float(info.day_high or 0),
            "low":    float(info.day_low or 0),
            "volume": int(info.three_month_average_volume or 0),
            "source": "yfinance",
        }
    except Exception as e:
        logger.debug(f"yfinance quote error ({ticker}): {e}")
        return None
