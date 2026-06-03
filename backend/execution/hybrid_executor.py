import time
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Optional
import logging

import yfinance as yf

logger = logging.getLogger(__name__)


class HybridVWAP_TWAP_Executor:
    """
    Hybrid Execution: VWAP (Price Targeting) + TWAP (Time Slicing)
    Best for large orders to minimize market impact.
    """

    def __init__(self, groww_service):
        self.groww = groww_service
        self.logger = logger

    def get_historical_data(self, symbol: str, period: str = "5d", interval: str = "5m"):
        """Fetch real-time + historical data"""
        try:
            ticker = yf.Ticker(symbol + ".NS")
            df = ticker.history(period=period, interval=interval)
            return df
        except Exception as e:
            self.logger.error(f"Data fetch error for {symbol}: {e}")
            return pd.DataFrame()

    def calculate_vwap(self, df: pd.DataFrame) -> float:
        """Calculate VWAP"""
        if df.empty:
            return None
        df = df.copy()
        df['Typical_Price'] = (df['High'] + df['Low'] + df['Close']) / 3
        df['TPV'] = df['Typical_Price'] * df['Volume']
        vwap = df['TPV'].cumsum() / df['Volume'].cumsum()
        return vwap.iloc[-1]

    def execute_hybrid_order(
        self,
        symbol: str,
        quantity: int,
        side: str,           # "BUY" or "SELL"
        duration_minutes: int = 30,
        max_slices: int = 12,
        risk_percent: float = 0.5,
    ) -> Dict:
        """Main Hybrid Execution Function"""
        if quantity <= 0:
            return {"status": "error", "message": "Invalid quantity"}

        start_time = datetime.now()
        end_time   = start_time + timedelta(minutes=duration_minutes)

        slice_size    = max(quantity // max_slices, 1)
        remaining_qty = quantity
        executed_qty  = 0
        execution_log = []

        self.logger.info(
            f"Starting Hybrid VWAP+TWAP for {symbol} | Qty: {quantity} | Side: {side}"
        )

        while datetime.now() < end_time and remaining_qty > 0:
            try:
                df = self.get_historical_data(symbol, period="1d", interval="5m")

                if df.empty:
                    time.sleep(10)
                    continue

                current_price = df['Close'].iloc[-1]
                current_vwap  = self.calculate_vwap(df)

                if not current_vwap:
                    current_vwap = current_price

                deviation    = np.random.uniform(-0.3, 0.3)
                target_price = round(current_vwap * (1 + deviation / 100), 2)

                current_slice = min(slice_size, remaining_qty)

                order_result = self.groww.place_order(
                    symbol=symbol,
                    quantity=current_slice,
                    side=side,
                    order_type="LIMIT",
                    price=target_price,
                )

                executed_qty  += current_slice
                remaining_qty -= current_slice

                execution_log.append({
                    "timestamp":  datetime.now().isoformat(),
                    "slice_qty":  current_slice,
                    "price":      target_price,
                    "vwap":       round(current_vwap, 2),
                    "status":     order_result.get("status", "submitted"),
                })

                self.logger.info(
                    f"Slice executed: {current_slice} @ {target_price} | Remaining: {remaining_qty}"
                )

                sleep_time = (duration_minutes * 60) / max_slices
                time.sleep(sleep_time)

            except Exception as e:
                self.logger.error(f"Execution error: {e}")
                time.sleep(15)

        completion_percent = (executed_qty / quantity) * 100
        result = {
            "status":             "completed" if remaining_qty == 0 else "partial",
            "symbol":             symbol,
            "side":               side,
            "total_quantity":     quantity,
            "executed_quantity":  executed_qty,
            "completion":         f"{completion_percent:.1f}%",
            "avg_price":          round(
                sum(log['price'] * log['slice_qty'] for log in execution_log) / executed_qty, 2
            ) if execution_log else 0,
            "execution_log":      execution_log,
            "duration":           str(datetime.now() - start_time),
        }

        self.logger.info(f"Hybrid Execution Finished: {result['status']}")
        return result


def create_hybrid_executor(groww_service):
    return HybridVWAP_TWAP_Executor(groww_service)
