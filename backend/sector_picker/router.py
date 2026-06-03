from fastapi import APIRouter
import pandas as pd
import numpy as np
import asyncio
from concurrent.futures import ThreadPoolExecutor
import time
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.data_manager import dm

router = APIRouter(prefix="/api/sector-picker", tags=["sector-picker"])

# Local cache removed — DataManager handles TTL caching internally

BENCHMARK = "^NSEI"

SECTOR_INDICES = {
    "Banking":  "^NSEBANK",
    "IT":       "^CNXIT",
    "Auto":     "^CNXAUTO",
    "FMCG":     "^CNXFMCG",
    "Pharma":   "^CNXPHARMA",
    "Metal":    "^CNXMETAL",
    "Realty":   "^CNXREALTY",
    "Energy":   "^CNXENERGY",
    "Infra":    "^CNXINFRA",
    "Media":    "^CNXMEDIA",
    "PSU Bank": "^CNXPSUBANK",
}

SECTOR_COLORS = {
    "Banking":  "#4A90D9",
    "IT":       "#00C9A7",
    "Auto":     "#FFD93D",
    "FMCG":     "#6C5CE7",
    "Pharma":   "#FF6B6B",
    "Metal":    "#B0BEC5",
    "Realty":   "#FF8A65",
    "Energy":   "#F39C12",
    "Infra":    "#29B6F6",
    "Media":    "#E91E63",
    "PSU Bank": "#AB47BC",
}

SECTOR_STOCKS = {
    "Banking": [
        "HDFCBANK.NS","ICICIBANK.NS","KOTAKBANK.NS","SBIN.NS","AXISBANK.NS",
        "INDUSINDBK.NS","BANDHANBNK.NS","FEDERALBNK.NS","IDFCFIRSTB.NS","AUBANK.NS",
    ],
    "IT": [
        "TCS.NS","INFY.NS","WIPRO.NS","HCLTECH.NS","TECHM.NS",
        "LTIM.NS","PERSISTENT.NS","MPHASIS.NS","COFORGE.NS","OFSS.NS",
    ],
    "Auto": [
        "MARUTI.NS","TATAMOTORS.NS","M&M.NS","BAJAJAUTO.NS","EICHERMOT.NS",
        "HEROMOTOCO.NS","ASHOKLEY.NS","TVSMOTOR.NS","BALKRISIND.NS","MRF.NS",
    ],
    "FMCG": [
        "HINDUNILVR.NS","ITC.NS","NESTLEIND.NS","BRITANNIA.NS","DABUR.NS",
        "MARICO.NS","GODREJCP.NS","COLPAL.NS","TATACONSUM.NS","EMAMILTD.NS",
    ],
    "Pharma": [
        "SUNPHARMA.NS","DRREDDY.NS","CIPLA.NS","DIVISLAB.NS","APOLLOHOSP.NS",
        "ALKEM.NS","BIOCON.NS","AUROPHARMA.NS","GLENMARK.NS","LUPIN.NS",
    ],
    "Metal": [
        "TATASTEEL.NS","JSWSTEEL.NS","HINDALCO.NS","VEDL.NS","COALINDIA.NS",
        "SAIL.NS","NMDC.NS","NATIONALUM.NS","HINDCOPPER.NS","APLAPOLLO.NS",
    ],
    "Realty": [
        "DLF.NS","GODREJPROP.NS","OBEROIRLTY.NS","PRESTIGE.NS","LODHA.NS",
        "BRIGADE.NS","SOBHA.NS","MAHLIFE.NS","SUNTECK.NS","KOLTEPATIL.NS",
    ],
    "Energy": [
        "NTPC.NS","POWERGRID.NS","ADANIGREEN.NS","TATAPOWER.NS","NHPC.NS",
        "CESC.NS","ADANIPOWER.NS","TORNTPOWER.NS","JSWENERGY.NS","ADANIENT.NS",
    ],
    "Infra": [
        "LT.NS","ADANIPORTS.NS","ABB.NS","SIEMENS.NS","POLYCAB.NS",
        "KEI.NS","CUMMINSIND.NS","BHEL.NS","THERMAX.NS","KNRCON.NS",
    ],
    "Media": [
        "SUNTV.NS","ZEEL.NS","PVRINOX.NS","TVTODAY.NS","NAZARA.NS",
        "NETWORK18.NS","TV18BRDCST.NS","SAREGAMA.NS",
    ],
    "PSU Bank": [
        "SBIN.NS","PNB.NS","BANKBARODA.NS","CANBK.NS","UNIONBANK.NS",
        "INDIANB.NS","MAHABANK.NS","CENTRALBK.NS","UCOBANK.NS","BANKINDIA.NS",
    ],
}

QUADRANT_PRIORITY = {"Leading": 0, "Improving": 1, "Weakening": 2, "Lagging": 3}


def _safe_float(val) -> float:
    try:
        v = float(val)
        return round(v, 2) if not (np.isnan(v) or np.isinf(v)) else 100.0
    except Exception:
        return 100.0


def _compute_rrg() -> list:
    all_tickers = [BENCHMARK] + list(SECTOR_INDICES.values())
    # Use DataManager — cached 30 min, yfinance-compatible MultiIndex DataFrame
    raw = dm.download_multi_sync(all_tickers, period="1y", interval="1wk")

    if raw.empty:
        return []

    # Handle both multi-ticker (DataFrame) and single-ticker (Series) cases
    closes = raw["Close"] if isinstance(raw["Close"], pd.DataFrame) else raw["Close"].to_frame()
    closes = closes.dropna(how="all")

    if BENCHMARK not in closes.columns:
        return []

    bench = closes[BENCHMARK].dropna()
    result = []

    for sector_name, idx_ticker in SECTOR_INDICES.items():
        if idx_ticker not in closes.columns:
            continue

        sector = closes[idx_ticker].dropna()
        combined = pd.concat([sector, bench], axis=1, join="inner").dropna()
        combined.columns = ["sector", "bench"]

        if len(combined) < 15:
            continue

        s = combined["sector"]
        b = combined["bench"]

        rs = s / b

        ema14 = rs.ewm(span=14, adjust=False).mean()
        ema26 = rs.ewm(span=26, adjust=False).mean()
        rs_ratio = (ema14 / ema26) * 100

        rsm_ema14 = rs_ratio.ewm(span=14, adjust=False).mean()
        rsm_ema26 = rs_ratio.ewm(span=26, adjust=False).mean()
        rs_mom = (rsm_ema14 / rsm_ema26) * 100

        cur_rs = _safe_float(rs_ratio.iloc[-1])
        cur_rsm = _safe_float(rs_mom.iloc[-1])

        tail_len = min(10, len(rs_ratio))
        trail = [
            {"rs": _safe_float(rs_ratio.iloc[-tail_len + i]), "rsm": _safe_float(rs_mom.iloc[-tail_len + i])}
            for i in range(tail_len)
        ]

        if cur_rs >= 100 and cur_rsm >= 100:
            quadrant = "Leading"
        elif cur_rs >= 100 and cur_rsm < 100:
            quadrant = "Weakening"
        elif cur_rs < 100 and cur_rsm >= 100:
            quadrant = "Improving"
        else:
            quadrant = "Lagging"

        result.append({
            "sector": sector_name,
            "rs_ratio": cur_rs,
            "rs_momentum": cur_rsm,
            "quadrant": quadrant,
            "color": SECTOR_COLORS.get(sector_name, "#888"),
            "trail": trail,
        })

    result.sort(key=lambda x: QUADRANT_PRIORITY.get(x["quadrant"], 4))
    return result


def _fetch_sector_stocks(sector: str) -> list:
    tickers = SECTOR_STOCKS.get(sector, [])
    if not tickers:
        return []

    batch = tickers
    raw = dm.download_multi_sync(batch, period="5d", interval="1d")

    if raw.empty:
        return []

    closes = raw["Close"] if isinstance(raw["Close"], pd.DataFrame) else raw["Close"].to_frame()
    volumes = raw["Volume"] if isinstance(raw["Volume"], pd.DataFrame) else raw["Volume"].to_frame()

    stocks = []
    for ticker in tickers:
        col = ticker if ticker in closes.columns else None
        if col is None:
            continue

        price_series = closes[col].dropna()
        if len(price_series) < 2:
            continue

        price = _safe_float(price_series.iloc[-1])
        prev = _safe_float(price_series.iloc[-2])
        change_pct = round((price - prev) / prev * 100, 2) if prev else 0.0

        vol_series = volumes[col].dropna() if col in volumes.columns else pd.Series(dtype=float)
        volume = int(float(vol_series.iloc[-1])) if len(vol_series) > 0 else 0

        # Simple strength note
        avg = float(price_series.mean())
        high52 = float(price_series.max())
        if price >= high52 * 0.97:
            note = "Near 10-day high — breakout zone"
        elif price > avg * 1.02:
            note = "Above avg price — bullish momentum"
        elif price < avg * 0.98:
            note = "Below avg — watch for reversal"
        else:
            note = "Consolidating — monitor for move"

        if abs(change_pct) > 2:
            note += f" | {'+' if change_pct > 0 else ''}{change_pct}% today"

        symbol = ticker.replace(".NS", "")
        stocks.append({
            "symbol": symbol,
            "ticker": ticker,
            "price": price,
            "change_pct": change_pct,
            "volume": volume,
            "note": note,
        })

    stocks.sort(key=lambda x: x["change_pct"], reverse=True)
    return stocks


@router.get("/rrg")
async def get_rrg():
    now = time.time()
    # DataManager caches internally (30-min TTL for weekly data)
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        data = await loop.run_in_executor(pool, _compute_rrg)
    return {"data": data, "cached": False, "fetched_at": int(now)}


@router.get("/stocks/{sector}")
async def get_sector_stocks(sector: str):
    now = time.time()
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        data = await loop.run_in_executor(pool, _fetch_sector_stocks, sector)
    return {"sector": sector, "stocks": data, "cached": False}


@router.delete("/cache")
async def clear_cache():
    dm.invalidate("ohlcv_multi:")
    return {"message": "Cache cleared — fresh data on next request"}
