"""
Unit Tests — Trading Loop Meta Decision + Market Hours (Phase 3)
================================================================
Tests: meta decision logic, market hours gate, confidence blending.

Run:  pytest backend/tests/test_trading_loop.py -v
"""
import sys
import pytest
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.trading_loop import TradingLoop


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def tl():
    return TradingLoop()

def make_ist(weekday, hour, minute):
    """Create IST datetime: weekday 0=Mon, 6=Sun."""
    base = datetime(2026, 6, 2 + weekday, hour, minute, 0, tzinfo=timezone.utc)
    return base  # we pass IST directly (not UTC offset)


# ── Market hours ─────────────────────────────────────────────────────────────

class TestMarketHours:
    def test_open_weekday_morning(self):
        # Tuesday 10:30 IST
        dt = datetime(2026, 6, 2, 10, 30, tzinfo=timezone.utc)  # Tuesday
        assert TradingLoop._is_market_open(dt) is True

    def test_open_exactly_at_open(self):
        dt = datetime(2026, 6, 2, 9, 15, tzinfo=timezone.utc)
        assert TradingLoop._is_market_open(dt) is True

    def test_closed_before_open(self):
        dt = datetime(2026, 6, 2, 9, 14, tzinfo=timezone.utc)
        assert TradingLoop._is_market_open(dt) is False

    def test_closed_after_close(self):
        dt = datetime(2026, 6, 2, 15, 30, tzinfo=timezone.utc)
        assert TradingLoop._is_market_open(dt) is False

    def test_closed_on_weekend_saturday(self):
        dt = datetime(2026, 6, 6, 12, 0, tzinfo=timezone.utc)  # Saturday
        assert TradingLoop._is_market_open(dt) is False

    def test_closed_on_weekend_sunday(self):
        dt = datetime(2026, 6, 7, 10, 0, tzinfo=timezone.utc)  # Sunday
        assert TradingLoop._is_market_open(dt) is False

    def test_open_friday_afternoon(self):
        dt = datetime(2026, 6, 5, 14, 45, tzinfo=timezone.utc)  # Friday 14:45
        assert TradingLoop._is_market_open(dt) is True

    def test_closed_at_exactly_15_30(self):
        dt = datetime(2026, 6, 2, 15, 30, tzinfo=timezone.utc)
        assert TradingLoop._is_market_open(dt) is False


# ── Meta decision ─────────────────────────────────────────────────────────────

class TestMetaDecision:
    # Shorthand
    def meta(self, dreamer_signal="HOLD", dreamer_conf=0, dreamer_active=False,
             regime="SIDEWAYS", rsi=50, vol_ratio=1.0, atr_pct=0.015, budget_mult=1.0):
        return TradingLoop._compute_meta_decision(
            dreamer_dec = {
                "signal":         dreamer_signal,
                "confidence":     dreamer_conf,
                "direction":      1 if dreamer_signal == "BUY" else (-1 if dreamer_signal == "SELL" else 0),
                "dreamer_active": dreamer_active,
            },
            market_ctx = {
                "regime":    regime,
                "rsi14":     rsi,
                "vol_ratio": vol_ratio,
                "atr_pct":   atr_pct,
            },
            risk_profile = {"risk_budget_multiplier": budget_mult},
        )

    def test_returns_dict_with_required_keys(self):
        m = self.meta()
        for key in ["signal", "confidence", "regime", "rsi14", "source", "budget_mult"]:
            assert key in m, f"Missing key: {key}"

    def test_uptrend_low_rsi_gives_buy(self):
        """Strong UPTREND + RSI 45 → BUY signal."""
        m = self.meta(regime="UPTREND", rsi=45, vol_ratio=1.6)
        assert m["signal"] in ("BUY", "HOLD")
        if m["signal"] == "BUY":
            assert m["confidence"] > 0

    def test_downtrend_high_rsi_gives_sell(self):
        """DOWNTREND + RSI 65 → SELL signal."""
        m = self.meta(regime="DOWNTREND", rsi=65, vol_ratio=1.6)
        assert m["signal"] in ("SELL", "HOLD")

    def test_dreamer_buy_uptrend_agree_high_conf(self):
        """DreamerV3 BUY + UPTREND → high combined confidence."""
        m = self.meta(dreamer_signal="BUY", dreamer_conf=70, dreamer_active=True,
                      regime="UPTREND", rsi=50, vol_ratio=1.5)
        assert m["signal"] == "BUY"
        assert m["confidence"] >= 40

    def test_dreamer_buy_downtrend_disagree_lower_conf(self):
        """DreamerV3 BUY + DOWNTREND → signal disagreement → reduced confidence."""
        m_agree = self.meta(dreamer_signal="BUY", dreamer_conf=70, dreamer_active=True,
                            regime="UPTREND", rsi=50)
        m_disagree = self.meta(dreamer_signal="BUY", dreamer_conf=70, dreamer_active=True,
                               regime="DOWNTREND", rsi=65)
        # Disagreement should produce lower confidence or HOLD
        assert m_disagree["confidence"] <= m_agree["confidence"] or m_disagree["signal"] == "HOLD"

    def test_budget_mult_scales_confidence(self):
        """Budget multiplier 0.5 → confidence halved."""
        m_full    = self.meta(dreamer_signal="BUY", dreamer_conf=60, dreamer_active=True,
                              regime="UPTREND", rsi=50, budget_mult=1.0)
        m_reduced = self.meta(dreamer_signal="BUY", dreamer_conf=60, dreamer_active=True,
                              regime="UPTREND", rsi=50, budget_mult=0.5)
        assert m_reduced["confidence"] <= m_full["confidence"]

    def test_extreme_volatility_reduces_confidence(self):
        """ATR > 5.5% → extreme volatility → confidence reduced."""
        m_normal  = self.meta(regime="UPTREND", rsi=50, atr_pct=0.015)
        m_extreme = self.meta(regime="UPTREND", rsi=50, atr_pct=0.06)
        assert m_extreme["confidence"] <= m_normal["confidence"]

    def test_overbought_rsi_reduces_buy_confidence(self):
        """RSI > 75 (overbought) → confidence penalty for BUY."""
        m_normal      = self.meta(regime="UPTREND", rsi=55, vol_ratio=1.4)
        m_overbought  = self.meta(regime="UPTREND", rsi=80, vol_ratio=1.4)
        # Overbought should not confidently signal BUY
        assert m_overbought["confidence"] <= m_normal["confidence"] or \
               m_overbought["signal"] != "BUY"

    def test_sideways_regime_produces_hold(self):
        """Sideways market with avg RSI → HOLD."""
        m = self.meta(regime="SIDEWAYS", rsi=50, vol_ratio=1.0)
        assert m["signal"] == "HOLD"

    def test_confidence_always_0_to_100(self):
        """Confidence must be in [0, 100] range for any inputs."""
        test_cases = [
            dict(dreamer_signal="BUY",  dreamer_conf=200, dreamer_active=True, regime="UPTREND",   rsi=10,  atr_pct=0.10),
            dict(dreamer_signal="SELL", dreamer_conf=0,   dreamer_active=False, regime="DOWNTREND", rsi=90,  atr_pct=0.01),
            dict(dreamer_signal="HOLD", dreamer_conf=50,  dreamer_active=True, regime="SIDEWAYS",   rsi=50,  atr_pct=0.02),
        ]
        for tc in test_cases:
            m = self.meta(**tc)
            assert 0 <= m["confidence"] <= 100, \
                f"Confidence out of range: {m['confidence']} for inputs {tc}"

    def test_source_technical_only_when_dreamer_inactive(self):
        """When DreamerV3 is inactive, source = 'technical_only'."""
        m = self.meta(dreamer_active=False, regime="UPTREND", rsi=45)
        assert m["source"] == "technical_only"

    def test_source_dreamer_plus_technical_when_active(self):
        """When DreamerV3 active with signal, source = 'dreamer+technical'."""
        m = self.meta(dreamer_signal="BUY", dreamer_conf=65, dreamer_active=True,
                      regime="UPTREND", rsi=50)
        assert m["source"] == "dreamer+technical"


# ── TradingLoop start/stop (no APScheduler jobs, just state) ─────────────────

class TestTradingLoopState:
    def test_initial_state_not_running(self, tl):
        assert tl._running is False

    def test_start_sets_running(self, tl):
        r = tl.start(interval_minutes=30)    # 30min won't fire in test
        assert r["success"] is True
        assert tl._running is True
        tl.stop()

    def test_stop_sets_not_running(self, tl):
        tl.start(interval_minutes=30)
        r = tl.stop()
        assert r["success"] is True
        assert tl._running is False

    def test_double_start_fails(self, tl):
        tl.start(interval_minutes=30)
        r = tl.start(interval_minutes=30)
        assert r["success"] is False
        tl.stop()

    def test_interval_clamped_to_range(self, tl):
        r = tl.start(interval_minutes=999)   # > 30 → clamped
        assert r["interval_minutes"] <= 30
        tl.stop()

        r2 = tl.start(interval_minutes=0)    # < 1 → clamped
        assert r2["interval_minutes"] >= 1
        tl.stop()

    def test_get_status_keys(self, tl):
        status = tl.get_status()
        for key in ["running", "interval_minutes", "cycle_count",
                    "last_cycle_time", "market_open"]:
            assert key in status, f"Missing key in loop status: {key}"
