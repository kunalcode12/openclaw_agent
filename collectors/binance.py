"""
Binance public API client for market data.

Fetches price and 24h statistics from Binance Spot API.
Base endpoint: https://api.binance.com
"""

import json
import sys
import warnings
from typing import Any

# Suppress urllib3/OpenSSL warning on macOS with LibreSSL (harmless)
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

import requests

BASE_URL = "https://api.binance.com/api/v3"
DEFAULT_TIMEOUT = 10  # Binance API timeout is 10 seconds


class BinanceAPIError(Exception):
    """Raised when Binance API returns an error."""

    pass


def get_price(symbol: str, timeout: float = DEFAULT_TIMEOUT) -> dict[str, Any]:
    """
    Fetch current price for a symbol.

    Args:
        symbol: Trading pair (e.g., "BTCUSDT", "ETHUSDT")
        timeout: Request timeout in seconds (default 10)

    Returns:
        JSON dict with keys: symbol, price

    Raises:
        BinanceAPIError: On API error or invalid response
        requests.RequestException: On network/timeout errors
    """
    url = f"{BASE_URL}/ticker/price"
    params = {"symbol": symbol.upper()}

    try:
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        if "code" in data and data["code"] != 0:
            raise BinanceAPIError(
                f"Binance API error {data.get('code', '')}: {data.get('msg', 'Unknown error')}"
            )

        return data

    except requests.Timeout:
        raise requests.RequestException(
            f"Request timed out after {timeout}s. Binance may be slow or unreachable."
        )
    except requests.HTTPError as e:
        try:
            err_body = e.response.json()
            msg = err_body.get("msg", str(e))
            code = err_body.get("code", "")
        except Exception:
            msg = str(e)
            code = ""
        raise BinanceAPIError(f"Binance API HTTP error {code}: {msg}")
    except requests.RequestException as e:
        raise requests.RequestException(f"Network error: {e}") from e
    except json.JSONDecodeError as e:
        raise BinanceAPIError(f"Invalid JSON response: {e}") from e


def get_24h_stats(symbol: str, timeout: float = DEFAULT_TIMEOUT) -> dict[str, Any]:
    """
    Fetch 24-hour rolling window price statistics for a symbol.

    Args:
        symbol: Trading pair (e.g., "BTCUSDT", "ETHUSDT")
        timeout: Request timeout in seconds (default 10)

    Returns:
        JSON dict with keys including: symbol, priceChange, priceChangePercent,
        weightedAvgPrice, lastPrice, openPrice, highPrice, lowPrice, volume,
        quoteVolume, openTime, closeTime, count

    Raises:
        BinanceAPIError: On API error or invalid response
        requests.RequestException: On network/timeout errors
    """
    url = f"{BASE_URL}/ticker/24hr"
    params = {"symbol": symbol.upper()}

    try:
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        if "code" in data and data["code"] != 0:
            raise BinanceAPIError(
                f"Binance API error {data.get('code', '')}: {data.get('msg', 'Unknown error')}"
            )

        return data

    except requests.Timeout:
        raise requests.RequestException(
            f"Request timed out after {timeout}s. Binance may be slow or unreachable."
        )
    except requests.HTTPError as e:
        try:
            err_body = e.response.json()
            msg = err_body.get("msg", str(e))
            code = err_body.get("code", "")
        except Exception:
            msg = str(e)
            code = ""
        raise BinanceAPIError(f"Binance API HTTP error {code}: {msg}")
    except requests.RequestException as e:
        raise requests.RequestException(f"Network error: {e}") from e
    except json.JSONDecodeError as e:
        raise BinanceAPIError(f"Invalid JSON response: {e}") from e


def get_klines(
    symbol: str,
    interval: str = "1d",
    limit: int = 100,
    timeout: float = DEFAULT_TIMEOUT,
) -> list[dict[str, Any]]:
    """
    Fetch historical OHLCV kline/candlestick data.

    Args:
        symbol: Trading pair (e.g., "BTCUSDT", "ETHUSDT")
        interval: Kline interval: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
        limit: Number of klines (default 100, max 1000)
        timeout: Request timeout in seconds

    Returns:
        List of dicts with keys: open_time, open, high, low, close, volume
    """
    url = f"{BASE_URL}/klines"
    params = {"symbol": symbol.upper(), "interval": interval, "limit": limit}

    try:
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        rows = response.json()

        return [
            {
                "open_time": row[0],
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            }
            for row in rows
        ]

    except requests.Timeout:
        raise requests.RequestException(
            f"Request timed out after {timeout}s. Binance may be slow or unreachable."
        )
    except requests.HTTPError as e:
        try:
            err_body = e.response.json()
            msg = err_body.get("msg", str(e))
            code = err_body.get("code", "")
        except Exception:
            msg = str(e)
            code = ""
        raise BinanceAPIError(f"Binance API HTTP error {code}: {msg}")
    except requests.RequestException as e:
        raise requests.RequestException(f"Network error: {e}") from e
    except (json.JSONDecodeError, IndexError, ValueError) as e:
        raise BinanceAPIError(f"Invalid response: {e}") from e


if __name__ == "__main__":
    symbol = sys.argv[1] if len(sys.argv) > 1 else "BTCUSDT"
    print(f"Price ({symbol}):", json.dumps(get_price(symbol), indent=2))
    print(f"\n24h stats ({symbol}):", json.dumps(get_24h_stats(symbol), indent=2))
