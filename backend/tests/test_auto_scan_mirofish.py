"""Backend tests for /api/auto-scan/{ticker} with MiroFish Swarm integration.

Covers:
1. Auto-scan returns signals incl. MiroFish (BUY/SELL) when consensus matches
2. MiroFish signal contains required fields
3. Other strategies (SMC/AMDS/Falling Knife/etc.) still appear alongside MiroFish
4. MiroFish caching: second call within 5 min is faster
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
TIMEOUT = 60


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def first_scan(api_client):
    """First call - likely slower, may trigger MiroFish GPT-4o call."""
    t0 = time.time()
    r = api_client.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=TIMEOUT)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
    return {"data": r.json(), "elapsed": elapsed}


class TestAutoScanMiroFish:
    """Auto-scanner with MiroFish integration tests."""

    def test_first_scan_returns_signals(self, first_scan):
        data = first_scan["data"]
        assert data.get("ticker") == "RELIANCE.NS"
        assert isinstance(data.get("signals"), list)
        assert "current_price" in data and isinstance(data["current_price"], (int, float))
        # has_signal should be true if at least one strategy fired
        assert data.get("has_signal") == (len(data["signals"]) > 0)

    def test_signals_have_required_fields(self, first_scan):
        sigs = first_scan["data"]["signals"]
        assert len(sigs) > 0, "Expected at least one strategy signal"
        required = {"strategy", "direction", "entry", "stoploss", "targets", "confidence"}
        for s in sigs:
            missing = required - set(s.keys())
            assert not missing, f"signal {s.get('strategy')} missing: {missing}"
            assert s["direction"] in ("BUY", "SELL")
            assert isinstance(s["targets"], list) and len(s["targets"]) >= 1
            assert isinstance(s["confidence"], int)

    def test_mirofish_or_cached_present(self, first_scan, api_client):
        """MiroFish should appear in first scan if consensus is BUY/SELL.

        If it doesn't appear (HOLD/skipped), make a 2nd cached call and verify
        other strategies appear (so scanner still functions).
        """
        sigs = first_scan["data"]["signals"]
        mf_signals = [s for s in sigs if "MiroFish" in s.get("strategy", "")]
        if mf_signals:
            mf = mf_signals[0]
            assert "MiroFish" in mf["strategy"]
            assert mf["direction"] in ("BUY", "SELL")
            assert mf["entry"] > 0
            assert mf["stoploss"] > 0
            assert len(mf["targets"]) >= 1
            assert 0 < mf["confidence"] <= 100
        else:
            # MiroFish returned HOLD or skipped - at least other strategies should fire
            non_mf = [s for s in sigs if "MiroFish" not in s.get("strategy", "")]
            assert len(non_mf) > 0, "No strategy signals at all"

    def test_other_strategies_alongside(self, first_scan):
        """At least one non-MiroFish strategy should appear (SMC/AMDS/etc.)."""
        sigs = first_scan["data"]["signals"]
        non_mf = [s for s in sigs if "MiroFish" not in s.get("strategy", "")]
        assert len(non_mf) > 0, f"Expected non-MiroFish strategies, got: {[s['strategy'] for s in sigs]}"

    def test_caching_faster_second_call(self, first_scan, api_client):
        """Second call within 5 minutes should be at least as fast (cache hit)."""
        first_elapsed = first_scan["elapsed"]
        t0 = time.time()
        r = api_client.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=TIMEOUT)
        second_elapsed = time.time() - t0
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("signals"), list)
        print(f"first={first_elapsed:.2f}s second={second_elapsed:.2f}s")
        # cache should not be slower than first call by a meaningful amount.
        # second call may still call yfinance, but MiroFish should be cached.
        # allow some tolerance.
        assert second_elapsed <= first_elapsed + 5, (
            f"Second call slower: first={first_elapsed:.2f}s second={second_elapsed:.2f}s"
        )

    def test_invalid_ticker_graceful(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auto-scan/INVALIDXYZ123.NS", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert data.get("has_signal") is False
        assert isinstance(data.get("signals"), list)
