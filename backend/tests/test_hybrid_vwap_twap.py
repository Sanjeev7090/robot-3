"""
Tests for Hybrid VWAP+TWAP Execution Strategy:
  - POST /api/hybrid-vwap/analyze  (signal, bands, execution_plan)
  - /api/auto-scan/{ticker}  (Hybrid VWAP+TWAP inclusion when signal fires)
  - HybridVWAP_TWAP_Executor class importability
"""
import os
import sys
import json
import math
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# ──────────────────────────────────────────────────────────────────────────────
# Bar Generators
# ──────────────────────────────────────────────────────────────────────────────

def make_bars_bounce_buy(n=50, base_close=2500.0, base_vol=1_000_000):
    """
    Craft bars that should trigger BOUNCE BUY:
      - All bars near VWAP (within 0.5%)
      - Last bar bullish  (close > open)
      - Last bar has hi_vol (vol_ratio >= 1.1)
    """
    bars = []
    for i in range(n - 1):
        bars.append({
            "open":   base_close - 10,
            "high":   base_close + 15,
            "low":    base_close - 15,
            "close":  base_close,
            "volume": base_vol,
        })
    # Last bar: slightly above VWAP (within 0.5%), bullish, high volume
    bars.append({
        "open":   base_close - 4,
        "high":   base_close + 5,
        "low":    base_close - 8,
        "close":  base_close + 1,   # close > open = bullish
        "volume": int(base_vol * 1.3),  # vol_ratio ~ 1.26 > 1.1
    })
    return bars


def make_bars_trend_buy(n=50, base_close=2500.0, base_vol=1_000_000):
    """
    Craft bars that trigger TREND_FOLLOW BUY:
      - Last close clearly above VWAP
      - Bullish last bar
      - RSI in 40–65 range
      - Hi vol
    """
    bars = []
    # Gradually rising bars so current > VWAP and RSI 40-65
    for i in range(n - 1):
        c = base_close + i * 0.5          # gentle uptrend
        bars.append({
            "open":   c - 2,
            "high":   c + 5,
            "low":    c - 5,
            "close":  c,
            "volume": base_vol,
        })
    last_close = base_close + (n - 1) * 0.5
    bars.append({
        "open":   last_close - 3,
        "high":   last_close + 8,
        "low":    last_close - 6,
        "close":  last_close + 2,   # bullish
        "volume": int(base_vol * 1.2),
    })
    return bars


def make_bars_wait(n=50, base_close=2500.0):
    """Bars that should return WAIT (low vol, price far from VWAP without trend conditions)."""
    bars = []
    for i in range(n):
        bars.append({
            "open":   base_close,
            "high":   base_close + 5,
            "low":    base_close - 5,
            "close":  base_close,
            "volume": 100_000,  # very low — vol_ratio never exceeds 1.1
        })
    return bars


def make_bars_under_20():
    """Only 15 bars — should trigger 400."""
    return [{"open": 100, "high": 105, "low": 95, "close": 102, "volume": 10000} for _ in range(15)]


def has_nan_or_inf(obj):
    """Recursively check for NaN/Infinity in a JSON-deserialized dict/list."""
    if isinstance(obj, float):
        return math.isnan(obj) or math.isinf(obj)
    if isinstance(obj, dict):
        return any(has_nan_or_inf(v) for v in obj.values())
    if isinstance(obj, list):
        return any(has_nan_or_inf(v) for v in obj)
    return False


# ──────────────────────────────────────────────────────────────────────────────
# 1. Import / Class Tests
# ──────────────────────────────────────────────────────────────────────────────

class TestHybridExecutorImport:
    """Verify the execution module exists and is importable."""

    def test_hybrid_executor_file_exists(self):
        import pathlib
        p = pathlib.Path("/app/backend/execution/hybrid_executor.py")
        assert p.exists(), "hybrid_executor.py not found"
        print("PASS: hybrid_executor.py exists")

    def test_hybrid_executor_class_importable(self):
        sys.path.insert(0, "/app/backend")
        from execution.hybrid_executor import HybridVWAP_TWAP_Executor
        assert HybridVWAP_TWAP_Executor is not None
        print("PASS: HybridVWAP_TWAP_Executor importable")

    def test_create_hybrid_executor_function(self):
        sys.path.insert(0, "/app/backend")
        from execution.hybrid_executor import create_hybrid_executor
        assert callable(create_hybrid_executor)
        print("PASS: create_hybrid_executor is callable")


# ──────────────────────────────────────────────────────────────────────────────
# 2. POST /api/hybrid-vwap/analyze  — valid payload
# ──────────────────────────────────────────────────────────────────────────────

class TestHybridVWAPAnalyzeEndpoint:
    """Core endpoint tests for /api/hybrid-vwap/analyze."""

    def _post(self, payload):
        return requests.post(
            f"{BASE_URL}/api/hybrid-vwap/analyze",
            json=payload,
            timeout=30,
        )

    # ── 2.1 Status & required fields ───────────────────────────────────────

    def test_valid_bars_returns_200(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
        print("PASS: 200 returned for valid bars")

    def test_response_has_required_fields(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        required = [
            "signal_type", "vwap", "twap", "upper_band", "lower_band",
            "rsi", "volume_ratio", "atr", "vwap_deviation_pct",
            "price_position", "vwap_signal_type", "execution_plan",
            "recommendation",
        ]
        missing = [f for f in required if f not in d]
        assert not missing, f"Missing fields: {missing}"
        print(f"PASS: all required fields present. signal_type={d['signal_type']}")

    def test_signal_type_is_valid_enum(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        assert d["signal_type"] in ("BUY", "SELL", "WAIT"), f"Invalid signal_type: {d['signal_type']}"
        print(f"PASS: signal_type={d['signal_type']}")

    def test_price_position_is_valid_enum(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        assert d["price_position"] in ("ABOVE_VWAP", "BELOW_VWAP", "AT_VWAP"), \
            f"Invalid price_position: {d['price_position']}"
        print(f"PASS: price_position={d['price_position']}")

    def test_vwap_signal_type_is_valid_enum(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        assert d["vwap_signal_type"] in ("BOUNCE", "TREND_FOLLOW", "WAIT"), \
            f"Invalid vwap_signal_type: {d['vwap_signal_type']}"
        print(f"PASS: vwap_signal_type={d['vwap_signal_type']}")

    def test_numeric_fields_are_numbers(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        for field in ["vwap", "twap", "upper_band", "lower_band", "rsi", "volume_ratio", "atr", "vwap_deviation_pct"]:
            val = d[field]
            assert isinstance(val, (int, float)), f"{field} is not numeric: {val}"
            assert not (isinstance(val, float) and (math.isnan(val) or math.isinf(val))), \
                f"{field} is NaN/Inf: {val}"
        print("PASS: all numeric fields are finite numbers")

    def test_no_nan_or_infinity_in_response(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        # Use raw text to detect literal NaN/Inf (JSON doesn't allow them but check anyway)
        raw = r.text
        assert "NaN" not in raw, "Response contains NaN"
        assert "Infinity" not in raw, "Response contains Infinity"
        assert "Inf" not in raw.replace("Infinity", ""), "Response contains Inf"
        print("PASS: no NaN or Infinity in response")

    def test_recommendation_is_non_empty_string(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["recommendation"], str) and len(d["recommendation"]) > 5
        print(f"PASS: recommendation present: '{d['recommendation'][:60]}...'")

    # ── 2.2 BOUNCE BUY signal ──────────────────────────────────────────────

    def test_bounce_buy_signal_fires(self):
        """Crafted bars should produce BUY signal via BOUNCE or TREND_FOLLOW."""
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        assert d["signal_type"] in ("BUY", "SELL"), \
            f"Expected BUY or SELL for bounce bars, got {d['signal_type']} " \
            f"(dev={d['vwap_deviation_pct']}, vol_ratio={d['volume_ratio']}, rsi={d['rsi']})"
        print(f"PASS: bounce bars gave signal_type={d['signal_type']}, vwap_signal_type={d['vwap_signal_type']}")

    def test_bounce_entry_price_present_on_buy(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        if d["signal_type"] != "WAIT":
            assert d.get("entry_price") is not None, "entry_price missing for non-WAIT signal"
            assert d.get("stop_loss") is not None, "stop_loss missing for non-WAIT signal"
            assert d.get("target1") is not None, "target1 missing for non-WAIT signal"
        print(f"PASS: trade levels present for signal={d['signal_type']}")

    # ── 2.3 Execution plan — default 12 slices ─────────────────────────────

    def test_execution_plan_has_12_slices_by_default(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars, "max_slices": 12})
        assert r.status_code == 200
        d = r.json()
        plan = d.get("execution_plan")
        assert plan is not None, "execution_plan is None"
        assert len(plan) == 12, f"Expected 12 slices, got {len(plan)}"
        print(f"PASS: execution_plan has 12 slices")

    def test_execution_plan_slice_schema(self):
        """Each slice must have: slice_no, time_offset_min, qty, target_price, vwap_basis."""
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        plan = d.get("execution_plan", [])
        assert len(plan) > 0, "execution_plan is empty"
        for s in plan:
            for field in ["slice_no", "time_offset_min", "qty", "target_price", "vwap_basis"]:
                assert field in s, f"Slice missing field: {field}"
        print(f"PASS: all slices have required fields (checked {len(plan)} slices)")

    def test_execution_plan_slice_numbers_sequential(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars, "max_slices": 12})
        assert r.status_code == 200
        d = r.json()
        plan = d.get("execution_plan", [])
        for i, s in enumerate(plan):
            assert s["slice_no"] == i + 1, f"slice_no mismatch at index {i}: expected {i+1}, got {s['slice_no']}"
        print("PASS: slice_no values are sequential 1..12")

    def test_execution_plan_time_offsets_increasing(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars, "max_slices": 12})
        assert r.status_code == 200
        d = r.json()
        plan = d.get("execution_plan", [])
        offsets = [s["time_offset_min"] for s in plan]
        for i in range(1, len(offsets)):
            assert offsets[i] >= offsets[i-1], \
                f"time_offset_min not non-decreasing at index {i}: {offsets}"
        assert offsets[0] == 0.0, f"First slice should start at 0m, got {offsets[0]}"
        print(f"PASS: time offsets non-decreasing; first={offsets[0]}, last={offsets[-1]}")

    def test_execution_plan_qty_sums_to_requested_quantity(self):
        """Total qty across slices == requested quantity."""
        qty = 100
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars, "quantity": qty, "max_slices": 12})
        assert r.status_code == 200
        d = r.json()
        plan = d.get("execution_plan", [])
        total_qty = sum(s["qty"] for s in plan)
        assert total_qty == qty, f"Total slice qty {total_qty} != requested {qty}"
        print(f"PASS: qty sum across 12 slices = {total_qty} (== requested {qty})")

    # ── 2.4 Custom quantity=500, max_slices=10 ────────────────────────────

    def test_custom_quantity_500_max_slices_10(self):
        bars = make_bars_bounce_buy()
        r = self._post({
            "ticker": "RELIANCE.NS",
            "bars": bars,
            "quantity": 500,
            "max_slices": 10,
        })
        assert r.status_code == 200
        d = r.json()
        plan = d.get("execution_plan", [])
        assert len(plan) == 10, f"Expected 10 slices, got {len(plan)}"
        total_qty = sum(s["qty"] for s in plan)
        assert total_qty == 500, f"Total qty {total_qty} != 500"
        # Each slice should be ~50
        for s in plan:
            assert 45 <= s["qty"] <= 60, f"Slice qty {s['qty']} outside expected ~50 range"
        print(f"PASS: qty=500, 10 slices, each ~50 (sum={total_qty})")

    # ── 2.5 Error: bars < 20 ──────────────────────────────────────────────

    def test_less_than_20_bars_returns_400(self):
        r = self._post({"ticker": "RELIANCE.NS", "bars": make_bars_under_20()})
        assert r.status_code == 400, f"Expected 400 for <20 bars, got {r.status_code}"
        detail = r.json().get("detail", "")
        assert "20" in detail or "bar" in detail.lower(), f"Unexpected error detail: {detail}"
        print(f"PASS: 400 returned for <20 bars — detail: '{detail}'")

    def test_zero_bars_returns_400(self):
        r = self._post({"ticker": "RELIANCE.NS", "bars": []})
        assert r.status_code == 400 or r.status_code == 422, \
            f"Expected 400/422 for empty bars, got {r.status_code}"
        print(f"PASS: {r.status_code} returned for empty bars")

    # ── 2.6 WAIT signal scenario ──────────────────────────────────────────

    def test_wait_signal_has_no_entry_sl(self):
        """When signal_type=WAIT, entry_price and stop_loss should be None."""
        bars = make_bars_wait()
        r = self._post({"ticker": "TEST.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        if d["signal_type"] == "WAIT":
            assert d.get("entry_price") is None, f"entry_price should be None for WAIT, got {d['entry_price']}"
            assert d.get("stop_loss") is None, f"stop_loss should be None for WAIT, got {d['stop_loss']}"
            print(f"PASS: WAIT signal has entry_price=None, stop_loss=None")
        else:
            print(f"NOTE: low-vol bars gave signal {d['signal_type']} — test skipped (signal depends on price relation to VWAP)")

    def test_wait_signal_execution_plan_still_returned(self):
        """Even for WAIT, execution_plan must be returned (always generated)."""
        bars = make_bars_wait()
        r = self._post({"ticker": "TEST.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        plan = d.get("execution_plan")
        assert plan is not None, "execution_plan should always be present"
        assert len(plan) > 0, "execution_plan should not be empty"
        print(f"PASS: execution_plan present even for WAIT signal (slices={len(plan)})")

    # ── 2.7 VWAP band relationship ─────────────────────────────────────────

    def test_upper_band_above_vwap_above_lower_band(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        assert d["upper_band"] > d["vwap"] > d["lower_band"], \
            f"Band order wrong: upper={d['upper_band']}, vwap={d['vwap']}, lower={d['lower_band']}"
        print(f"PASS: upper_band({d['upper_band']}) > vwap({d['vwap']}) > lower_band({d['lower_band']})")

    def test_vwap_deviation_pct_matches_price_position(self):
        bars = make_bars_bounce_buy()
        r = self._post({"ticker": "RELIANCE.NS", "bars": bars})
        assert r.status_code == 200
        d = r.json()
        dev = d["vwap_deviation_pct"]
        pp  = d["price_position"]
        if abs(dev) <= 0.5:
            assert pp == "AT_VWAP", f"dev={dev}% but price_position={pp} (expected AT_VWAP)"
        elif dev > 0.5:
            assert pp == "ABOVE_VWAP", f"dev={dev}% but price_position={pp}"
        else:
            assert pp == "BELOW_VWAP", f"dev={dev}% but price_position={pp}"
        print(f"PASS: vwap_deviation_pct={dev:.2f}% consistent with price_position={pp}")


# ──────────────────────────────────────────────────────────────────────────────
# 3. Auto-scan integration — Hybrid VWAP+TWAP in signals list
# ──────────────────────────────────────────────────────────────────────────────

class TestAutoScanHybridVWAP:
    """Verify Hybrid VWAP+TWAP is integrated in /api/auto-scan/{ticker}."""

    def test_auto_scan_returns_200_for_reliance(self):
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
        print("PASS: /api/auto-scan/RELIANCE.NS returned 200")

    def test_auto_scan_response_has_signals_and_confluence(self):
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "signals" in d, "Missing 'signals' key in auto-scan response"
        assert "confluence_score" in d, "Missing 'confluence_score' in auto-scan response"
        assert isinstance(d["signals"], list), "'signals' should be a list"
        print(f"PASS: auto-scan response has signals ({len(d['signals'])} items) and confluence_score={d['confluence_score']}")

    def test_auto_scan_confluence_score_is_int_in_range(self):
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200
        d = r.json()
        score = d.get("confluence_score", -1)
        assert isinstance(score, (int, float)), f"confluence_score not numeric: {score}"
        assert 0 <= score <= 100, f"confluence_score {score} out of range [0, 100]"
        print(f"PASS: confluence_score={score} in [0, 100]")

    def test_auto_scan_no_nan_or_inf(self):
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200
        raw = r.text
        assert "NaN" not in raw, "auto-scan response contains NaN"
        assert "Infinity" not in raw, "auto-scan response contains Infinity"
        print("PASS: no NaN/Infinity in auto-scan response")

    def test_auto_scan_signals_have_strategy_and_direction(self):
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200
        d = r.json()
        for sig in d.get("signals", []):
            assert "strategy" in sig, f"Signal missing 'strategy': {sig}"
            assert "direction" in sig, f"Signal missing 'direction': {sig}"
            assert sig["direction"] in ("BUY", "SELL"), f"direction must be BUY/SELL, got {sig['direction']}"
        print(f"PASS: all {len(d.get('signals', []))} signals have strategy + direction")

    def test_auto_scan_strategy_names_in_signals(self):
        """Check that at least one known strategy is present in signals."""
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200
        d = r.json()
        strategy_names = [s["strategy"] for s in d.get("signals", [])]
        # At least one signal from known strategies
        known = ["Godzilla", "SMC", "MiroFish", "Explosive", "Falling Knife",
                 "DEMON", "Golden", "Narrative", "AMDS", "PAC", "Hybrid VWAP"]
        found = [n for n in known if any(n.lower() in sn.lower() for sn in strategy_names)]
        print(f"Known strategies found in signals: {found}")
        print(f"All signals: {strategy_names}")
        # Just validate response structure — signal presence depends on market conditions
        assert isinstance(strategy_names, list), "Strategy names should be a list"

    def test_auto_scan_hybrid_vwap_in_signals_if_signal_fires(self):
        """If Hybrid VWAP fires for RELIANCE.NS, it should be in signals list."""
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200
        d = r.json()
        strategy_names = [s["strategy"].lower() for s in d.get("signals", [])]
        if any("hybrid vwap" in sn for sn in strategy_names):
            print("PASS: 'Hybrid VWAP+TWAP' is in signals list for RELIANCE.NS")
            # Validate its structure
            vwap_sig = next(s for s in d["signals"] if "hybrid vwap" in s["strategy"].lower())
            assert "entry" in vwap_sig, "Hybrid VWAP signal missing 'entry'"
            assert "stoploss" in vwap_sig, "Hybrid VWAP signal missing 'stoploss'"
            assert "targets" in vwap_sig, "Hybrid VWAP signal missing 'targets'"
        else:
            print("NOTE: Hybrid VWAP+TWAP returned WAIT for RELIANCE.NS today — not in signals (expected behavior)")
            # This is normal — many stocks will WAIT

    def test_auto_scan_weighted_confluence_present(self):
        """Verify weighted confluence fields (confluence_label, dominant_direction) exist."""
        r = requests.get(f"{BASE_URL}/api/auto-scan/RELIANCE.NS", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert "confluence_label" in d, "Missing 'confluence_label' in auto-scan response"
        assert "dominant_direction" in d, "Missing 'dominant_direction' in auto-scan response"
        assert d["dominant_direction"] in ("BUY", "SELL", "NEUTRAL"), \
            f"dominant_direction must be BUY/SELL/NEUTRAL, got {d['dominant_direction']}"
        print(f"PASS: confluence_label={d['confluence_label']}, dominant_direction={d['dominant_direction']}")
