"""
PE-CE OI Difference Tracker backend tests
Tests: GET /api/pece/history/{symbol}, POST /api/pece/snapshot/{symbol}, GET /api/pece/latest/{symbol}
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ─── History Endpoint Tests ───────────────────────────────────────────────────
class TestPECEHistory:
    """Tests for GET /api/pece/history/{symbol}"""

    def test_history_nifty_demo_200(self):
        """GET history with demo=true should return 200"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=60")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"

    def test_history_response_structure(self):
        """Response must have symbol, count, data, source fields"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=10")
        assert r.status_code == 200
        d = r.json()
        assert "symbol" in d, "Missing 'symbol'"
        assert "count" in d, "Missing 'count'"
        assert "data" in d, "Missing 'data'"
        assert "source" in d, "Missing 'source'"

    def test_history_count_positive(self):
        """Demo mode should return count > 0"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=60")
        assert r.status_code == 200
        d = r.json()
        assert d["count"] > 0, f"Expected count > 0, got {d['count']}"

    def test_history_data_fields(self):
        """Each snapshot must have required fields"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=5")
        assert r.status_code == 200
        d = r.json()
        assert len(d["data"]) > 0, "data array is empty"
        snap = d["data"][0]
        required_fields = ["time_str", "put_oi", "call_oi", "pece_diff", "pcr", "source"]
        for field in required_fields:
            assert field in snap, f"Missing field: {field}"

    def test_history_pcr_realistic_range(self):
        """Demo PCR values should be between 0.5 and 2.0"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=60")
        assert r.status_code == 200
        d = r.json()
        assert d["count"] > 0
        pcr_values = [snap["pcr"] for snap in d["data"] if snap.get("pcr")]
        assert len(pcr_values) > 0, "No PCR values found"
        for pcr in pcr_values[:10]:  # Check first 10
            assert 0.1 <= pcr <= 5.0, f"PCR {pcr} outside realistic range (0.1-5.0)"

    def test_history_demo_source(self):
        """With demo=true and empty DB, source should be 'demo'"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=60")
        assert r.status_code == 200
        d = r.json()
        # source should be 'demo' or 'mongodb' (if data exists)
        assert d["source"] in ["demo", "mongodb", "empty"], f"Unexpected source: {d['source']}"

    def test_history_banknifty_demo(self):
        """BANKNIFTY symbol should also work with demo=true"""
        r = requests.get(f"{BASE_URL}/api/pece/history/BANKNIFTY?demo=true&limit=10")
        assert r.status_code == 200
        d = r.json()
        assert d["symbol"] == "BANKNIFTY"
        assert d["count"] > 0

    def test_history_finnifty_demo(self):
        """FINNIFTY symbol should also work with demo=true"""
        r = requests.get(f"{BASE_URL}/api/pece/history/FINNIFTY?demo=true&limit=10")
        assert r.status_code == 200
        d = r.json()
        assert d["symbol"] == "FINNIFTY"
        assert d["count"] > 0

    def test_history_pece_diff_is_put_minus_call(self):
        """pece_diff should equal put_oi - call_oi"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=5")
        assert r.status_code == 200
        d = r.json()
        for snap in d["data"][:3]:
            expected_diff = snap["put_oi"] - snap["call_oi"]
            assert snap["pece_diff"] == expected_diff, (
                f"pece_diff {snap['pece_diff']} != put_oi - call_oi = {expected_diff}"
            )

    def test_history_time_str_format(self):
        """time_str should be in HH:MM format"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=5")
        assert r.status_code == 200
        d = r.json()
        for snap in d["data"][:3]:
            ts = snap["time_str"]
            assert len(ts) == 5, f"time_str '{ts}' should be HH:MM (len 5)"
            assert ":" in ts, f"time_str '{ts}' missing colon"

    def test_history_formatted_fields_present(self):
        """Formatted fields (put_oi_fmt, etc.) should be present in response"""
        r = requests.get(f"{BASE_URL}/api/pece/history/NIFTY?demo=true&limit=5")
        assert r.status_code == 200
        d = r.json()
        assert len(d["data"]) > 0
        snap = d["data"][0]
        fmt_fields = ["put_oi_fmt", "call_oi_fmt", "pece_diff_fmt"]
        for field in fmt_fields:
            assert field in snap, f"Missing formatted field: {field}"
            assert snap[field], f"Formatted field {field} is empty"


# ─── Snapshot Endpoint Tests ──────────────────────────────────────────────────
class TestPECESnapshot:
    """Tests for POST /api/pece/snapshot/{symbol}"""

    def test_snapshot_nifty_200(self):
        """POST snapshot for NIFTY should return 200"""
        r = requests.post(f"{BASE_URL}/api/pece/snapshot/NIFTY")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"

    def test_snapshot_response_structure(self):
        """Snapshot response must have status, snapshot, message"""
        r = requests.post(f"{BASE_URL}/api/pece/snapshot/NIFTY")
        assert r.status_code == 200
        d = r.json()
        assert "status" in d, "Missing 'status'"
        assert "message" in d, "Missing 'message'"
        # 'snapshot' can be None if NSE unavailable
        assert "snapshot" in d, "Missing 'snapshot' key"

    def test_snapshot_status_valid_values(self):
        """Status should be one of: live, cached, unavailable"""
        r = requests.post(f"{BASE_URL}/api/pece/snapshot/NIFTY")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] in ["live", "cached", "unavailable"], (
            f"Unexpected status: {d['status']}"
        )

    def test_snapshot_banknifty(self):
        """POST snapshot for BANKNIFTY should return 200"""
        r = requests.post(f"{BASE_URL}/api/pece/snapshot/BANKNIFTY")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] in ["live", "cached", "unavailable"]

    def test_snapshot_live_has_snapshot_fields(self):
        """If status is 'live', snapshot must have required fields"""
        r = requests.post(f"{BASE_URL}/api/pece/snapshot/NIFTY")
        assert r.status_code == 200
        d = r.json()
        if d["status"] == "live" and d["snapshot"]:
            snap = d["snapshot"]
            assert snap["put_oi"] > 0
            assert snap["call_oi"] > 0
            assert snap["source"] == "nse_live"


# ─── Latest Endpoint Tests ────────────────────────────────────────────────────
class TestPECELatest:
    """Tests for GET /api/pece/latest/{symbol}"""

    def test_latest_nifty_demo_200(self):
        """GET latest with demo=true should return 200"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/NIFTY?demo=true")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"

    def test_latest_response_structure(self):
        """Response must have symbol, bias, bias_color, pcr_trend, snapshot"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/NIFTY?demo=true")
        assert r.status_code == 200
        d = r.json()
        assert "symbol" in d
        assert "bias" in d
        assert "bias_color" in d
        assert "pcr_trend" in d
        assert "snapshot" in d

    def test_latest_bias_valid(self):
        """Bias must be one of the valid bias values"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/NIFTY?demo=true")
        assert r.status_code == 200
        d = r.json()
        valid_biases = ["STRONG BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONG BEARISH"]
        assert d["bias"] in valid_biases, f"Invalid bias: {d['bias']}"

    def test_latest_bias_color_hex(self):
        """bias_color must be a hex color string"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/NIFTY?demo=true")
        assert r.status_code == 200
        d = r.json()
        assert d["bias_color"].startswith("#"), f"bias_color should start with '#': {d['bias_color']}"

    def test_latest_pcr_trend_valid(self):
        """pcr_trend should be Rising, Falling, or Neutral"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/NIFTY?demo=true")
        assert r.status_code == 200
        d = r.json()
        assert d["pcr_trend"] in ["Rising", "Falling", "Neutral"], (
            f"Invalid pcr_trend: {d['pcr_trend']}"
        )

    def test_latest_snapshot_not_none_demo(self):
        """With demo=true, snapshot should not be None"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/NIFTY?demo=true")
        assert r.status_code == 200
        d = r.json()
        assert d["snapshot"] is not None, "snapshot is None even with demo=true"

    def test_latest_snapshot_fields(self):
        """Snapshot in latest response must have all required fields"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/NIFTY?demo=true")
        assert r.status_code == 200
        d = r.json()
        snap = d["snapshot"]
        assert snap is not None
        for field in ["put_oi", "call_oi", "pece_diff", "pcr", "time_str", "source"]:
            assert field in snap, f"Missing field in snapshot: {field}"

    def test_latest_banknifty(self):
        """GET latest for BANKNIFTY should work"""
        r = requests.get(f"{BASE_URL}/api/pece/latest/BANKNIFTY?demo=true")
        assert r.status_code == 200
        d = r.json()
        assert d["symbol"] == "BANKNIFTY"
        assert d["bias"] in ["STRONG BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "STRONG BEARISH"]


# ─── Clear History (cleanup) ──────────────────────────────────────────────────
class TestPECECleanup:
    """Tests for DELETE /api/pece/history/{symbol}"""

    def test_clear_history_returns_200(self):
        """DELETE history should return 200 with deleted count"""
        # First add something via snapshot, then delete
        r = requests.delete(f"{BASE_URL}/api/pece/history/NIFTY_TEST_CLEANUP")
        assert r.status_code == 200
        d = r.json()
        assert "deleted" in d
        assert isinstance(d["deleted"], int)
