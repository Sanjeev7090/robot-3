"""
Moneycontrol Market Movers — Daily 3:00 PM Auto-Run (IST)
Scrapes F&O Weekly Top Gainers → ATM Call Signal Generator → MongoDB
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

import pandas as pd
from fastapi import APIRouter
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

# DataManager — unified data layer
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.data_manager import dm

try:
    from curl_cffi import requests as _cffi_requests
    _CFFI_OK = True
except ImportError:
    _CFFI_OK = False

try:
    from bs4 import BeautifulSoup
    _BS4_OK = True
except ImportError:
    _BS4_OK = False

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/moneycontrol", tags=["moneycontrol"])

# ─── MongoDB ────────────────────────────────────────────────────────
_mongo_url = os.environ.get("MONGO_URL", "")
_db_name   = os.environ.get("DB_NAME", "trading_db")
_mongo_client: Optional[AsyncIOMotorClient] = None
COLL = "moneycontrol_movers"


def _get_db():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(_mongo_url)
    return _mongo_client[_db_name]


# ─── Curated F&O Liquid Stock List ──────────────────────────────────
FNO_STOCKS = [
    {"symbol": "RELIANCE",   "name": "Reliance Industries"},
    {"symbol": "TCS",        "name": "Tata Consultancy Services"},
    {"symbol": "HDFCBANK",   "name": "HDFC Bank"},
    {"symbol": "INFY",       "name": "Infosys"},
    {"symbol": "ICICIBANK",  "name": "ICICI Bank"},
    {"symbol": "SBIN",       "name": "State Bank of India"},
    {"symbol": "BAJFINANCE", "name": "Bajaj Finance"},
    {"symbol": "LT",         "name": "Larsen & Toubro"},
    {"symbol": "AXISBANK",   "name": "Axis Bank"},
    {"symbol": "KOTAKBANK",  "name": "Kotak Mahindra Bank"},
    {"symbol": "MARUTI",     "name": "Maruti Suzuki"},
    {"symbol": "TITAN",      "name": "Titan Company"},
    {"symbol": "WIPRO",      "name": "Wipro"},
    {"symbol": "SUNPHARMA",  "name": "Sun Pharma"},
    {"symbol": "DRREDDY",    "name": "Dr. Reddy's"},
    {"symbol": "TATAMOTORS", "name": "Tata Motors"},
    {"symbol": "TATASTEEL",  "name": "Tata Steel"},
    {"symbol": "BHARTIARTL", "name": "Bharti Airtel"},
    {"symbol": "ITC",        "name": "ITC"},
    {"symbol": "HCLTECH",    "name": "HCL Technologies"},
    {"symbol": "TECHM",      "name": "Tech Mahindra"},
    {"symbol": "ONGC",       "name": "ONGC"},
    {"symbol": "POWERGRID",  "name": "Power Grid"},
    {"symbol": "NTPC",       "name": "NTPC"},
    {"symbol": "BAJAJ-AUTO", "name": "Bajaj Auto"},
    {"symbol": "EICHERMOT",  "name": "Eicher Motors"},
    {"symbol": "JSWSTEEL",   "name": "JSW Steel"},
    {"symbol": "HINDALCO",   "name": "Hindalco"},
    {"symbol": "ASIANPAINT", "name": "Asian Paints"},
    {"symbol": "INDUSINDBK", "name": "IndusInd Bank"},
]

# MC company-name keywords → NSE symbol mapping
_MC_NAME_MAP = {
    "reliance": "RELIANCE",
    "tcs": "TCS",
    "tata consultancy": "TCS",
    "hdfc bank": "HDFCBANK",
    "infosys": "INFY",
    "icici bank": "ICICIBANK",
    "state bank": "SBIN",
    "sbin": "SBIN",
    "bajaj finance": "BAJFINANCE",
    "larsen": "LT",
    "axis bank": "AXISBANK",
    "kotak": "KOTAKBANK",
    "maruti": "MARUTI",
    "titan": "TITAN",
    "wipro": "WIPRO",
    "sun pharma": "SUNPHARMA",
    "dr. reddy": "DRREDDY",
    "dr reddy": "DRREDDY",
    "tata motors": "TATAMOTORS",
    "tata steel": "TATASTEEL",
    "bharti airtel": "BHARTIARTL",
    "airtel": "BHARTIARTL",
    "itc": "ITC",
    "hcl": "HCLTECH",
    "tech mahindra": "TECHM",
    "ongc": "ONGC",
    "power grid": "POWERGRID",
    "ntpc": "NTPC",
    "bajaj auto": "BAJAJ-AUTO",
    "eicher": "EICHERMOT",
    "jsw steel": "JSWSTEEL",
    "hindalco": "HINDALCO",
    "asian paint": "ASIANPAINT",
    "indusind": "INDUSINDBK",
}


def _resolve_mc_symbol(company_name: str, href: str = "") -> str:
    """Resolve Moneycontrol company name → NSE ticker symbol."""
    name_lower = company_name.lower()
    for key, sym in _MC_NAME_MAP.items():
        if key in name_lower:
            return sym
    # Try last segment of URL
    if href:
        slug = href.strip("/").split("/")[-1].upper()
        if 1 < len(slug) < 15:
            return slug
    return company_name.split()[0].upper()


# ─── Moneycontrol Scraping ───────────────────────────────────────────
def _scrape_moneycontrol_weekly() -> List[dict]:
    """Scrape Moneycontrol F&O weekly top gainers via curl_cffi."""
    if not _CFFI_OK or not _BS4_OK:
        return []
    try:
        s = _cffi_requests.Session(impersonate="chrome120")
        try:
            s.get("https://www.moneycontrol.com/", timeout=8)
        except Exception:
            pass

        url = (
            "https://www.moneycontrol.com/stocks/marketstats/gainerloser.php"
            "?optex=NSE&opttopic=topgainers&sort=sc_comp&order=&index=FNO&freq=week"
        )
        r = s.get(url, timeout=15)
        if r.status_code != 200 or len(r.content) < 3000:
            return []

        soup = BeautifulSoup(r.text, "html.parser")

        # Try multiple selectors Moneycontrol uses
        table = (
            soup.find("table", {"id": "gainlosstable"}) or
            soup.find("table", {"class": "tbldata14"}) or
            soup.find("table", {"class": "bsedata"})
        )
        if not table:
            tables = soup.find_all("table")
            for t in tables:
                trs = t.find_all("tr")
                if len(trs) >= 5:
                    table = t
                    break

        if not table:
            return []

        rows = table.find_all("tr")[1:15]
        stocks = []
        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 3:
                continue
            try:
                anchor = cols[0].find("a")
                company = anchor.get_text(strip=True) if anchor else cols[0].get_text(strip=True)
                href    = anchor.get("href", "") if anchor else ""
                symbol  = _resolve_mc_symbol(company, href)

                # Price is usually 2nd col, pct-change is 3rd or last
                price_txt = cols[1].get_text(strip=True).replace(",", "").replace("₹", "").strip()
                # Find percentage column (contains %)
                chg_pct = None
                for c in cols[2:]:
                    txt = c.get_text(strip=True).replace("%", "").replace("+", "").strip()
                    try:
                        val = float(txt)
                        if -50 < val < 200:
                            chg_pct = val
                            break
                    except ValueError:
                        continue

                price = float(price_txt)
                if price <= 0 or chg_pct is None:
                    continue

                # Volume if available
                vol = 0
                try:
                    vol_txt = cols[-1].get_text(strip=True).replace(",", "")
                    vol = int(float(vol_txt))
                except Exception:
                    pass

                stocks.append({
                    "symbol":           symbol,
                    "company_name":     company[:50],
                    "current_price":    round(price, 2),
                    "weekly_change_pct": round(chg_pct, 2),
                    "volume":           vol,
                    "source":           "moneycontrol",
                })
            except (ValueError, IndexError, AttributeError):
                continue

        # Only keep FnO stocks (symbol must be in our list or recognized)
        fno_syms = {s["symbol"] for s in FNO_STOCKS}
        stocks = [s for s in stocks if s["symbol"] in fno_syms]
        stocks.sort(key=lambda x: x["weekly_change_pct"], reverse=True)
        return stocks[:10]
    except Exception as e:
        logger.warning(f"Moneycontrol scrape error: {e}")
        return []


# ─── yfinance Weekly Gainers Fallback ───────────────────────────────
def _compute_weekly_gainers_yf() -> List[dict]:
    """
    Compute weekly gainers from curated F&O list.
    Uses DataManager (cached, with yfinance backend).
    Also tries NSEDirect top gainers first if available.
    """
    sym_map = {s["symbol"]: s["name"] for s in FNO_STOCKS}

    # 1. Try NSEDirect FnO top gainers (real-time, production-ready)
    live_gainers = dm.get_top_gainers_fno_sync(20)
    if len(live_gainers) >= 3:
        # Filter to our known FnO list
        fno_syms = {s["symbol"] for s in FNO_STOCKS}
        filtered = [g for g in live_gainers if g.get("symbol") in fno_syms]
        if len(filtered) >= 3:
            return [{
                "symbol":           g["symbol"],
                "company_name":     g.get("company_name", sym_map.get(g["symbol"], g["symbol"])),
                "current_price":    round(g.get("ltp", 0), 2),
                "weekly_change_pct":round(g.get("change_pct", 0), 2),
                "volume":           g.get("volume", 0),
                "source":           g.get("source", "nse_direct"),
            } for g in filtered[:10]]

    # 2. yfinance weekly computation (cached in DataManager)
    tickers = [f"{s['symbol']}.NS" for s in FNO_STOCKS]
    wk_chg  = dm.get_weekly_change_sync(tickers)

    gainers = []
    for s in FNO_STOCKS:
        yf_sym = f"{s['symbol']}.NS"
        pct = wk_chg.get(yf_sym)
        if pct is None:
            continue
        # Get current price from DataManager
        quote = dm.get_quote_sync(s["symbol"])
        price = quote.get("ltp", 0) if quote else 0
        gainers.append({
            "symbol":           s["symbol"],
            "company_name":     sym_map[s["symbol"]],
            "current_price":    round(price, 2),
            "weekly_change_pct":pct,
            "volume":           quote.get("volume", 0) if quote else 0,
            "source":           "yfinance_fallback",
        })

    gainers.sort(key=lambda x: x["weekly_change_pct"], reverse=True)
    return gainers[:10]


# ─── ATM Strike + Option Info ────────────────────────────────────────
def _estimate_lot(price: float) -> int:
    if price > 5000: return 25
    if price > 2000: return 50
    if price > 1000: return 75
    if price > 500:  return 100
    return 200


def _atm_strike_round(price: float) -> float:
    if price > 5000: step = 100
    elif price > 2000: step = 50
    elif price > 1000: step = 25
    elif price > 500:  step = 10
    else: step = 5
    return float(round(price / step) * step)


def _estimate_atm(symbol: str, price: float) -> dict:
    """Estimate ATM info without live options data (formula-based)."""
    strike = _atm_strike_round(price)
    ltp    = round(price * 0.018, 2)   # ~1.8% of spot = typical ATM premium
    lot    = _estimate_lot(price)
    expiry = (datetime.now() + timedelta(days=(3 - datetime.now().weekday()) % 7 + 1)).strftime("%Y-%m-%d")
    return {
        "expiry":         expiry,
        "atm_strike":     strike,
        "option_ltp":     ltp,
        "option_oi":      0,
        "iv":             20.0,
        "signal":         "BUY ATM CALL",
        "entry_time":     "3:15 PM IST",
        "exit_time":      "9:15 AM IST (next day)",
        "sl_price":       round(ltp * 0.90, 2),
        "sl_pct":         10,
        "target_price":   round(ltp * 1.20, 2),
        "target_pct":     20,
        "lot_size":       lot,
        "margin_approx":  round(ltp * lot, 0),
        "estimated":      True,
    }


def _get_atm_info(symbol: str, price: float) -> dict:
    """
    Fetch ATM call option info.
    1. Try NSE option chain via DataManager (NSEDirect > NSEPython)
    2. Fall back to yfinance options chain (works for NSE in some regions)
    3. Estimate using delta-based formula
    """
    # 1. DataManager (NSE option chain)
    try:
        chain = dm.get_option_chain_sync(symbol)
        if chain and chain.get("data"):
            rows  = chain["data"]
            expiry = chain.get("expiry_dates", [""])[0] if chain.get("expiry_dates") else ""
            underlying = float(chain.get("underlying", price))
            # Build calls dataframe
            import pandas as _pd
            calls_list = []
            for row in rows:
                ce = row.get("CE", {})
                if ce.get("strikePrice"):
                    calls_list.append({
                        "strike":           float(ce.get("strikePrice", 0)),
                        "lastPrice":        float(ce.get("lastPrice", 0)),
                        "openInterest":     int(ce.get("openInterest", 0)),
                        "impliedVolatility":float(ce.get("impliedVolatility", 0)),
                    })
            if calls_list:
                calls = _pd.DataFrame(calls_list)
                calls["diff"] = abs(calls["strike"] - underlying)
                atm = calls.nsmallest(1, "diff").iloc[0]
                atm_strike = float(atm["strike"])
                ltp = float(atm.get("lastPrice", 0))
                if ltp < 0.01:
                    ltp = round(underlying * 0.018, 2)
                oi  = int(atm.get("openInterest", 0))
                iv  = round(float(atm.get("impliedVolatility", 0)), 1)
                lot = _estimate_lot(underlying)
                return {
                    "expiry":        expiry,
                    "atm_strike":    atm_strike,
                    "option_ltp":    round(ltp, 2),
                    "option_oi":     oi,
                    "iv":            iv,
                    "signal":        "BUY ATM CALL",
                    "entry_time":    "3:15 PM IST",
                    "exit_time":     "9:15 AM IST (next day)",
                    "sl_price":      round(ltp * 0.90, 2),
                    "sl_pct":        10,
                    "target_price":  round(ltp * 1.20, 2),
                    "target_pct":    20,
                    "lot_size":      lot,
                    "margin_approx": round(ltp * lot, 0),
                    "estimated":     False,
                }
    except Exception as e:
        logger.debug(f"DataManager ATM chain error for {symbol}: {e}")

    # 2. yfinance options (fallback — doesn't work for NSE in all regions)
    try:
        import yfinance as _yf
        ticker   = _yf.Ticker(f"{symbol}.NS")
        expiries = ticker.options
        if not expiries:
            return _estimate_atm(symbol, price)

        for expiry in expiries[:3]:
            try:
                chain = ticker.option_chain(expiry)
                calls = chain.calls.copy()
                if calls.empty:
                    continue
                calls["diff"] = abs(calls["strike"] - price)
                atm = calls.nsmallest(1, "diff").iloc[0]
                atm_strike = float(atm["strike"])
                ltp = float(atm.get("lastPrice", 0))
                if ltp < 0.01:
                    bid = float(atm.get("bid", 0))
                    ask = float(atm.get("ask", 0))
                    ltp = round((bid + ask) / 2, 2) if bid or ask else price * 0.018
                oi  = int(atm.get("openInterest", 0))
                iv  = round(float(atm.get("impliedVolatility", 0)) * 100, 1)
                lot = _estimate_lot(price)
                return {
                    "expiry":        expiry,
                    "atm_strike":    float(atm["strike"]),
                    "option_ltp":    round(ltp, 2),
                    "option_oi":     oi,
                    "iv":            iv,
                    "signal":        "BUY ATM CALL",
                    "entry_time":    "3:15 PM IST",
                    "exit_time":     "9:15 AM IST (next day)",
                    "sl_price":      round(ltp * 0.90, 2),
                    "sl_pct":        10,
                    "target_price":  round(ltp * 1.20, 2),
                    "target_pct":    20,
                    "lot_size":      lot,
                    "margin_approx": round(ltp * lot, 0),
                    "estimated":     False,
                }
            except Exception:
                continue
    except Exception as e:
        logger.debug(f"yfinance ATM error for {symbol}: {e}")

    return _estimate_atm(symbol, price)


# ─── Demo Data ───────────────────────────────────────────────────────
def _demo_run() -> dict:
    """Realistic demo when live data unavailable."""
    base = [
        {"symbol": "RELIANCE",   "company_name": "Reliance Industries",        "current_price": 2948.50, "weekly_change_pct": 5.2, "volume": 8450000},
        {"symbol": "TATAMOTORS", "company_name": "Tata Motors",                "current_price": 798.30,  "weekly_change_pct": 4.1, "volume": 12000000},
        {"symbol": "INFY",       "company_name": "Infosys",                    "current_price": 1752.60, "weekly_change_pct": 3.7, "volume": 5200000},
        {"symbol": "AXISBANK",   "company_name": "Axis Bank",                  "current_price": 1148.75, "weekly_change_pct": 3.2, "volume": 7800000},
        {"symbol": "SUNPHARMA",  "company_name": "Sun Pharma",                 "current_price": 1685.40, "weekly_change_pct": 2.9, "volume": 4100000},
    ]
    stocks = []
    for s in base:
        atm = _estimate_atm(s["symbol"], s["current_price"])
        atm["option_oi"] = random.randint(50_000, 200_000)
        atm["iv"]        = round(random.uniform(15, 35), 1)
        atm["estimated"] = True
        stocks.append({**s, "source": "demo", "atm_info": atm})

    now = datetime.now(timezone.utc)
    return {
        "date":             now.strftime("%Y-%m-%d"),
        "run_at":           now.isoformat(),
        "stocks":           stocks,
        "source":           "demo",
        "status":           "completed",
        "signals_ready_at": "3:15 PM IST",
    }


# ─── Performance Tracking ────────────────────────────────────────────
def _check_option_perf(
    symbol: str, entry_date: str, entry_price: float,
    entry_ltp: float, atm_strike: float
) -> dict:
    """
    Estimate option performance using next-day underlying price (delta ≈ 0.5 for ATM).
    yfinance does NOT provide NSE options data, so we use underlying price movement.
    """
    base = {"entry_ltp": round(entry_ltp, 2), "status": "no_data"}
    try:
        # Use DataManager (Groww first, then yfinance) — cached
        hist = dm.get_single_ohlcv_sync(f"{symbol}.NS", period="5d", interval="1h")
        if hist.empty:
            return {**base, "status": "no_data"}

        # Convert index to IST
        import pytz
        ist = pytz.timezone("Asia/Kolkata")
        hist.index = hist.index.tz_convert(ist)

        from datetime import date as _date
        entry_dt = datetime.strptime(entry_date, "%Y-%m-%d").date()

        # Find first hourly bar on the NEXT trading day at or after 9:00 AM IST
        exit_rows = hist[
            (hist.index.date > entry_dt) &
            (hist.index.hour >= 9)
        ]
        if exit_rows.empty:
            return {**base, "status": "pending"}

        exit_stock_price = float(exit_rows.iloc[0]["Open"])

        # ATM call P&L estimate via delta ≈ 0.5
        underlying_move = exit_stock_price - entry_price
        option_change   = 0.5 * underlying_move          # delta approx
        exit_ltp_est    = max(0.05, round(entry_ltp + option_change, 2))

        pct = round((exit_ltp_est - entry_ltp) / entry_ltp * 100, 2) if entry_ltp > 0 else 0
        return {
            "exit_ltp":         exit_ltp_est,
            "entry_ltp":        round(entry_ltp, 2),
            "pct_return":       pct,
            "exit_underlying":  round(exit_stock_price, 2),
            "entry_underlying": round(entry_price, 2),
            "status":           "win" if pct >= 0 else "loss",
            "method":           "delta_est",
            "checked_at":       datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.debug(f"Perf check {symbol}: {e}")
        return {**base, "status": "error"}


async def _track_perf_async(date_str: str) -> dict:
    """Fetch next-day open prices for all picks and compute estimated P&L."""
    db  = _get_db()
    doc = await db[COLL].find_one(
        {"date": date_str, "status": "completed"}, projection={"_id": 0}
    )
    if not doc:
        return {"message": f"No record for {date_str}"}

    if doc.get("performance_tracked"):
        return {"message": "Already tracked", "date": date_str, "stocks": doc["stocks"]}

    loop = asyncio.get_event_loop()
    updated = []
    for stock in doc.get("stocks", []):
        atm   = stock.get("atm_info", {})
        price = stock.get("current_price", 0)
        ltp   = atm.get("option_ltp", 0)
        strike = atm.get("atm_strike", 0)

        if price and ltp and strike:
            with ThreadPoolExecutor(max_workers=1) as pool:
                perf = await loop.run_in_executor(
                    pool, _check_option_perf,
                    stock["symbol"], date_str, float(price), float(ltp), float(strike)
                )
        else:
            perf = {"status": "no_data"}
        updated.append({**stock, "performance": perf})

    # Mark tracked only when at least 1 result resolved (not all pending)
    all_pending = all(u.get("performance", {}).get("status") == "pending" for u in updated)
    await db[COLL].update_one(
        {"date": date_str},
        {"$set": {"stocks": updated, "performance_tracked": not all_pending}}
    )
    return {"message": "Tracked", "date": date_str, "stocks": updated}


# ─── Main Workflow ───────────────────────────────────────────────────
async def _run_workflow(manual: bool = False) -> dict:
    """Fetch top 3 weekly F&O gainers + enrich with ATM call info."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    db    = _get_db()

    # Skip if today already done (unless manual)
    if not manual:
        existing = await db[COLL].find_one(
            {"date": today, "status": "completed"}, projection={"_id": 0}
        )
        if existing:
            return existing

    logger.info("Moneycontrol movers: starting workflow...")
    loop = asyncio.get_event_loop()

    # Step 1 — Scrape Moneycontrol
    with ThreadPoolExecutor(max_workers=1) as pool:
        mc_list = await loop.run_in_executor(pool, _scrape_moneycontrol_weekly)

    source = "moneycontrol"
    if len(mc_list) < 3:
        logger.info("MC scrape insufficient; falling back to yfinance gainers")
        with ThreadPoolExecutor(max_workers=1) as pool:
            mc_list = await loop.run_in_executor(pool, _compute_weekly_gainers_yf)
        source = "yfinance_fallback"

    if len(mc_list) < 3:
        logger.warning("All gainers sources failed; using demo data")
        result = _demo_run()
        await db[COLL].replace_one({"date": today}, result, upsert=True)
        return result

    top5 = mc_list[:5]

    # Step 2 — Enrich with ATM options info
    enriched = []
    for stock in top5:
        sym   = stock["symbol"]
        price = stock["current_price"]
        with ThreadPoolExecutor(max_workers=1) as pool:
            atm = await loop.run_in_executor(pool, _get_atm_info, sym, price)
        enriched.append({**stock, "atm_info": atm})

    now    = datetime.now(timezone.utc)
    result = {
        "date":             today,
        "run_at":           now.isoformat(),
        "stocks":           enriched,
        "source":           source,
        "status":           "completed",
        "signals_ready_at": "3:15 PM IST",
    }

    # Store to MongoDB
    await db[COLL].replace_one({"date": today}, {k: v for k, v in result.items()}, upsert=True)
    logger.info(f"Moneycontrol movers: {len(enriched)} stocks stored ({source})")
    return result


# ─── Scheduler ───────────────────────────────────────────────────────
_scheduler_active = False


def _start_scheduler():
    global _scheduler_active
    if _scheduler_active:
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        import pytz

        ist = pytz.timezone("Asia/Kolkata")

        def _job():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                new_loop.run_until_complete(_run_workflow(manual=False))
                new_loop.close()
            except Exception as exc:
                logger.error(f"Scheduler job error: {exc}")

        def _perf_job():
            try:
                yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                new_loop.run_until_complete(_track_perf_async(yesterday))
                new_loop.close()
                logger.info(f"Performance tracked for {yesterday}")
            except Exception as exc:
                logger.error(f"Performance job error: {exc}")

        sched = BackgroundScheduler(timezone=ist)
        sched.add_job(_job,      trigger="cron", hour=15, minute=0,
                      id="mc_movers_3pm",   replace_existing=True)
        sched.add_job(_perf_job, trigger="cron", hour=9,  minute=15,
                      id="mc_perf_9am",     replace_existing=True)
        sched.start()
        _scheduler_active = True
        logger.info("Moneycontrol movers scheduler started (3:00 PM IST daily).")
    except Exception as e:
        logger.warning(f"Scheduler init failed: {e}")


# Auto-start on module load
_start_scheduler()


# ─── Pydantic models ─────────────────────────────────────────────────
class RunResponse(BaseModel):
    status: str
    message: str


# ─── Endpoints ───────────────────────────────────────────────────────
@router.get("/movers")
async def get_movers():
    """Latest top-3 movers with ATM signals. Falls back to demo if not yet run."""
    db    = _get_db()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    doc = await db[COLL].find_one({"date": today}, sort=[("run_at", -1)], projection={"_id": 0})
    if not doc:
        doc = await db[COLL].find_one({}, sort=[("run_at", -1)], projection={"_id": 0})
    if not doc:
        return _demo_run()
    return doc


@router.post("/run")
async def manual_run():
    """Manual trigger — runs workflow immediately regardless of time."""
    result = await _run_workflow(manual=True)
    return {"status": "ok", "message": "Workflow executed", "result": result}


@router.get("/history")
async def get_history(limit: int = 30):
    """Last N days of picks with win/loss stats."""
    db = _get_db()
    cursor = db[COLL].find({}, sort=[("date", -1)], limit=limit, projection={"_id": 0})
    docs = await cursor.to_list(length=limit)

    # Compute aggregated win stats from tracked records
    total_picks = wins = 0
    returns = []
    best = {"pct": None, "symbol": None, "date": None}

    for doc in docs:
        for s in doc.get("stocks", []):
            perf = s.get("performance", {})
            if perf.get("status") in ("win", "loss"):
                total_picks += 1
                pct = perf.get("pct_return", 0)
                returns.append(pct)
                if perf["status"] == "win":
                    wins += 1
                if best["pct"] is None or pct > best["pct"]:
                    best = {"pct": pct, "symbol": s["symbol"], "date": doc["date"]}

    win_stats = {
        "total_tracked": total_picks,
        "wins":          wins,
        "losses":        total_picks - wins,
        "win_rate_pct":  round(wins / total_picks * 100, 1) if total_picks else None,
        "avg_return":    round(sum(returns) / len(returns), 2) if returns else None,
        "best":          best if best["pct"] is not None else None,
    }

    return {"count": len(docs), "history": docs, "win_stats": win_stats}


@router.post("/track-performance")
async def track_performance(date: str = None):
    """Manually trigger performance check for a given date (default: yesterday)."""
    if not date:
        date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    result = await _track_perf_async(date)
    return result


@router.get("/status")
async def get_status():
    """Scheduler + data status."""
    db    = _get_db()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_doc = await db[COLL].find_one(
        {"date": today}, projection={"_id": 0, "run_at": 1, "status": 1, "source": 1}
    )
    total = await db[COLL].count_documents({})
    return {
        "scheduler_active": _scheduler_active,
        "next_run":         "3:00 PM IST daily (auto)",
        "today_run":        today_doc,
        "total_records":    total,
    }
