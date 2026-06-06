"""
Unit Tests — Risk Portfolio Manager (Phase 2)
=============================================
Tests: Kelly Criterion, VaR/CVaR, dynamic position sizing,
       feasibility scoring, risk budget management.

Run:  pytest backend/tests/test_risk_portfolio_manager.py -v
"""
import sys
import pytest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.risk_portfolio_manager import (
    RiskPortfolioManager,
    VaRResult,
    PositionSizeResult,
    compute_kelly_fraction,
    compute_var_cvar,
    compute_position_size,
    rpm,
)


# ── Kelly Criterion ───────────────────────────────────────────────────────────
# Signature: compute_kelly_fraction(win_rate_pct, avg_win_pct, avg_loss_pct)
# win_rate_pct: e.g. 55.0 (not 0.55); avg_win/loss_pct: % return values

class TestKellyCriterion:
    def test_basic_kelly_positive(self):
        """Positive EV trade → positive Kelly fraction."""
        kf = compute_kelly_fraction(win_rate_pct=55.0, avg_win_pct=1.5, avg_loss_pct=1.0)
        assert 0 < kf <= 0.25, f"Kelly should be positive & capped, got {kf}"

    def test_kelly_negative_ev(self):
        """Negative EV → Kelly = 0 (don't trade)."""
        kf = compute_kelly_fraction(win_rate_pct=40.0, avg_win_pct=1.0, avg_loss_pct=2.0)
        assert kf == 0.0, f"Negative EV → Kelly = 0, got {kf}"

    def test_kelly_zero_avg_win(self):
        """Zero avg_win → returns 0 (degenerate case)."""
        kf = compute_kelly_fraction(win_rate_pct=60.0, avg_win_pct=0.0, avg_loss_pct=1.0)
        assert kf == 0.0

    def test_kelly_zero_win_rate(self):
        """0% win rate → returns 0."""
        kf = compute_kelly_fraction(win_rate_pct=0.0, avg_win_pct=1.5, avg_loss_pct=1.0)
        assert kf == 0.0

    def test_kelly_100pct_win_rate(self):
        """100% win rate → degenerate, returns 0."""
        kf = compute_kelly_fraction(win_rate_pct=100.0, avg_win_pct=1.5, avg_loss_pct=1.0)
        assert kf == 0.0

    def test_kelly_capped_at_max_risk(self):
        """Kelly should never exceed MAX_RISK_PCT safety cap (typically 0.25)."""
        kf = compute_kelly_fraction(win_rate_pct=90.0, avg_win_pct=5.0, avg_loss_pct=0.5)
        assert kf <= 0.25, f"Kelly exceeds safety cap: {kf}"

    def test_kelly_50pct_equal_payoff_is_zero(self):
        """50% win + equal payoff → zero edge → Kelly = 0."""
        kf = compute_kelly_fraction(win_rate_pct=50.0, avg_win_pct=1.0, avg_loss_pct=1.0)
        assert kf == 0.0


# ── VaR / CVaR ────────────────────────────────────────────────────────────────
# Signature: compute_var_cvar(position_value, daily_vol_pct, capital) -> VaRResult

class TestVaRCVaR:
    def test_returns_varresult_type(self):
        """compute_var_cvar returns a VaRResult object."""
        result = compute_var_cvar(position_value=28_000, daily_vol_pct=0.015, capital=100_000)
        assert isinstance(result, VaRResult)

    def test_var_positive(self):
        """VaR should be a positive number (₹ at risk)."""
        r = compute_var_cvar(position_value=28_000, daily_vol_pct=0.015, capital=100_000)
        assert r.var_inr > 0, f"VaR should be positive, got {r.var_inr}"
        assert r.cvar_inr >= r.var_inr, f"CVaR >= VaR always"

    def test_var_scales_with_position(self):
        """Higher position value → higher VaR."""
        r1 = compute_var_cvar(position_value=28_000, daily_vol_pct=0.015, capital=100_000)
        r2 = compute_var_cvar(position_value=56_000, daily_vol_pct=0.015, capital=100_000)
        assert r2.var_inr > r1.var_inr, "VaR scales with position size"

    def test_var_scales_with_volatility(self):
        """Higher volatility → higher VaR."""
        r_low  = compute_var_cvar(position_value=28_000, daily_vol_pct=0.01,  capital=100_000)
        r_high = compute_var_cvar(position_value=28_000, daily_vol_pct=0.03,  capital=100_000)
        assert r_high.var_inr > r_low.var_inr

    def test_cvar_always_gte_var(self):
        """CVaR (Expected Shortfall) ≥ VaR for all inputs."""
        for vol in [0.01, 0.02, 0.03, 0.05]:
            r = compute_var_cvar(position_value=50_000, daily_vol_pct=vol, capital=200_000)
            assert r.cvar_inr >= r.var_inr, f"CVaR < VaR at vol={vol}"

    def test_var_at_zero_position(self):
        """Zero position → VaR = 0."""
        r = compute_var_cvar(position_value=0, daily_vol_pct=0.015, capital=100_000)
        assert r.var_inr == 0


# ── Position Sizing ───────────────────────────────────────────────────────────
# Signature: compute_position_size(capital, daily_target, price, atr_pct, ...) -> PositionSizeResult

class TestPositionSizing:
    def test_returns_position_size_result(self):
        r = compute_position_size(
            capital=100_000, daily_target=1000, price=2800.0, atr_pct=0.015
        )
        assert isinstance(r, PositionSizeResult)

    def test_basic_sizing_nonzero(self):
        """Standard inputs → at least 1 share."""
        r = compute_position_size(
            capital=100_000, daily_target=1000, price=2800.0, atr_pct=0.015
        )
        assert r.final_quantity >= 1, "Position size must be ≥ 1"
        assert r.final_position_inr > 0

    def test_conservative_less_than_aggressive(self):
        """Conservative tolerance → smaller position than aggressive."""
        r_cons = compute_position_size(
            capital=100_000, daily_target=1000, price=2800.0, atr_pct=0.015,
            risk_tolerance="conservative"
        )
        r_aggr = compute_position_size(
            capital=100_000, daily_target=1000, price=2800.0, atr_pct=0.015,
            risk_tolerance="aggressive"
        )
        assert r_cons.final_position_inr <= r_aggr.final_position_inr

    def test_zero_capital_returns_zero(self):
        """Zero capital → zero quantity."""
        r = compute_position_size(capital=0, daily_target=1000, price=2800, atr_pct=0.015)
        assert r.final_quantity == 0

    def test_zero_price_returns_zero(self):
        """Zero price → zero quantity."""
        r = compute_position_size(capital=100_000, daily_target=1000, price=0, atr_pct=0.015)
        assert r.final_quantity == 0

    def test_sl_and_tp_set(self):
        """SL and TP prices must be set and different from entry."""
        r = compute_position_size(
            capital=100_000, daily_target=1000, price=2800.0, atr_pct=0.015
        )
        assert r.sl_price > 0
        assert r.tp_price > 0
        assert r.sl_price != r.tp_price


# ── RiskPortfolioManager (RPM) Integration ────────────────────────────────────

class TestRPMIntegration:
    def _make_rpm(self, target=1000, capital=100_000, tolerance="moderate"):
        rp = RiskPortfolioManager()
        rp.update_settings(
            daily_target   = target,
            allocated_capital = capital,
            risk_tolerance = tolerance,
        )
        return rp

    def test_full_recalculate_returns_dict(self):
        rp = self._make_rpm()
        profile = rp.full_recalculate(trigger="test", current_pnl=0, trades_today=0)
        assert isinstance(profile, dict)
        # Key fields
        for key in ["kelly_fraction", "var_95_inr", "cvar_95_inr",
                    "feasibility_score", "feasibility_label",
                    "risk_budget_state", "required_daily_return_pct"]:
            assert key in profile, f"Missing key: {key}"

    def test_kelly_fraction_range(self):
        rp = self._make_rpm()
        profile = rp.full_recalculate(trigger="test", current_pnl=0, trades_today=0)
        assert 0 <= profile["kelly_fraction"] <= 1.0

    def test_feasibility_score_range(self):
        rp = self._make_rpm()
        profile = rp.full_recalculate(trigger="test", current_pnl=0, trades_today=0)
        assert 0 <= profile["feasibility_score"] <= 100

    def test_conservative_target_high_feasibility(self):
        """0.1% daily target → high feasibility score."""
        rp = self._make_rpm(target=200, capital=200_000, tolerance="conservative")
        profile = rp.full_recalculate(trigger="test", current_pnl=0, trades_today=0)
        req_pct = profile.get("required_daily_return_pct", 999)
        assert req_pct < 2.0, f"Conservative target needs <2% daily return, got {req_pct}%"

    def test_unrealistic_target_low_feasibility(self):
        """10% daily target → low feasibility score."""
        rp = self._make_rpm(target=5000, capital=50_000, tolerance="aggressive")
        profile = rp.full_recalculate(trigger="test", current_pnl=0, trades_today=0)
        req_pct = profile.get("required_daily_return_pct", 0)
        assert req_pct >= 5.0, f"Expected >=5% daily return required, got {req_pct}"

    def test_risk_budget_stops_on_large_loss(self):
        """After 2%+ daily loss, risk_budget_state = STOP."""
        rp = self._make_rpm(target=1000, capital=100_000)
        big_loss = -100_000 * 0.022   # -2.2% = -₹2200
        profile = rp.full_recalculate(trigger="test", current_pnl=big_loss, trades_today=5)
        assert profile.get("should_stop_trading") is True

    def test_var_95_positive(self):
        rp = self._make_rpm()
        profile = rp.full_recalculate(trigger="test", current_pnl=0, trades_today=0)
        assert profile.get("var_95_inr", 0) >= 0
        assert profile.get("cvar_95_inr", 0) >= profile.get("var_95_inr", 0)

    def test_portfolio_heat_range(self):
        rp = self._make_rpm()
        heat = rp.get_portfolio_heat()
        assert 0 <= heat <= 1.0, f"Portfolio heat out of range: {heat}"


# ── RPM Singleton ─────────────────────────────────────────────────────────────

class TestRPMSingleton:
    def test_singleton_exists(self):
        assert rpm is not None
        assert isinstance(rpm, RiskPortfolioManager)

    def test_update_settings_roundtrip(self):
        """Update settings and verify they're stored."""
        original_target = rpm.daily_target
        rpm.update_settings(daily_target=2500)
        assert rpm.daily_target == 2500
        # Restore
        rpm.update_settings(daily_target=original_target)



# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def prefs_moderate():
    return UserPreferences(
        daily_profit_target  = 1000,
        allocated_capital    = 100_000,
        ticker               = "RELIANCE.NS",
        risk_tolerance       = "moderate",
    )

@pytest.fixture
def prefs_aggressive():
    return UserPreferences(
        daily_profit_target  = 5000,
        allocated_capital    = 50_000,
        ticker               = "RELIANCE.NS",
        risk_tolerance       = "aggressive",
    )

@pytest.fixture
def prefs_conservative():
    return UserPreferences(
        daily_profit_target  = 200,
        allocated_capital    = 200_000,
        ticker               = "RELIANCE.NS",
        risk_tolerance       = "conservative",
    )


# ── Kelly Criterion ───────────────────────────────────────────────────────────

class TestKellyCriterion:
    def test_basic_kelly_positive(self):
        """Positive EV trade → positive Kelly fraction."""
        kf = compute_kelly_fraction(win_rate=0.55, avg_win=200, avg_loss=100)
        assert 0 < kf <= 1.0, f"Kelly should be positive, got {kf}"

    def test_kelly_negative_ev(self):
        """Negative EV → Kelly = 0 (don't trade)."""
        kf = compute_kelly_fraction(win_rate=0.40, avg_win=100, avg_loss=200)
        assert kf <= 0, f"Negative EV → Kelly <= 0, got {kf}"

    def test_kelly_zero_avg_win(self):
        """Zero avg_win → no division by zero, returns 0."""
        kf = compute_kelly_fraction(win_rate=0.6, avg_win=0, avg_loss=100)
        assert kf == 0.0

    def test_kelly_50pct_win_equal_payoff(self):
        """50% win + equal payoff → Kelly = 0."""
        kf = compute_kelly_fraction(win_rate=0.5, avg_win=100, avg_loss=100)
        assert abs(kf) < 0.01

    def test_kelly_capped(self):
        """Kelly should never exceed 25% (safety cap)."""
        kf = compute_kelly_fraction(win_rate=0.9, avg_win=1000, avg_loss=10)
        assert kf <= 0.25, f"Kelly exceeds safety cap: {kf}"

    def test_kelly_invalid_inputs(self):
        """Invalid win_rate raises or returns 0."""
        kf = compute_kelly_fraction(win_rate=1.5, avg_win=100, avg_loss=100)
        assert kf <= 0.25


# ── VaR / CVaR ────────────────────────────────────────────────────────────────

class TestVaRCVaR:
    def test_var_positive(self):
        """VaR should be a positive number (₹ at risk)."""
        var, cvar = compute_var_cvar(
            capital=100_000, daily_vol_pct=0.015, confidence=0.95
        )
        assert var > 0, f"VaR should be positive, got {var}"
        assert cvar >= var, f"CVaR >= VaR always, got cvar={cvar} var={var}"

    def test_var_scales_with_capital(self):
        """VaR scales linearly with capital."""
        var1, _ = compute_var_cvar(capital=100_000, daily_vol_pct=0.015)
        var2, _ = compute_var_cvar(capital=200_000, daily_vol_pct=0.015)
        assert abs(var2 / var1 - 2.0) < 0.05, "VaR should scale 2x with 2x capital"

    def test_var_scales_with_volatility(self):
        """Higher volatility → higher VaR."""
        var_low,  _ = compute_var_cvar(capital=100_000, daily_vol_pct=0.01)
        var_high, _ = compute_var_cvar(capital=100_000, daily_vol_pct=0.03)
        assert var_high > var_low

    def test_cvar_greater_than_var(self):
        """CVaR (Expected Shortfall) is always >= VaR."""
        for vol in [0.01, 0.02, 0.03, 0.05]:
            var, cvar = compute_var_cvar(capital=50_000, daily_vol_pct=vol)
            assert cvar >= var, f"CVaR < VaR at vol={vol}"


# ── Position Sizing ───────────────────────────────────────────────────────────

class TestPositionSizing:
    def test_basic_sizing(self):
        """Basic position size: risk_per_trade % of capital / ATR."""
        size = compute_position_size(
            capital     = 100_000,
            risk_pct    = 0.01,      # 1%
            entry_price = 2800.0,
            atr         = 42.0,      # 1.5% of entry
            multiplier  = 2.0,
        )
        assert size >= 1, "Position size must be at least 1 share"
        # Max loss should be ≈ 1% of capital = ₹1000
        max_loss = size * atr * multiplier
        assert max_loss <= 100_000 * 0.015, "Max loss exceeds 1.5% of capital"

    def test_minimum_size_one_share(self):
        """Very low capital + high price → at least 1 share."""
        size = compute_position_size(
            capital=5_000, risk_pct=0.01,
            entry_price=50_000, atr=500, multiplier=2.0
        )
        assert size >= 1

    def test_size_reduces_with_lower_capital(self):
        """Lower capital → smaller position."""
        sz1 = compute_position_size(capital=100_000, risk_pct=0.01, entry_price=2800, atr=42, multiplier=2.0)
        sz2 = compute_position_size(capital= 50_000, risk_pct=0.01, entry_price=2800, atr=42, multiplier=2.0)
        assert sz1 >= sz2


# ── Risk Portfolio Manager (RPM) Integration ─────────────────────────────────

class TestRPMIntegration:
    def test_full_recalculate_moderate(self, prefs_moderate):
        """Full RPM recalculation returns expected keys and valid ranges."""
        rp = RiskPortfolioManager()
        rp.update_settings(
            daily_target  = prefs_moderate.daily_profit_target,
            capital       = prefs_moderate.allocated_capital,
            risk_tolerance= prefs_moderate.risk_tolerance,
        )
        profile = rp.recalculate(
            current_pnl  = 0,
            trades_today = 0,
        )
        assert isinstance(profile, dict)
        # Key fields
        for key in ["kelly_fraction", "var_95_inr", "cvar_95_inr",
                    "feasibility_score", "feasibility_label",
                    "position_size_inr", "risk_budget_state",
                    "max_daily_loss_inr", "required_daily_return_pct"]:
            assert key in profile, f"Missing key: {key}"

        # Ranges
        assert 0 <= profile["kelly_fraction"] <= 1.0
        assert 0 <= profile["feasibility_score"] <= 100
        assert profile["var_95_inr"] > 0
        assert profile["cvar_95_inr"] >= profile["var_95_inr"]

    def test_feasibility_tier_easy(self, prefs_conservative):
        """Conservative 0.1% daily target → Achievable/Easily Achievable."""
        rp = RiskPortfolioManager()
        rp.update_settings(
            daily_target  = prefs_conservative.daily_profit_target,
            capital       = prefs_conservative.allocated_capital,
            risk_tolerance= prefs_conservative.risk_tolerance,
        )
        profile = rp.recalculate(current_pnl=0, trades_today=0)
        req_pct = profile.get("required_daily_return_pct", 999)
        assert req_pct < 2.0, f"Conservative target should need <2% daily return, got {req_pct}%"
        assert profile["feasibility_score"] >= 50

    def test_feasibility_tier_unrealistic(self, prefs_aggressive):
        """₹5000 target on ₹50k capital = 10% daily = Unrealistic."""
        rp = RiskPortfolioManager()
        rp.update_settings(
            daily_target  = prefs_aggressive.daily_profit_target,
            capital       = prefs_aggressive.allocated_capital,
            risk_tolerance= prefs_aggressive.risk_tolerance,
        )
        profile = rp.recalculate(current_pnl=0, trades_today=0)
        req_pct = profile.get("required_daily_return_pct", 0)
        # 5000 / 50000 = 10% daily
        assert req_pct >= 8.0, f"Expected >=8% daily return required, got {req_pct}"
        assert profile["feasibility_score"] < 30, "Unrealistic target should score <30"

    def test_risk_budget_stops_on_max_loss(self, prefs_moderate):
        """After hitting daily loss limit, risk_budget_state = STOP."""
        rp = RiskPortfolioManager()
        rp.update_settings(
            daily_target  = prefs_moderate.daily_profit_target,
            capital       = prefs_moderate.allocated_capital,
            risk_tolerance= prefs_moderate.risk_tolerance,
        )
        # Simulate -2% loss (hits circuit breaker)
        big_loss = -prefs_moderate.allocated_capital * 0.022
        profile = rp.recalculate(current_pnl=big_loss, trades_today=5)
        assert profile.get("risk_budget_state") == "STOP", \
            f"Expected STOP after big loss, got {profile.get('risk_budget_state')}"
        assert profile.get("should_stop_trading") is True

    def test_portfolio_heat_zero_at_start(self, prefs_moderate):
        """Portfolio heat = 0 when no positions open."""
        rp = RiskPortfolioManager()
        heat = rp.get_portfolio_heat()
        assert heat >= 0


# ── RPM Singleton ─────────────────────────────────────────────────────────────

class TestRPMSingleton:
    def test_singleton_exists(self):
        assert rpm is not None
        assert isinstance(rpm, RiskPortfolioManager)
