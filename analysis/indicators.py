from __future__ import annotations

from typing import Any

import pandas as pd

from ta.momentum import RSIIndicator
from ta.trend import EMAIndicator, MACD


def _to_dataframe(data: pd.DataFrame | list[dict[str, Any]] | dict[str, list]) -> pd.DataFrame:
    if isinstance(data, pd.DataFrame):
        df = data.copy()
    elif isinstance(data, list) and data and isinstance(data[0], dict):
        df = pd.DataFrame(data)
    elif isinstance(data, dict):
        df = pd.DataFrame(data)
    else:
        raise TypeError("data must be a DataFrame, list of dicts, or dict of lists")
    df.columns = [c.lower() for c in df.columns]
    if "close" not in df.columns:
        raise ValueError("OHLC data must include a 'close' column")
    return df


def calculate_rsi(
    data: pd.DataFrame | list[dict[str, Any]] | dict[str, list],
    period: int = 14,
) -> pd.Series:
    df = _to_dataframe(data)
    close = df["close"]
    indicator = RSIIndicator(close=close, window=period)
    return indicator.rsi()


def calculate_ema(
    data: pd.DataFrame | list[dict[str, Any]] | dict[str, list],
    period: int = 20,
) -> pd.Series:
    df = _to_dataframe(data)
    close = df["close"]
    indicator = EMAIndicator(close=close, window=period)
    return indicator.ema_indicator()


def calculate_macd(
    data: pd.DataFrame | list[dict[str, Any]] | dict[str, list],
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9,
) -> pd.DataFrame:
    df = _to_dataframe(data)
    close = df["close"]
    indicator = MACD(
        close=close,
        window_slow=slow_period,
        window_fast=fast_period,
        window_sign=signal_period,
    )
    return pd.DataFrame(
        {
            "macd_line": indicator.macd(),
            "macd_signal": indicator.macd_signal(),
            "macd_histogram": indicator.macd_diff(),
        }
    )


if __name__ == "__main__":
    import numpy as np

    np.random.seed(42)
    n = 100
    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    sample = pd.DataFrame(
        {
            "open": close - 0.5,
            "high": close + np.abs(np.random.randn(n)),
            "low": close - np.abs(np.random.randn(n)),
            "close": close,
        }
    )

    print("Sample OHLC (last 5 rows):")
    print(sample.tail())
    print()

    rsi = calculate_rsi(sample)
    print(f"RSI (last 5):\n{rsi.tail()}")
    print()

    ema = calculate_ema(sample, period=20)
    print(f"EMA(20) (last 5):\n{ema.tail()}")
    print()

    macd = calculate_macd(sample)
    print("MACD (last 5):")
    print(macd.tail())
