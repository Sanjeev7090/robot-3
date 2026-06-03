"""
RL Trainer — manages PPO/SAC training in background threads.
Supports Historical, Live, and Hybrid training modes.
"""

import glob
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

import numpy as np

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

STRATEGY_NAMES = [
    "Godzilla TTE", "SMC", "MiroFish", "Explosive Volume",
    "Falling Knife", "AI Indicator", "DEMON Confluence",
    "Golden Setup", "Reverse Swings", "AMDS-Hybrid",
    "PAC+S&O", "Narrative Swing",
]

_DEFAULT_WEIGHTS = [round(1 / 12, 4)] * 12

# ---------------------------------------------------------------------------
# Shared in-memory state (thread-safe via lock)
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_state: Dict = {
    "status":          "idle",      # idle | training | paused | running
    "algorithm":       "PPO",
    "mode":            "historical",
    "ticker":          "RELIANCE.NS",
    "episode":         0,
    "total_episodes":  0,
    "timesteps_done":  0,
    "timesteps_total": 50000,
    "current_reward":  0.0,
    "best_reward":     -1e9,
    "avg_reward_10":   0.0,
    "episode_rewards": [],          # last 200 episode rewards
    "last_weights":    _DEFAULT_WEIGHTS,
    "last_trade_signal": 0.0,
    "total_return":    0.0,
    "current_drawdown": 0.0,
    "started_at":      None,
    "last_updated":    None,
    "error":           None,
    "model_saved":     False,
}

_stop_evt   = threading.Event()
_train_thread: threading.Thread = None


def _upd(**kw):
    with _lock:
        _state.update(kw)
        _state["last_updated"] = datetime.now(timezone.utc).isoformat()


def get_state() -> Dict:
    with _lock:
        return dict(_state)


# ---------------------------------------------------------------------------
# Background training worker
# ---------------------------------------------------------------------------

def _train_worker(algorithm: str, mode: str, ticker: str, timesteps: int):
    _stop_evt.clear()
    try:
        from stable_baselines3 import PPO, SAC
        from stable_baselines3.common.callbacks import BaseCallback
        from .trading_env import TradingEnv

        _upd(status="training", algorithm=algorithm, mode=mode, ticker=ticker,
             timesteps_total=timesteps, timesteps_done=0, episode=0,
             episode_rewards=[], error=None,
             started_at=datetime.now(timezone.utc).isoformat())

        # ---- load historical data ----
        df_hist = None
        if mode in ("historical", "hybrid"):
            try:
                import yfinance as yf
                import pandas as pd
                raw = yf.download(ticker, period="2y", interval="1d",
                                  progress=False, auto_adjust=True)
                if isinstance(raw.columns, pd.MultiIndex):
                    raw.columns = raw.columns.droplevel(1)
                df_hist = raw[["Open", "High", "Low", "Close", "Volume"]].dropna()
                if len(df_hist) < 60:
                    df_hist = None
            except Exception as exc:
                logger.warning("History load failed: %s", exc)

        env = TradingEnv(data=df_hist, ticker=ticker)
        slug = f"{algorithm.lower()}_{ticker.replace('.', '_')}"
        model_path = str(MODELS_DIR / slug)
        zip_path   = model_path + ".zip"

        # ---- create / load model ----
        kwargs_ppo = dict(
            learning_rate=3e-4, n_steps=1024, batch_size=64,
            n_epochs=5, gamma=0.99, gae_lambda=0.95, clip_range=0.2,
            verbose=0, policy_kwargs={"net_arch": [64, 64]},
        )
        kwargs_sac = dict(
            learning_rate=3e-4, buffer_size=30_000, batch_size=256,
            tau=0.005, gamma=0.99, train_freq=1, gradient_steps=1,
            verbose=0, policy_kwargs={"net_arch": [256, 256]},
        )

        if mode == "live" and os.path.exists(zip_path):
            try:
                model = (PPO if algorithm == "PPO" else SAC).load(model_path, env=env)
            except (ValueError, RuntimeError, AssertionError) as exc:
                # Shape mismatch (e.g., upgraded action/obs space) → delete & start fresh.
                logger.warning("Old model incompatible (%s) — starting fresh", exc)
                try:
                    os.remove(zip_path)
                except OSError:
                    pass
                model = (PPO(**{**{"policy": "MlpPolicy", "env": env}, **kwargs_ppo})
                         if algorithm == "PPO" else
                         SAC(**{**{"policy": "MlpPolicy", "env": env}, **kwargs_sac}))
        else:
            model = (PPO(**{**{"policy": "MlpPolicy", "env": env}, **kwargs_ppo})
                     if algorithm == "PPO" else
                     SAC(**{**{"policy": "MlpPolicy", "env": env}, **kwargs_sac}))

        # ---- training callback ----
        class _CB(BaseCallback):
            def __init__(self):
                super().__init__()
                self._ep_rew = []
                self._cur_rew = 0.0

            def _on_step(self) -> bool:
                if _stop_evt.is_set():
                    return False

                r_arr  = self.locals.get("rewards",  [0.0])
                done   = self.locals.get("dones",    [False])
                infos  = self.locals.get("infos",    [{}])

                rew  = float(r_arr[0])  if r_arr  else 0.0
                done = bool(done[0])    if done   else False
                info = infos[0]         if infos  else {}

                self._cur_rew += rew

                if done:
                    self._ep_rew.append(self._cur_rew)
                    avg10 = float(np.mean(self._ep_rew[-10:])) if self._ep_rew else 0.0
                    best  = max(_state["best_reward"], self._cur_rew)

                    weights = info.get("strategy_weights", _DEFAULT_WEIGHTS)
                    trade_s = info.get("trade_signal",     0.0)
                    tot_ret = info.get("total_return",     0.0)
                    drawdn  = info.get("drawdown",         0.0)

                    _upd(
                        episode=len(self._ep_rew),
                        timesteps_done=self.num_timesteps,
                        current_reward=self._cur_rew,
                        best_reward=best,
                        avg_reward_10=avg10,
                        episode_rewards=self._ep_rew[-200:],
                        last_weights=weights,
                        last_trade_signal=trade_s,
                        total_return=tot_ret,
                        current_drawdown=drawdn,
                    )
                    self._cur_rew = 0.0
                return True

        model.learn(total_timesteps=timesteps, callback=_CB(),
                    reset_num_timesteps=(mode != "live"))

        if not _stop_evt.is_set():
            model.save(model_path)
            _upd(status="running", model_saved=True)

            # --- Hybrid: continue with live fine-tuning ---
            if mode == "hybrid":
                _upd(mode="live", status="training")
                env2 = TradingEnv(ticker=ticker)  # fresh data
                model.set_env(env2)
                model.learn(total_timesteps=max(5000, timesteps // 5), callback=_CB(),
                            reset_num_timesteps=False)
                if not _stop_evt.is_set():
                    model.save(model_path)
                    _upd(status="running")
        else:
            _upd(status="paused")

    except Exception as exc:
        logger.exception("RL training error")
        _upd(status="idle", error=str(exc))


# ---------------------------------------------------------------------------
# Live continuous learning loop (runs after initial training in "live" mode)
# ---------------------------------------------------------------------------

def _live_loop(algorithm: str, ticker: str):
    """Periodically re-trains the model with fresh market data."""
    while not _stop_evt.is_set():
        time.sleep(300)  # every 5 minutes refresh
        if _stop_evt.is_set():
            break
        if _state["status"] != "running":
            continue
        try:
            from stable_baselines3 import PPO, SAC
            from .trading_env import TradingEnv
            slug       = f"{algorithm.lower()}_{ticker.replace('.', '_')}"
            model_path = str(MODELS_DIR / slug)
            zip_path   = model_path + ".zip"
            if not os.path.exists(zip_path):
                continue
            env   = TradingEnv(ticker=ticker)
            try:
                model = (PPO if algorithm == "PPO" else SAC).load(model_path, env=env)
            except (ValueError, RuntimeError, AssertionError) as exc:
                logger.warning("Live-loop: incompatible saved model (%s) — removing", exc)
                try:
                    os.remove(zip_path)
                except OSError:
                    pass
                continue
            model.learn(total_timesteps=1000, reset_num_timesteps=False)
            model.save(model_path)
            _upd(status="running", timesteps_done=_state["timesteps_done"] + 1000)
        except Exception as exc:
            logger.debug("Live loop iteration error: %s", exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_training(algorithm: str, mode: str, ticker: str, timesteps: int = 50_000) -> Dict:
    global _train_thread
    if _state["status"] == "training":
        return {"success": False, "error": "Training already in progress"}

    _stop_evt.clear()
    _train_thread = threading.Thread(
        target=_train_worker,
        args=(algorithm, mode, ticker, timesteps),
        daemon=True,
        name="rl-trainer",
    )
    _train_thread.start()

    # Also start live loop if mode is live
    if mode == "live":
        threading.Thread(
            target=_live_loop, args=(algorithm, ticker), daemon=True, name="rl-live-loop"
        ).start()

    return {"success": True, "message": f"{algorithm} training started ({mode}) for {ticker}"}


def stop_training() -> Dict:
    _stop_evt.set()
    _upd(status="paused")
    return {"success": True, "message": "Training stopped"}


def reset_agent() -> Dict:
    _stop_evt.set()
    for f in glob.glob(str(MODELS_DIR / "*.zip")):
        try:
            os.remove(f)
        except OSError:
            pass
    with _lock:
        _state.update({
            "status": "idle", "episode": 0, "timesteps_done": 0,
            "episode_rewards": [], "last_weights": _DEFAULT_WEIGHTS,
            "total_return": 0.0, "best_reward": -1e9, "avg_reward_10": 0.0,
            "error": None, "model_saved": False, "current_reward": 0.0,
        })
    return {"success": True}


def rebalance(ticker: str) -> Dict:
    """
    Run fresh RL model inference → return optimally rebalanced weights + confidence score.
    Confidence = weight concentration: (1 - normalised_entropy) × 100
    """
    s = get_state()
    algorithm = s.get("algorithm", "PPO")

    if s["status"] not in ("running", "paused"):
        return {
            "success": False,
            "error": "Train the agent first before rebalancing",
            "weights": _DEFAULT_WEIGHTS,
            "confidence": 0,
            "changes": [],
        }

    # Find the saved model (try requested ticker, fall back to training ticker)
    def _zip(t):
        return MODELS_DIR / f"{algorithm.lower()}_{t.replace('.', '_')}.zip"

    zip_path = _zip(ticker)
    if not zip_path.exists():
        zip_path = _zip(s.get("ticker", "RELIANCE.NS"))
    if not zip_path.exists():
        return {
            "success": False,
            "error": "Saved model not found. Complete at least one training run.",
            "weights": _DEFAULT_WEIGHTS,
            "confidence": 0,
            "changes": [],
        }

    try:
        from stable_baselines3 import PPO, SAC
        from .trading_env import TradingEnv

        env   = TradingEnv(ticker=ticker)
        try:
            model = (PPO if algorithm == "PPO" else SAC).load(str(zip_path)[:-4], env=env)
        except (ValueError, RuntimeError, AssertionError) as exc:
            logger.warning("Rebalance: incompatible saved model (%s) — removing", exc)
            try:
                os.remove(str(zip_path))
            except OSError:
                pass
            return {
                "success": False,
                "error": "Saved model was incompatible with upgraded env — please retrain.",
                "weights": _DEFAULT_WEIGHTS,
                "confidence": 0,
                "changes": [],
            }

        obs, _ = env.reset()
        action, _ = model.predict(obs, deterministic=True)

        # Strategy weights via softmax
        raw_w   = np.array(action[:12], dtype=np.float32)
        scaled  = (raw_w + 1.0) / 2.0
        exp_w   = np.exp(scaled - scaled.max())
        new_w   = (exp_w / exp_w.sum()).tolist()

        trade_sig = float(action[12])

        # Confidence = 1 − normalised_entropy  (0 = uniform, 1 = fully concentrated)
        w_arr   = np.array(new_w)
        H       = -float(np.sum(w_arr * np.log(w_arr + 1e-9)))
        max_H   = float(np.log(len(new_w)))
        confidence = max(0, min(100, int(round((1.0 - H / max_H) * 100))))

        # Delta vs previous weights
        old_w = s.get("last_weights", _DEFAULT_WEIGHTS)
        changes = [
            {
                "strategy": name,
                "old":   round(old_w[i] * 100, 1),
                "new":   round(new_w[i] * 100, 1),
                "delta": round((new_w[i] - old_w[i]) * 100, 1),
            }
            for i, name in enumerate(STRATEGY_NAMES)
        ]

        # Signal from trade dimension
        if trade_sig > 0.3:
            signal      = "BUY"
            sig_conf    = min(int((trade_sig - 0.3) / 0.7 * 100), 100)
        elif trade_sig < -0.3:
            signal      = "SELL"
            sig_conf    = min(int((-trade_sig - 0.3) / 0.7 * 100), 100)
        else:
            signal      = "HOLD"
            sig_conf    = int((0.3 - abs(trade_sig)) / 0.3 * 100)

        # Persist new weights to shared state
        _upd(last_weights=new_w, last_trade_signal=trade_sig)

        return {
            "success":          True,
            "ticker":           ticker,
            "weights":          new_w,
            "weights_named":    dict(zip(STRATEGY_NAMES, [round(w * 100, 1) for w in new_w])),
            "confidence":       confidence,
            "signal":           signal,
            "signal_confidence": sig_conf,
            "changes":          changes,
            "timestamp":        datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.exception("Rebalance error")
        return {
            "success": False,
            "error":   str(exc),
            "weights": _DEFAULT_WEIGHTS,
            "confidence": 0,
            "changes": [],
        }


def get_prediction(ticker: str) -> Dict:
    s = get_state()
    weights   = s.get("last_weights",      _DEFAULT_WEIGHTS)
    trade_sig = s.get("last_trade_signal", 0.0)

    if s["status"] not in ("running", "paused", "training"):
        return {
            "signal":           "HOLD",
            "confidence":       0,
            "strategy_weights": dict(zip(STRATEGY_NAMES, [round(w * 100, 1) for w in _DEFAULT_WEIGHTS])),
            "weights_raw":      _DEFAULT_WEIGHTS,
            "message":          "Agent not trained yet — start training first",
        }

    if trade_sig > 0.3:
        signal     = "BUY"
        confidence = min(int((trade_sig - 0.3) / 0.7 * 100), 100)
    elif trade_sig < -0.3:
        signal     = "SELL"
        confidence = min(int((-trade_sig - 0.3) / 0.7 * 100), 100)
    else:
        signal     = "HOLD"
        confidence = int((0.3 - abs(trade_sig)) / 0.3 * 100)

    return {
        "signal":           signal,
        "confidence":       confidence,
        "strategy_weights": dict(zip(STRATEGY_NAMES, [round(w * 100, 1) for w in weights])),
        "weights_raw":      list(weights),
        "total_return":     s.get("total_return",     0.0),
        "episode":          s.get("episode",          0),
        "avg_reward_10":    s.get("avg_reward_10",    0.0),
        "message":          f"Ep {s['episode']} | AvgRew: {s['avg_reward_10']:.4f}",
    }
