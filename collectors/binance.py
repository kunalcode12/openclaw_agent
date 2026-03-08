import json
import sys
import warnings
from typing import Any

warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

import requests

BASE_URL = "https://api.binance.com/api/v3"
DEFAULT_TIMEOUT = 10


class BinanceAPIError(Exception):
    pass


def get_price(symbol: str, timeout: float = DEFAULT_TIMEOUT) -> dict[str, Any]:
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
