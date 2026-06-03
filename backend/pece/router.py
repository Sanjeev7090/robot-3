"""
PE-CE OI Difference Tracker
Uses DataManager (NSEDirect > NSEPython > demo) for option chain data.
MongoDB for snapshot history.
"""

import asyncio
import logging
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

try:
    from curl_cffi import requests as _cffi_requests
    _CFFI_OK = True
except ImportError:
    _CFFI_OK = False

# DataManager — primary data source
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.data_manager import dm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pece", tags=["pece-oi"])

# ─── MongoDB ────────────────────────────────────────────────────────
_mongo_url = os.environ.get("MONGO_URL", "")
_db_name   = os.environ.get("DB_NAME", "trading_db")
_mongo_client: Optional[AsyncIOMotorClient] = None


def _get_db():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(_mongo_url)
    return _mongo_client[_db_name]


COLL = "pece_oi_snapshots"

# ─── NSE Session (fallback direct session when DataManager fails) ────
_nse_session = None
_nse_session_ts = 0.0
_NSE_SESSION_TTL = 1800


def _get_nse_session():
    global _nse_session, _nse_session_ts
    now = time.time()
    if _nse_session is not None and (now - _nse_session_ts) < _NSE_SESSION_TTL:
        return _nse_session
    if not _CFFI_OK:
        return None
    s = _cffi_requests.Session(impersonate="chrome120")
    try:
        s.get("https://www.nseindia.com/", timeout=8)
        s.get("https://www.nseindia.com/option-chain", timeout=8)
    except Exception as e:
        logger.warning(f"PECE NSE warmup: {e}")
    _nse_session = s
    _nse_session_ts = now
    return s


# ─── NSE Option Chain Fetch ──────────────────────────────────────────
def _fetch_oc_sync(symbol: str = "NIFTY") -> Optional[dict]:
    """
    Fetch NSE option chain and compute OI aggregates.
    Priority: DataManager (NSEDirect) > Direct curl_cffi fallback.
    Returns None on failure.
    """
    # 1. Try DataManager (NSEDirect > NSEPython)
    try:
        chain = dm.get_option_chain_sync(symbol)
        if chain and chain.get("data"):
            rows = chain["data"]
            underlying = float(chain.get("underlying", 0))
            total_put_oi   = sum(x.get("PE", {}).get("openInterest", 0)         for x in rows if "PE" in x)
            total_call_oi  = sum(x.get("CE", {}).get("openInterest", 0)         for x in rows if "CE" in x)
            total_put_chg  = sum(x.get("PE", {}).get("changeinOpenInterest", 0) for x in rows if "PE" in x)
            total_call_chg = sum(x.get("CE", {}).get("changeinOpenInterest", 0) for x in rows if "CE" in x)
            pcr       = round(total_put_oi / total_call_oi, 2) if total_call_oi else 0.0
            pece_diff = total_put_oi - total_call_oi
            pece_chg  = total_put_chg - total_call_chg
            expiry    = chain.get("expiry_dates", [""])[0] if chain.get("expiry_dates") else ""
            return {
                "symbol":     symbol,
                "expiry":     expiry,
                "put_oi":     total_put_oi,
                "put_oi_chg": total_put_chg,
                "call_oi":    total_call_oi,
                "call_oi_chg":total_call_chg,
                "pece_diff":  pece_diff,
                "pece_chg":   pece_chg,
                "pcr":        pcr,
                "underlying": underlying,
                "source":     chain.get("source", "nse_direct"),
            }
    except Exception as e:
        logger.debug(f"PECE DataManager chain error: {e}")

    # 2. Direct curl_cffi fallback (keeps existing robust logic)
    s = _get_nse_session()
    if s is None:
        return None

    from datetime import datetime as _dt, timedelta as _td
    candidates = [
        (_dt.now() + _td(days=d)).strftime("%d-%b-%Y") for d in range(0, 21)
    ]
    for exp in candidates:
        url = (
            f"https://www.nseindia.com/api/option-chain-v3"
            f"?type=Indices&symbol={symbol}&expiry={exp.replace(' ', '%20')}"
        )
        try:
            r = s.get(url, timeout=10)
            if r.status_code != 200 or len(r.content) < 1000:
                continue
            data = r.json()
            rows = data.get("records", {}).get("data") or []
            if not rows:
                continue

            total_put_oi      = sum(x.get("PE", {}).get("openInterest", 0)          for x in rows if "PE" in x)
            total_call_oi     = sum(x.get("CE", {}).get("openInterest", 0)          for x in rows if "CE" in x)
            total_put_chg     = sum(x.get("PE", {}).get("changeinOpenInterest", 0)  for x in rows if "PE" in x)
            total_call_chg    = sum(x.get("CE", {}).get("changeinOpenInterest", 0)  for x in rows if "CE" in x)
            underlying        = float(data.get("records", {}).get("underlyingValue", 0) or 0)
            pcr               = round(total_put_oi / total_call_oi, 2) if total_call_oi else 0.0
            pece_diff         = total_put_oi - total_call_oi
            pece_chg          = total_put_chg - total_call_chg

            return {
                "symbol":       symbol,
                "expiry":       exp,
                "put_oi":       total_put_oi,
                "put_oi_chg":   total_put_chg,
                "call_oi":      total_call_oi,
                "call_oi_chg":  total_call_chg,
                "pece_diff":    pece_diff,
                "pece_chg":     pece_chg,
                "pcr":          pcr,
                "underlying":   underlying,
                "source":       "nse_live",
            }
        except Exception as e:
            logger.debug(f"PECE OC attempt {exp}: {e}")
            continue

    return None


# ─── Demo Data Generator ─────────────────────────────────────────────
def _generate_demo_data(symbol: str = "NIFTY") -> List[dict]:
    """
    Generate realistic demo snapshots for today's session.
    Uses current NIFTY price as anchor; OI values modeled on typical intraday patterns.
    Clearly marked source='demo'.
    """
    try:
        # Use DataManager for NIFTY spot price (cached, fast)
        indices = dm.get_indices_sync()
        if indices and "NIFTY" in indices:
            spot = float(indices["NIFTY"]["ltp"])
        else:
            # Fallback: yfinance for ^NSEI
            import yfinance as _yf
            hist = _yf.Ticker("^NSEI").history(period="1d", interval="1m")
            spot = float(hist["Close"].iloc[-1]) if not hist.empty else 23500.0
    except Exception:
        spot = 23500.0

    now = datetime.now()
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    if now < market_open:
        market_open = market_open - timedelta(days=1)

    # Build minute-by-minute series from market open to now
    minutes_elapsed = max(1, int((now - market_open).total_seconds() / 60))
    minutes_elapsed = min(minutes_elapsed, 375)  # max 6h15m session

    base_put_oi  = int(spot * 80 + random.randint(-50_000, 50_000))
    base_call_oi = int(spot * 100 + random.randint(-40_000, 40_000))

    snapshots = []
    cum_put_chg = 0
    cum_call_chg = 0

    for i in range(minutes_elapsed):
        t = market_open + timedelta(minutes=i)
        # Only update OI on approx every 3rd minute (like NSE real data)
        update = (i % 3 == 0)
        if update:
            dput  = random.randint(-30_000, 80_000)
            dcall = random.randint(-30_000, 80_000)
            cum_put_chg  += dput
            cum_call_chg += dcall
            put_oi  = max(1000, base_put_oi  + cum_put_chg)
            call_oi = max(1000, base_call_oi + cum_call_chg)
        else:
            dput = dcall = 0
            put_oi  = snapshots[-1]["put_oi"]  if snapshots else base_put_oi
            call_oi = snapshots[-1]["call_oi"] if snapshots else base_call_oi
            dput = dput if dput else 0
            dcall = dcall if dcall else 0

        pece_diff = put_oi - call_oi
        pcr = round(put_oi / call_oi, 2) if call_oi else 1.0
        pece_chg  = dput - dcall

        snapshots.append({
            "symbol":     symbol,
            "ts":         t.isoformat(),
            "time_str":   t.strftime("%H:%M"),
            "put_oi":     put_oi,
            "put_oi_chg": cum_put_chg,
            "call_oi":    call_oi,
            "call_oi_chg": cum_call_chg,
            "pece_diff":  pece_diff,
            "pece_chg":   pece_chg,
            "pcr":        pcr,
            "source":     "demo",
        })

    return list(reversed(snapshots))  # latest first


# ─── Helpers ─────────────────────────────────────────────────────────
def _fmt_oi(val: int) -> str:
    """Format OI in Cr / L / K."""
    if abs(val) >= 10_000_000:
        return f"{val / 10_000_000:.1f} Cr"
    if abs(val) >= 100_000:
        return f"{val / 100_000:.1f} L"
    if abs(val) >= 1_000:
        return f"{val / 1_000:.1f} K"
    return str(val)


def _snapshot_doc(raw: dict) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "symbol":      raw.get("symbol", "NIFTY"),
        "ts":          now.isoformat(),
        "time_str":    now.strftime("%H:%M"),
        "put_oi":      raw.get("put_oi", 0),
        "put_oi_chg":  raw.get("put_oi_chg", 0),
        "call_oi":     raw.get("call_oi", 0),
        "call_oi_chg": raw.get("call_oi_chg", 0),
        "pece_diff":   raw.get("pece_diff", 0),
        "pece_chg":    raw.get("pece_chg", 0),
        "pcr":         raw.get("pcr", 0.0),
        "source":      raw.get("source", "nse_live"),
        "expiry":      raw.get("expiry", ""),
        "underlying":  raw.get("underlying", 0.0),
    }


# ─── Pydantic Response ────────────────────────────────────────────────
class PECESnapshot(BaseModel):
    symbol:       str
    ts:           str
    time_str:     str
    put_oi:       int
    put_oi_chg:   int
    call_oi:      int
    call_oi_chg:  int
    pece_diff:    int
    pece_chg:     int
    pcr:          float
    source:       str
    expiry:       Optional[str] = ""
    underlying:   Optional[float] = 0.0

    # Formatted display strings
    put_oi_fmt:       str = ""
    put_oi_chg_fmt:   str = ""
    call_oi_fmt:      str = ""
    call_oi_chg_fmt:  str = ""
    pece_diff_fmt:    str = ""
    pece_chg_fmt:     str = ""

    def model_post_init(self, _):
        def sign(v):
            return f"+{_fmt_oi(v)}" if v > 0 else (_fmt_oi(v) if v < 0 else "0")
        object.__setattr__(self, "put_oi_fmt",      _fmt_oi(self.put_oi))
        object.__setattr__(self, "put_oi_chg_fmt",  sign(self.put_oi_chg))
        object.__setattr__(self, "call_oi_fmt",     _fmt_oi(self.call_oi))
        object.__setattr__(self, "call_oi_chg_fmt", sign(self.call_oi_chg))
        object.__setattr__(self, "pece_diff_fmt",   sign(self.pece_diff))
        object.__setattr__(self, "pece_chg_fmt",    sign(self.pece_chg))


# ─── API Endpoints ────────────────────────────────────────────────────
@router.post("/snapshot/{symbol}")
async def take_snapshot(symbol: str = "NIFTY"):
    """Fetch latest NSE OI snapshot and store in MongoDB. Falls back to demo data."""
    sym = symbol.upper()
    loop = asyncio.get_event_loop()

    with ThreadPoolExecutor(max_workers=1) as pool:
        raw = await loop.run_in_executor(pool, _fetch_oc_sync, sym)

    db = _get_db()

    if raw:
        doc = _snapshot_doc(raw)
        # Deduplicate: skip if same minute already exists
        same_min = await db[COLL].find_one(
            {"symbol": sym, "time_str": doc["time_str"]},
            projection={"_id": 0, "ts": 1}
        )
        if not same_min:
            await db[COLL].insert_one({k: v for k, v in doc.items() if k != "_id"})
        snap = PECESnapshot(**doc)
        return {"status": "live", "snapshot": snap.model_dump(), "message": f"NSE live data fetched for {sym}"}
    else:
        # NSE unavailable — return latest from DB or fallback message
        latest = await db[COLL].find_one({"symbol": sym}, sort=[("ts", -1)], projection={"_id": 0})
        if latest:
            snap = PECESnapshot(**latest)
            return {"status": "cached", "snapshot": snap.model_dump(), "message": "NSE unavailable — showing last cached snapshot"}
        return {"status": "unavailable", "snapshot": None, "message": "NSE data unavailable and no cached data found"}


@router.get("/history/{symbol}")
async def get_history(symbol: str = "NIFTY", limit: int = 60, demo: bool = False):
    """Return last `limit` PE-CE OI snapshots. If demo=true or DB empty, returns demo data."""
    sym = symbol.upper()
    db = _get_db()

    cursor = db[COLL].find({"symbol": sym}, sort=[("ts", -1)], limit=limit, projection={"_id": 0})
    docs = await cursor.to_list(length=limit)

    if docs and len(docs) >= 5:
        snaps = [PECESnapshot(**d).model_dump() for d in docs]
        return {"symbol": sym, "count": len(snaps), "data": snaps, "source": "mongodb"}

    # Fewer than 5 real records — pad with demo data
    if demo or (docs and len(docs) < 5):
        demo_snaps = _generate_demo_data(sym)[:limit]
        # Merge: real records overwrite demo at matching times
        real_map = {d["time_str"]: d for d in docs}
        merged = []
        for ds in demo_snaps:
            if ds["time_str"] in real_map:
                merged.append(real_map[ds["time_str"]])
            else:
                merged.append(ds)
        snaps = [PECESnapshot(**d).model_dump() for d in merged[:limit]]
        return {"symbol": sym, "count": len(snaps), "data": snaps, "source": "demo"}

    return {"symbol": sym, "count": 0, "data": [], "source": "empty"}


@router.get("/latest/{symbol}")
async def get_latest(symbol: str = "NIFTY", demo: bool = True):
    """Get single latest snapshot + bias summary."""
    sym = symbol.upper()
    db = _get_db()

    doc = await db[COLL].find_one({"symbol": sym}, sort=[("ts", -1)], projection={"_id": 0})

    if not doc and demo:
        demo_list = _generate_demo_data(sym)
        doc = demo_list[0] if demo_list else None

    if not doc:
        return {"symbol": sym, "snapshot": None, "bias": "NEUTRAL"}

    snap = PECESnapshot(**doc)
    pece = snap.pece_diff

    if pece > 50_000:
        bias = "STRONG BULLISH"
        bias_color = "#00E676"
    elif pece > 10_000:
        bias = "BULLISH"
        bias_color = "#69F0AE"
    elif pece < -50_000:
        bias = "STRONG BEARISH"
        bias_color = "#FF1744"
    elif pece < -10_000:
        bias = "BEARISH"
        bias_color = "#FF6B6B"
    else:
        bias = "NEUTRAL"
        bias_color = "#FFD93D"

    return {
        "symbol": sym,
        "snapshot": snap.model_dump(),
        "bias": bias,
        "bias_color": bias_color,
        "pcr_trend": "Rising" if snap.pcr > 1.2 else ("Falling" if snap.pcr < 0.8 else "Neutral"),
    }


@router.delete("/history/{symbol}")
async def clear_history(symbol: str = "NIFTY"):
    sym = symbol.upper()
    db = _get_db()
    result = await db[COLL].delete_many({"symbol": sym})
    return {"deleted": result.deleted_count}
