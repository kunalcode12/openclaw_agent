"""
Market agent - fetches and analyzes crypto prices from Binance.
"""

import sys
from pathlib import Path

# Add project root to path so imports work when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collectors.binance import get_price


def analyze_market() -> dict[str, str]:
    """
    Fetch current prices for BTC, ETH, and SOL from Binance.

    Returns:
        Dictionary with keys "BTC", "ETH", "SOL" and price strings as values.
    """
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
