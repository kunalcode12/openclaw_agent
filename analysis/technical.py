from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TechnicalIndicators:
    rsi: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    macd_histogram: float | None = None
    moving_average_20: float | None = None
    moving_average_50: float | None = None
    bollinger_upper: float | None = None
    bollinger_lower: float | None = None
    volume_sma: float | None = None
    raw: dict[str, Any] | None = None


class TechnicalAnalyzer:
    def __init__(self, period_rsi: int = 14, period_ma: int = 20) -> None:
        self.period_rsi = period_rsi
        self.period_ma = period_ma

    def analyze(self, ohlcv: list[dict[str, float]]) -> TechnicalIndicators:
        if not ohlcv:
            return TechnicalIndicators()

        closes = [c["close"] for c in ohlcv]
        volumes = [c.get("volume", 0) for c in ohlcv]

        rsi = self._compute_rsi(closes) if len(closes) >= self.period_rsi + 1 else None
        ma_20 = self._sma(closes, 20) if len(closes) >= 20 else None
        ma_50 = self._sma(closes, 50) if len(closes) >= 50 else None
        macd, signal, hist = self._compute_macd(closes)
        bb_upper, bb_lower = self._bollinger_bands(closes)
        vol_sma = self._sma(volumes, 20) if len(volumes) >= 20 else None

        return TechnicalIndicators(
            rsi=rsi,
            macd=macd,
            macd_signal=signal,
            macd_histogram=hist,
            moving_average_20=ma_20,
            moving_average_50=ma_50,
            bollinger_upper=bb_upper,
            bollinger_lower=bb_lower,
            volume_sma=vol_sma,
        )

    def _sma(self, data: list[float], period: int) -> float | None:
        if len(data) < period:
            return None
        return sum(data[-period:]) / period

    def _compute_rsi(self, closes: list[float]) -> float | None:
        if len(closes) < self.period_rsi + 1:
            return None
        gains, losses = [], []
        for i in range(1, len(closes)):
            diff = closes[i] - closes[i - 1]
            gains.append(diff if diff > 0 else 0)
            losses.append(-diff if diff < 0 else 0)
        avg_gain = sum(gains[-self.period_rsi :]) / self.period_rsi
        avg_loss = sum(losses[-self.period_rsi :]) / self.period_rsi
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def _compute_macd(
        self, closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9
    ) -> tuple[float | None, float | None, float | None]:
        if len(closes) < slow:
            return None, None, None
        ema_fast = self._ema(closes, fast)
        ema_slow = self._ema(closes, slow)
        if ema_fast is None or ema_slow is None:
            return None, None, None
        macd_line = ema_fast - ema_slow
        macd_series = [macd_line]
        signal_line = self._ema(macd_series, signal) if len(macd_series) >= signal else macd_line
        hist = macd_line - signal_line if signal_line else None
        return macd_line, signal_line, hist

    def _ema(self, data: list[float], period: int) -> float | None:
        if len(data) < period:
            return None
        k = 2 / (period + 1)
        ema = sum(data[:period]) / period
        for price in data[period:]:
            ema = (price - ema) * k + ema
        return ema

    def _bollinger_bands(
        self, closes: list[float], period: int = 20, std_dev: float = 2.0
    ) -> tuple[float | None, float | None]:
        if len(closes) < period:
            return None, None
        sma = sum(closes[-period:]) / period
        variance = sum((c - sma) ** 2 for c in closes[-period:]) / period
        std = variance**0.5
        return sma + std_dev * std, sma - std_dev * std
