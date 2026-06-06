"""
Unit Tests — Execution Engine (Phase 3)
========================================
Tests: order placement, SL/TP triggers, P&L calculation,
       paper/shadow modes, daily stats, EOD close.

Run:  pytest backend/tests/test_execution_engine.py -v
"""
import sys
import pytest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.execution_engine import (
    ExecutionEngine, Order,
    MODE_PAPER, MODE_LIVE, MODE_SHADOW,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def eng():
    """Fresh ExecutionEngine for each test."""
    e = ExecutionEngine()
    e.reset_daily()
    return e

def _place(eng, direction="BUY", qty=10, entry=2800.0, sl=2760.0, tp=2860.0,
           confidence=60, ticker="RELIANCE.NS", mode=MODE_PAPER):
    eng.set_mode(mode)
    return eng.place_entry(
        ticker          = ticker,
        direction       = direction,
        quantity        = qty,
        entry_price     = entry,
        sl_price        = sl,
        tp_price        = tp,
        confidence      = confidence,
        dreamer_signal  = 0.65 if direction == "BUY" else -0.65,
        risk_inr        = qty * abs(entry - sl),
    )


# ── Mode management ───────────────────────────────────────────────────────────

class TestModeManagement:
    def test_default_mode_is_paper(self, eng):
        assert eng.mode == MODE_PAPER

    def test_switch_to_shadow(self, eng):
        r = eng.set_mode(MODE_SHADOW)
        assert r["success"] is True
        assert eng.mode == MODE_SHADOW

    def test_switch_live_fails_without_keys(self, eng):
        """Live mode switch should fail when GROWW_API_KEY not set."""
        import os
        os.environ.pop("GROWW_API_KEY",    None)
        os.environ.pop("GROWW_API_SECRET", None)
        r = eng.set_mode(MODE_LIVE)
        assert r["success"] is False
        assert "GROWW_API_KEY" in r.get("error", "")

    def test_invalid_mode(self, eng):
        r = eng.set_mode("quantum")
        assert r["success"] is False


# ── Order placement (paper) ───────────────────────────────────────────────────

class TestPaperOrderPlacement:
    def test_place_buy_order(self, eng):
        r = _place(eng)
        assert r["success"] is True
        assert r["order"]["status"] == "OPEN"
        assert r["order"]["direction"] == "BUY"
        assert r["order"]["mode"] == MODE_PAPER

    def test_place_sell_order(self, eng):
        r = _place(eng, direction="SELL", sl=2840.0, tp=2740.0)
        assert r["success"] is True
        assert r["order"]["direction"] == "SELL"

    def test_order_stored_in_state(self, eng):
        _place(eng)
        positions = eng.get_open_positions()
        assert len(positions) == 1

    def test_max_one_open_position(self, eng):
        _place(eng)
        r2 = _place(eng)   # second order should fail
        assert r2["success"] is False
        assert "Max open positions" in r2.get("error", "")

    def test_low_confidence_rejected(self, eng):
        r = _place(eng, confidence=10)   # below 30 threshold
        assert r["success"] is False
        assert "Confidence" in r.get("error", "")

    def test_fills_counter_increments(self, eng):
        _place(eng)
        stats = eng.get_daily_stats()
        assert stats["daily_fills"] == 1


# ── Shadow mode ───────────────────────────────────────────────────────────────

class TestShadowMode:
    def test_shadow_order_status(self, eng):
        r = _place(eng, mode=MODE_SHADOW)
        assert r["success"] is True
        assert r["order"]["status"] == "SHADOW"

    def test_shadow_increments_counter(self, eng):
        _place(eng, mode=MODE_SHADOW)
        stats = eng.get_daily_stats()
        assert stats["shadow_signals_today"] == 1

    def test_shadow_visible_in_stats(self, eng):
        _place(eng, mode=MODE_SHADOW)
        stats = eng.get_daily_stats()
        assert len(stats["shadow_list"]) == 1

    def test_shadow_does_not_count_as_fill(self, eng):
        """Shadow orders should not increment daily_fills."""
        _place(eng, mode=MODE_SHADOW)
        stats = eng.get_daily_stats()
        assert stats["daily_fills"] == 0


# ── SL / TP triggers ──────────────────────────────────────────────────────────

class TestSLTPTriggers:
    def test_tp_hit_buy(self, eng):
        """Price hits TP → position closed with profit."""
        _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=10)
        closed = eng.check_positions("RELIANCE.NS", 2860.0)
        assert len(closed) == 1
        assert closed[0]["exit_reason"] == "TP"
        assert closed[0]["pnl"] > 0

    def test_sl_hit_buy(self, eng):
        """Price hits SL → position closed with loss."""
        _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=10)
        closed = eng.check_positions("RELIANCE.NS", 2760.0)
        assert len(closed) == 1
        assert closed[0]["exit_reason"] == "SL"
        assert closed[0]["pnl"] < 0

    def test_tp_hit_sell(self, eng):
        """Short position: price falls to TP → profit."""
        _place(eng, direction="SELL", entry=2800, sl=2840, tp=2740, qty=10)
        closed = eng.check_positions("RELIANCE.NS", 2740.0)
        assert closed[0]["pnl"] > 0
        assert closed[0]["exit_reason"] == "TP"

    def test_sl_hit_sell(self, eng):
        """Short position: price rises to SL → loss."""
        _place(eng, direction="SELL", entry=2800, sl=2840, tp=2740, qty=10)
        closed = eng.check_positions("RELIANCE.NS", 2840.0)
        assert closed[0]["pnl"] < 0
        assert closed[0]["exit_reason"] == "SL"

    def test_no_trigger_between_sl_tp(self, eng):
        """Price between SL and TP → no close."""
        _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=10)
        closed = eng.check_positions("RELIANCE.NS", 2820.0)
        assert len(closed) == 0


# ── P&L calculation ───────────────────────────────────────────────────────────

class TestPnLCalculation:
    def test_pnl_magnitude_correct(self, eng):
        """BUY 10 × entry 2800, exit 2860 → P&L = +600."""
        _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=10)
        closed = eng.check_positions("RELIANCE.NS", 2860.0)
        assert abs(closed[0]["pnl"] - 600.0) < 1.0

    def test_net_pnl_less_than_gross(self, eng):
        """Net P&L should be less than gross P&L (brokerage deducted)."""
        _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=10)
        closed = eng.check_positions("RELIANCE.NS", 2860.0)
        assert closed[0]["net_pnl"] < closed[0]["pnl"]

    def test_daily_pnl_accumulates(self, eng):
        """Multiple trades: daily P&L = sum of all P&Ls."""
        # First trade: TP
        _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=10)
        eng.check_positions("RELIANCE.NS", 2860.0)
        pnl1 = eng.get_daily_stats()["daily_pnl"]

        # Second trade: SL
        eng2 = ExecutionEngine()
        eng2.set_mode(MODE_PAPER)
        eng2._daily_pnl = pnl1
        _place_on_eng = eng2.place_entry(
            ticker="RELIANCE.NS", direction="BUY", quantity=5,
            entry_price=2800, sl_price=2760, tp_price=2860,
            confidence=50, dreamer_signal=0.5, risk_inr=200,
        )
        eng2.check_positions("RELIANCE.NS", 2760.0)
        stats = eng2.get_daily_stats()
        assert stats["daily_pnl"] < pnl1   # loss reduced overall

    def test_pnl_on_manual_close(self, eng):
        """Manual close at arbitrary price computes correct P&L."""
        r = _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=5)
        oid = r["order"]["order_id"]
        result = eng.close_position(oid, exit_price=2830.0, reason="MANUAL")
        assert result["success"] is True
        expected_pnl = (2830 - 2800) * 5
        assert abs(result["order"]["pnl"] - expected_pnl) < 1.0


# ── Daily stats & reset ───────────────────────────────────────────────────────

class TestDailyStatsReset:
    def test_stats_start_at_zero(self, eng):
        stats = eng.get_daily_stats()
        assert stats["daily_pnl"]   == 0.0
        assert stats["daily_fills"] == 0
        assert stats["open_positions"] == 0

    def test_reset_clears_everything(self, eng):
        _place(eng)
        eng.reset_daily()
        stats = eng.get_daily_stats()
        assert stats["daily_pnl"]      == 0.0
        assert stats["daily_fills"]    == 0
        assert stats["open_positions"] == 0

    def test_order_history_after_close(self, eng):
        _place(eng, qty=10, entry=2800, sl=2760, tp=2860)
        eng.check_positions("RELIANCE.NS", 2860.0)
        history = eng.get_order_history()
        assert len(history) >= 1

    def test_ticker_conversion_nse(self, eng):
        sym, exch = ExecutionEngine._to_groww_symbol("RELIANCE.NS")
        assert sym  == "RELIANCE"
        assert exch == "NSE"

    def test_ticker_conversion_bse(self, eng):
        sym, exch = ExecutionEngine._to_groww_symbol("HDFCBANK.BO")
        assert sym  == "HDFCBANK"
        assert exch == "BSE"

    def test_ticker_conversion_bare(self, eng):
        sym, exch = ExecutionEngine._to_groww_symbol("TCS")
        assert sym  == "TCS"
        assert exch == "NSE"


# ── EOD close ────────────────────────────────────────────────────────────────

class TestEODClose:
    def test_close_all_positions(self, eng):
        _place(eng, direction="BUY", entry=2800, sl=2760, tp=2860, qty=5)
        closed = eng.close_all_positions({"RELIANCE.NS": 2820.0}, reason="EOD")
        assert len(closed) == 1
        assert closed[0]["exit_reason"] == "EOD"

    def test_close_all_when_no_positions(self, eng):
        closed = eng.close_all_positions({}, reason="EOD")
        assert closed == []
