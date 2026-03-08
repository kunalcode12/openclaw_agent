import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collectors.binance import get_price


def analyze_market() -> dict[str, str]:
    symbols = [
        ("BTC", "BTCUSDT"),
        ("ETH", "ETHUSDT"),
        ("SOL", "SOLUSDT"),
    ]

    prices: dict[str, str] = {}
    for name, pair in symbols:
        data = get_price(pair)
        prices[name] = data["price"]

    return prices


if __name__ == "__main__":
    result = analyze_market()
    print("Market prices (USDT):")
    for symbol, price in result.items():
        print(f"  {symbol}: {price}")
