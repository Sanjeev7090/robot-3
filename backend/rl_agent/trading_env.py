"""
Custom Gymnasium Trading Environment for RL Agent.

Observation Space (38 features):
  OHLCV normalized (5) + Tech indicators (9) + Strategy weights (12) + Position state (9)
  + Regime / Equity-health / SL-distance (3)

Action Space (16-dim continuous Box[-1,1]):
  dims 0-11: strategy weight adjustments (softmaxed → top-K sparsity → prior blend)
  dim 12: trade signal (-1=full_short ... +1=full_long)
  dim 13: stop-loss ATR multiplier (mapped to [STOP_LOSS_MIN_ATR, STOP_LOSS_MAX_ATR])
  dim 14: take-profit ATR multiplier (mapped to [TAKE_PROFIT_MIN_ATR, TAKE_PROFIT_MAX_ATR])
  dim 15: risk-budget exposure (mapped to [EXPOSURE_MIN, EXPOSURE_MAX])
"""

import logging
from collections import deque
import gymnasium as gym
from gymnasium import spaces
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

STRATEGY_NAMES = [
    "Godzilla TTE", "SMC", "MiroFish", "Explosive Volume",
    "Falling Knife", "AI Indicator", "DEMON Confluence",
    "Golden Setup", "Reverse Swings", "AMDS-Hybrid",
    "PAC+S&O", "Narrative Swing",
]

# ======================== PRO-LEVEL REWARD CONFIG ========================
# Indian market realistic round-trip cost: brokerage + STT + exch + GST + slippage
# ~0.10-0.15% one-way; we use 0.12% per side (so reversal costs ~0.24%)
TRANSACTION_COST_PER_SIDE = 0.0012

# Risk-adjusted return weights
SHARPE_WEIGHT  = 0.05      # bounded via tanh
SORTINO_WEIGHT = 0.05      # bounded via tanh
RETURNS_WINDOW = 20        # rolling window for Sharpe/Sortino

# Drawdown penalty: kicks in HARD after 2%
DD_THRESHOLD       = 0.02
DD_PENALTY_FACTOR  = 12.0  # multiplier on nonlinear excess
DD_PENALTY_POWER   = 1.5   # convex penalty curve

# Loss aversion: losses hurt ~1.8x more than equivalent gains help
LOSS_AVERSION      = 1.8

# ATR-targeted volatility position sizing
ATR_TARGET_VOL     = 0.02  # we want positions sized to ~2% ATR baseline
BASE_EXPOSURE      = 0.20  # baseline exposure at target vol
EXPOSURE_MIN       = 0.05  # never lower than 5%
EXPOSURE_MAX       = 0.50  # never higher than 50% (risk cap)

# Holding & PnL scaling
TIME_DECAY         = 1e-4  # tiny per-step holding cost
PNL_REWARD_SCALE   = 100.0 # scale raw return into reward units
REWARD_CLIP        = 2.0

# ======================== STRATEGY & SPARSITY CONFIG =====================
# Manual priors — boost proven top performers, dim weak ones.
# Order MUST match STRATEGY_NAMES.
STRATEGY_PRIORS = np.array([
    0.07,  # Godzilla TTE
    0.07,  # SMC
    0.07,  # MiroFish
    0.13,  # Explosive Volume     ★ BOOSTED
    0.05,  # Falling Knife
    0.07,  # AI Indicator
    0.15,  # DEMON Confluence     ★ BOOSTED
    0.07,  # Golden Setup
    0.13,  # Reverse Swings       ★ BOOSTED
    0.07,  # AMDS-Hybrid
    0.07,  # PAC+S&O
    0.05,  # Narrative Swing
], dtype=np.float32)
STRATEGY_PRIORS = STRATEGY_PRIORS / STRATEGY_PRIORS.sum()  # safety re-norm

TOP_K_STRATEGIES   = 5      # only top-K get non-zero weight; rest zeroed
SPARSITY_BONUS     = 0.02   # small reward bonus when concentrated
PRIOR_BLEND        = 0.10   # 10% blend with priors at inference (soft bias)

# ============================= RISK CONFIG ===============================
# Action-controlled risk parameters (mapped from action dims 13-15)
STOP_LOSS_MIN_ATR  = 0.5
STOP_LOSS_MAX_ATR  = 5.0
TAKE_PROFIT_MIN_ATR = 1.0
TAKE_PROFIT_MAX_ATR = 8.0
TRAILING_STOP      = True   # ratchet SL toward favorable price

# Account-level circuit breaker
MAX_PORTFOLIO_DD       = 0.10   # 10% account drawdown → terminate episode
DD_CIRCUIT_PENALTY     = 2.0    # large negative reward when tripped

# Equity-health based size reduction (closer to peak = full size)
EQUITY_HEALTH_MIN      = 0.5    # never drop below 50% of vol-targeted size
EQUITY_HEALTH_MAX      = 1.0

# Stop / Target hit signals (in addition to PnL effect)
STOP_HIT_PENALTY       = -0.5   # penalty added to reward when SL triggered
TP_HIT_BONUS           = +0.3   # bonus added to reward when TP triggered
# =========================================================================


class TradingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, data=None, initial_capital: float = 100_000.0, ticker: str = "RELIANCE.NS"):
        super().__init__()
        self.initial_capital = initial_capital
        self.ticker = ticker
        self._raw_data = data  # pre-loaded DataFrame (optional)

        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(16,), dtype=np.float32)
        self.observation_space = spaces.Box(low=-10.0, high=10.0, shape=(38,), dtype=np.float32)

        # Episode state
        self.df: pd.DataFrame = None
        self._step = 0
        self._capital = initial_capital
        self._position = 0.0
        self._entry_price = 0.0
        self._days_held = 0
        self._peak_capital = initial_capital
        self._strategy_weights = np.ones(12, dtype=np.float32) / 12
        # Risk state (set every step)
        self._sl_mult = (STOP_LOSS_MIN_ATR + STOP_LOSS_MAX_ATR) / 2.0
        self._tp_mult = (TAKE_PROFIT_MIN_ATR + TAKE_PROFIT_MAX_ATR) / 2.0
        self._sl_distance_pct = 0.0
        self._regime = 0.0
        # Pro reward tracking
        self._returns_history: deque = deque(maxlen=RETURNS_WINDOW)
        self._trade_count = 0
        self._total_cost_paid = 0.0
        self._stop_hits = 0
        self._tp_hits = 0

    # ------------------------------------------------------------------
    # Data loading helpers
    # ------------------------------------------------------------------

    def _load_df(self) -> pd.DataFrame:
        if self._raw_data is not None:
            df = self._raw_data.copy()
        else:
            try:
                import yfinance as yf
                raw = yf.download(self.ticker, period="2y", interval="1d",
                                  progress=False, auto_adjust=True)
                if isinstance(raw.columns, pd.MultiIndex):
                    raw.columns = raw.columns.droplevel(1)
                df = raw[["Open", "High", "Low", "Close", "Volume"]].copy()
            except Exception as exc:
                logger.warning("yfinance failed for %s (%s) – using synthetic data", self.ticker, exc)
                df = self._synthetic_df()

        # Flatten MultiIndex if present
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        # Normalize column names
        df = df.rename(columns={c.lower(): c.capitalize() for c in df.columns})
        for col in ["Open", "High", "Low", "Close", "Volume"]:
            if col not in df.columns:
                df[col] = df.get("close", 1000.0)

        df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
        df = self._add_indicators(df)
        df = df.dropna().reset_index(drop=True)

        if len(df) < 50:
            df = self._synthetic_df()
        return df

    def _add_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        c = df["Close"]
        # RSI
        d = c.diff()
        gain = d.clip(lower=0).rolling(14).mean()
        loss = (-d.clip(upper=0)).rolling(14).mean()
        df["RSI"] = 100 - 100 / (1 + gain / (loss + 1e-8))
        # MACD
        df["MACD"] = c.ewm(span=12).mean() - c.ewm(span=26).mean()
        df["MACD_sig"] = df["MACD"].ewm(span=9).mean()
        # Bollinger Band %B
        r20 = c.rolling(20)
        df["BB_pct"] = (c - r20.mean()) / (2 * r20.std() + 1e-8)
        # ATR
        h, lo, cp = df["High"], df["Low"], c.shift(1)
        tr = pd.concat([h - lo, (h - cp).abs(), (lo - cp).abs()], axis=1).max(axis=1)
        df["ATR"] = tr.rolling(14).mean()
        # Trend
        df["EMA20"] = c.ewm(span=20).mean()
        df["SMA50"] = c.rolling(50).mean()
        return df

    def _synthetic_df(self) -> pd.DataFrame:
        np.random.seed(42)
        n = 500
        p = 1000 * np.cumprod(1 + np.random.normal(3e-4, 0.012, n))
        df = pd.DataFrame({
            "Open":   p * (1 + np.random.normal(0, 0.002, n)),
            "High":   p * (1 + np.abs(np.random.normal(0, 0.008, n))),
            "Low":    p * (1 - np.abs(np.random.normal(0, 0.008, n))),
            "Close":  p,
            "Volume": np.random.lognormal(14, 0.5, n),
        })
        return self._add_indicators(df).dropna().reset_index(drop=True)

    # ------------------------------------------------------------------
    # Observation
    # ------------------------------------------------------------------

    def _obs(self) -> np.ndarray:
        i = min(self._step, len(self.df) - 1)
        row = self.df.iloc[i]
        close = float(row["Close"])

        win = self.df["Close"].iloc[max(0, i - 20): i]
        mu  = float(win.mean()) if len(win) else close
        sig = float(win.std())  if len(win) > 1 else close * 0.01

        # OHLCV
        close_z = (close - mu) / (sig + 1e-8)
        open_z  = (float(row["Open"])  - close) / (close + 1e-8)
        high_z  = (float(row["High"])  - close) / (close + 1e-8)
        low_z   = (float(row["Low"])   - close) / (close + 1e-8)
        vol_z   = np.log1p(float(row["Volume"])) / 20.0

        # Technical
        rsi_z    = (float(row.get("RSI",    50))    - 50) / 50
        macd_z   =  float(row.get("MACD",    0))    / (close * 0.01 + 1e-8)
        macd_s_z =  float(row.get("MACD_sig",0))    / (close * 0.01 + 1e-8)
        bb_pct   =  float(row.get("BB_pct",  0))
        atr_z    =  float(row.get("ATR", close * 0.01)) / (close + 1e-8)
        ema20_z  = (float(row.get("EMA20", close)) - close) / (close + 1e-8)
        sma50_z  = (float(row.get("SMA50", close)) - close) / (close + 1e-8)

        # Momentum
        prev_close = float(self.df.iloc[max(0, i - 1)]["Close"])
        price_chg  = (close - prev_close) / (prev_close + 1e-8)
        mom5 = (close - float(self.df.iloc[max(0, i - 5)]["Close"])) / (float(self.df.iloc[max(0, i - 5)]["Close"]) + 1e-8) if i >= 5 else 0.0
        vol20 = float(win.std() / (mu + 1e-8)) if len(win) > 1 else 0.0

        # Position state
        unreal = 0.0
        if self._position != 0 and self._entry_price > 0:
            unreal = (close - self._entry_price) / (self._entry_price + 1e-8) * self._position

        total_ret = (self._capital - self.initial_capital) / self.initial_capital
        drawdown  = (self._peak_capital - self._capital) / max(self._peak_capital, 1e-8)

        obs = np.array([
            close_z, open_z, high_z, low_z, vol_z,           # 5
            rsi_z, macd_z, macd_s_z, bb_pct, atr_z,           # 5
            ema20_z, sma50_z, price_chg, vol20, mom5,          # 5  → 15
            *self._strategy_weights,                            # 12 → 27
            self._position,                                     # 1
            unreal,                                             # 1
            float(self._days_held) / 30.0,                     # 1
            total_ret,                                          # 1
            -drawdown,                                          # 1
            float(i) / max(len(self.df) - 1, 1),              # 1
            self._capital / self.initial_capital - 1,          # 1
            (1.0 if float(row.get("RSI", 50)) > 70 else -1.0  # 1 → 35
             if float(row.get("RSI", 50)) < 30 else 0.0),
            self._regime,                                       # 1 → 36 (market regime)
            self._capital / max(self._peak_capital, 1e-8),     # 1 → 37 (equity health)
            self._sl_distance_pct,                              # 1 → 38 (current SL distance %)
        ], dtype=np.float32)

        return np.clip(obs[:38], -10.0, 10.0)

    # ------------------------------------------------------------------
    # Gymnasium API
    # ------------------------------------------------------------------

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.df = self._load_df()
        start_max = max(20, len(self.df) // 3)
        self._step = 20 + int(self.np_random.integers(0, start_max))
        self._capital = self.initial_capital
        self._position = 0.0
        self._entry_price = 0.0
        self._days_held = 0
        self._peak_capital = self.initial_capital
        self._strategy_weights = np.ones(12, dtype=np.float32) / 12
        self._sl_mult = (STOP_LOSS_MIN_ATR + STOP_LOSS_MAX_ATR) / 2.0
        self._tp_mult = (TAKE_PROFIT_MIN_ATR + TAKE_PROFIT_MAX_ATR) / 2.0
        self._sl_distance_pct = 0.0
        self._regime = 0.0
        self._returns_history.clear()
        self._trade_count = 0
        self._total_cost_paid = 0.0
        self._stop_hits = 0
        self._tp_hits = 0
        return self._obs(), {}

    def step(self, action):
        # --- Phase 1: strategy weights (softmax → top-K sparsity → prior blend) ---
        raw_w = np.array(action[:12], dtype=np.float32)
        scaled = (raw_w + 1.0) / 2.0  # [0,1]
        exp_w = np.exp(scaled - scaled.max())
        sm_w = exp_w / exp_w.sum()

        # Top-K sparsity: zero out everything except top-K, then re-normalize.
        top_k_idx = np.argsort(sm_w)[::-1][:TOP_K_STRATEGIES]
        mask = np.zeros_like(sm_w)
        mask[top_k_idx] = 1.0
        sparse_w = sm_w * mask
        if sparse_w.sum() > 0:
            sparse_w = sparse_w / sparse_w.sum()
        else:
            sparse_w = STRATEGY_PRIORS.copy()

        # Soft prior blend (bias toward proven winners)
        blended = (1.0 - PRIOR_BLEND) * sparse_w + PRIOR_BLEND * STRATEGY_PRIORS
        self._strategy_weights = (blended / blended.sum()).astype(np.float32)

        # Sparsity bonus (concentrated allocations get small reward)
        active = int(np.sum(self._strategy_weights > 0.01))
        sparsity_bonus = SPARSITY_BONUS if active <= TOP_K_STRATEGIES else 0.0

        # --- Phase 2: read risk action dims ---
        sig = float(action[12])
        sl_action = float(action[13]) if len(action) > 13 else 0.0
        tp_action = float(action[14]) if len(action) > 14 else 0.0
        risk_action = float(action[15]) if len(action) > 15 else 0.0

        self._sl_mult = STOP_LOSS_MIN_ATR + (sl_action + 1.0) / 2.0 * (STOP_LOSS_MAX_ATR - STOP_LOSS_MIN_ATR)
        self._tp_mult = TAKE_PROFIT_MIN_ATR + (tp_action + 1.0) / 2.0 * (TAKE_PROFIT_MAX_ATR - TAKE_PROFIT_MIN_ATR)
        risk_budget = EXPOSURE_MIN + (risk_action + 1.0) / 2.0 * (EXPOSURE_MAX - EXPOSURE_MIN)

        # --- Phase 3: market context ---
        i = min(self._step, len(self.df) - 1)
        row = self.df.iloc[i]
        cur = float(row["Close"])
        nxt = float(self.df.iloc[min(i + 1, len(self.df) - 1)]["Close"])
        high = float(row["High"])
        low = float(row["Low"])
        atr = float(row.get("ATR", cur * 0.01))

        # Market regime (hierarchical context): trend strength via EMA20 vs SMA50
        ema20 = float(row.get("EMA20", cur))
        sma50 = float(row.get("SMA50", cur))
        trend_strength = (ema20 - sma50) / (sma50 + 1e-8)
        if trend_strength > 0.02:
            self._regime = 1.0   # uptrend
        elif trend_strength < -0.02:
            self._regime = -1.0  # downtrend
        else:
            self._regime = 0.0   # sideways

        # --- Phase 4: trade decision (regime-gated) ---
        prev_pos = self._position
        if sig > 0.3:
            new_pos = 1.0
        elif sig < -0.3:
            new_pos = -1.0
        else:
            new_pos = 0.0

        # Hierarchical RL: in strong counter-trend, dampen signal (don't fight the tape)
        if self._regime > 0 and new_pos < 0:
            new_pos = 0.0  # block shorts in uptrend
        elif self._regime < 0 and new_pos > 0:
            new_pos = 0.0  # block longs in downtrend

        # ===== ATR-BASED EXPOSURE (volatility targeted), capped by risk-budget action =====
        atr_pct = atr / (cur + 1e-8)
        vol_scale = ATR_TARGET_VOL / (atr_pct + 1e-8)
        vol_exposure = float(np.clip(BASE_EXPOSURE * vol_scale, EXPOSURE_MIN, EXPOSURE_MAX))
        # Final exposure is the MIN of vol-target and agent's risk-budget choice
        exposure = min(vol_exposure, risk_budget)

        # ===== EQUITY-HEALTH SCALING (closer to peak = full size; in drawdown = scaled down) =====
        equity_health = self._capital / max(self._peak_capital, 1e-8)
        health_factor = float(np.clip(equity_health, EQUITY_HEALTH_MIN, EQUITY_HEALTH_MAX))
        exposure = exposure * health_factor
        exposure = float(np.clip(exposure, EXPOSURE_MIN, EXPOSURE_MAX))

        # ===== DYNAMIC STOP-LOSS / TAKE-PROFIT (intra-bar trigger) =====
        stop_hit = False
        tp_hit = False
        forced_close_price = None
        if prev_pos != 0 and self._entry_price > 0:
            sl_abs = self._sl_mult * atr
            tp_abs = self._tp_mult * atr
            if prev_pos > 0:  # long
                sl_price = self._entry_price - sl_abs
                tp_price = self._entry_price + tp_abs
                if low <= sl_price:
                    stop_hit = True
                    forced_close_price = sl_price
                elif high >= tp_price:
                    tp_hit = True
                    forced_close_price = tp_price
            else:  # short
                sl_price = self._entry_price + sl_abs
                tp_price = self._entry_price - tp_abs
                if high >= sl_price:
                    stop_hit = True
                    forced_close_price = sl_price
                elif low <= tp_price:
                    tp_hit = True
                    forced_close_price = tp_price

        # ===== TRANSACTION COSTS =====
        # If stop/TP triggered, force close → counts as turnover
        effective_new_pos = new_pos
        if stop_hit or tp_hit:
            effective_new_pos = 0.0  # close position
            self._stop_hits += int(stop_hit)
            self._tp_hits += int(tp_hit)

        turnover = abs(effective_new_pos - prev_pos)
        trade_cost = turnover * TRANSACTION_COST_PER_SIDE * exposure
        if turnover > 0:
            self._trade_count += 1
            self._total_cost_paid += trade_cost

        # ===== STEP RETURN =====
        if stop_hit or tp_hit:
            # Realised PnL at the trigger price, not next-bar close
            price_ret = (forced_close_price - cur) / (cur + 1e-8)
        else:
            price_ret = (nxt - cur) / (cur + 1e-8)

        gross_step_ret = price_ret * prev_pos * exposure
        net_step_ret = gross_step_ret - trade_cost
        self._capital *= 1.0 + net_step_ret
        self._returns_history.append(net_step_ret)

        # Update peak & drawdown
        self._peak_capital = max(self._peak_capital, self._capital)
        drawdown = (self._peak_capital - self._capital) / max(self._peak_capital, 1e-8)

        # Update position state
        if effective_new_pos != prev_pos:
            self._entry_price = cur if effective_new_pos != 0 else 0.0
            self._days_held = 0
        else:
            self._days_held += 1
        self._position = effective_new_pos

        # Update SL distance % (for next obs)
        if self._position != 0 and self._entry_price > 0:
            self._sl_distance_pct = (self._sl_mult * atr) / (self._entry_price + 1e-8)
        else:
            self._sl_distance_pct = 0.0

        # ===== ASYMMETRIC PnL (loss aversion) =====
        if net_step_ret >= 0:
            pnl_term = net_step_ret
        else:
            pnl_term = net_step_ret * LOSS_AVERSION

        # ===== ROLLING SHARPE & SORTINO =====
        sharpe = sortino = 0.0
        if len(self._returns_history) >= 5:
            arr = np.array(self._returns_history, dtype=np.float64)
            mean_r = arr.mean()
            std_r = arr.std() + 1e-8
            sharpe = (mean_r / std_r) * np.sqrt(252)
            neg = arr[arr < 0]
            if len(neg) > 0:
                down_std = neg.std() + 1e-8
                sortino = (mean_r / down_std) * np.sqrt(252)
            else:
                sortino = sharpe

        # ===== HEAVY DRAWDOWN PENALTY (kicks in after 2%) =====
        if drawdown > DD_THRESHOLD:
            excess = drawdown - DD_THRESHOLD
            dd_penalty = (excess ** DD_PENALTY_POWER) * DD_PENALTY_FACTOR
        else:
            dd_penalty = 0.0

        # ===== ACCOUNT-LEVEL DD CIRCUIT BREAKER =====
        circuit_tripped = drawdown > MAX_PORTFOLIO_DD

        # ===== STOP/TP HIT ADJUSTMENTS =====
        risk_event_reward = 0.0
        if stop_hit:
            risk_event_reward += STOP_HIT_PENALTY
        if tp_hit:
            risk_event_reward += TP_HIT_BONUS

        # ===== FINAL REWARD =====
        reward = (
            pnl_term * PNL_REWARD_SCALE
            + SHARPE_WEIGHT * float(np.tanh(sharpe))
            + SORTINO_WEIGHT * float(np.tanh(sortino))
            - dd_penalty
            - TIME_DECAY
            + sparsity_bonus
            + risk_event_reward
        )
        if circuit_tripped:
            reward -= DD_CIRCUIT_PENALTY

        reward = float(np.clip(reward, -REWARD_CLIP, REWARD_CLIP))

        self._step += 1
        terminated = (self._step >= len(self.df) - 1) or circuit_tripped
        truncated = self._capital < self.initial_capital * 0.5

        info = {
            "step": self._step,
            "price": cur,
            "position": self._position,
            "exposure": exposure,
            "risk_budget": risk_budget,
            "vol_exposure": vol_exposure,
            "equity_health": equity_health,
            "regime": self._regime,
            "sl_mult": self._sl_mult,
            "tp_mult": self._tp_mult,
            "stop_hit": stop_hit,
            "tp_hit": tp_hit,
            "stop_hits_total": self._stop_hits,
            "tp_hits_total": self._tp_hits,
            "circuit_tripped": circuit_tripped,
            "capital": self._capital,
            "total_return": (self._capital - self.initial_capital) / self.initial_capital,
            "drawdown": drawdown,
            "atr_pct": atr_pct,
            "gross_step_ret": gross_step_ret,
            "net_step_ret": net_step_ret,
            "trade_cost": trade_cost,
            "trade_count": self._trade_count,
            "total_cost_paid": self._total_cost_paid,
            "sharpe": float(sharpe),
            "sortino": float(sortino),
            "dd_penalty": float(dd_penalty),
            "pnl_term": float(pnl_term),
            "sparsity_bonus": sparsity_bonus,
            "active_strategies": active,
            "reward": reward,
            "strategy_weights": self._strategy_weights.tolist(),
            "trade_signal": sig,
        }
        return self._obs(), reward, terminated, truncated, info

    def render(self):
        pass
