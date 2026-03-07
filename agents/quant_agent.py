"""
Quant agent - loads historical data, computes indicators, and detects market conditions.

Uses Binance for price data and analysis/indicators for RSI and EMA.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add project root to path so imports work when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd

from analysis.indicators import calculate_ema, calculate_rsi
from collectors.binance import get_klines


def _derive_signal(rsi: float, trend: str) -> str:
    """
    Derive a trading signal from RSI and trend.

    Args:
        rsi: RSI value (0-100)
        trend: "bullish" or "bearish"

    Returns:
        Human-readable signal string
    """
    if rsi >= 70:
        return "overbought"
    if rsi <= 30:
        return "oversold"
    if trend == "bullish" and 50 < rsi < 70:
        return "possible breakout"
    if trend == "bearish" and 30 < rsi < 50:
        return "possible breakdown"
    if trend == "bullish":
        return "uptrend"
    return "downtrend"


def analyze_market(
    symbol: str = "BTCUSDT",
    interval: str = "1d",
    limit: int = 100,
    rsi_period: int = 14,
    ema_period: int = 20,
) -> dict[str, str | int]:
    """
    Load historical price data, compute RSI and EMA, and detect bullish/bearish conditions.

    Args:
        symbol: Trading pair (e.g., "BTCUSDT")
        interval: Kline interval (default "1d")
        limit: Number of candles to fetch (default 100)
        rsi_period: RSI lookback period (default 14)
        ema_period: EMA window for trend (default 20)

    Returns:
        Dict with keys: trend, rsi, signal
        Example: {"trend": "bullish", "rsi": 62, "signal": "possible breakout"}
    """
    # Load historical OHLC data from Binance
    ohlc = get_klines(symbol=symbol, interval=interval, limit=limit)

    if len(ohlc) < max(rsi_period, ema_period) + 1:
        return {
            "trend": "neutral",
            "rsi": 50,
            "signal": "insufficient data",
        }

    df = pd.DataFrame(ohlc)

    # Compute RSI and EMA
    rsi_series = calculate_rsi(df, period=rsi_period)
    ema_series = calculate_ema(df, period=ema_period)

    # Use latest values
    last_close = df["close"].iloc[-1]
    last_ema = ema_series.iloc[-1]
    last_rsi = rsi_series.iloc[-1]

    # Handle NaN (e.g., not enough data for indicator)
    if pd.isna(last_rsi):
        last_rsi = 50.0
    if pd.isna(last_ema):
        last_ema = last_close

    # Determine trend: price above EMA = bullish, below = bearish
    trend = "bullish" if last_close >= last_ema else "bearish"
    rsi_int = int(round(last_rsi))
    signal = _derive_signal(last_rsi, trend)

    return {
        "trend": trend,
        "rsi": rsi_int,
        "signal": signal,
    }


if __name__ == "__main__":
    import json

    symbol = sys.argv[1] if len(sys.argv) > 1 else "BTCUSDT"
    result = analyze_market(symbol=symbol)
    print(json.dumps(result, indent=2))
