from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class OHLCV:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketDataCollector:
    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None):
        self.api_key = api_key
        self.api_secret = api_secret

    def get_ohlcv(
        self,
        symbol: str,
        interval: str = "1d",
        limit: int = 100,
    ) -> list[OHLCV]:
        raise NotImplementedError("Connect to exchange API")

    def get_current_price(self, symbol: str) -> float:
        raise NotImplementedError("Connect to exchange API")

    def collect(self, symbol: str, limit: int = 100) -> list[dict]:
        try:
            candles = self.get_ohlcv(symbol, interval="1d", limit=limit)
            return [
                {
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                }
                for c in candles
            ]
        except NotImplementedError:
            return self._demo_ohlcv(symbol, limit)

    def _demo_ohlcv(self, symbol: str, limit: int) -> list[dict]:
        import random
        from datetime import datetime, timedelta

        base = 40000 if "BTC" in symbol.upper() else 2000
        data = []
        now = datetime.utcnow()
        price = base
        for i in range(limit):
            change = random.uniform(-0.02, 0.02)
            o, c = price, price * (1 + change)
            h, l = max(o, c) * 1.01, min(o, c) * 0.99
            vol = random.uniform(1e9, 5e9)
            data.append({"open": o, "high": h, "low": l, "close": c, "volume": vol})
            price = c
            now -= timedelta(days=1)
        return list(reversed(data))
