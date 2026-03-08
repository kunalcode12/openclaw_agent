from __future__ import annotations

import os
from typing import Any

import requests

BASE_URL = "https://api.helius.xyz"
DEFAULT_TIMEOUT = 15
SOL_MINT = "So11111111111111111111111111111111111111112"


class HeliusAPIError(Exception):
    pass


def _get_api_key(api_key: str | None) -> str:
    key = api_key or os.environ.get("HELIUS_API_KEY")
    if not key:
        raise HeliusAPIError(
            "Helius API key required. Set HELIUS_API_KEY env var or pass api_key."
        )
    return key


def get_wallet_transactions(
    wallet: str,
    limit: int = 50,
    api_key: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    key = _get_api_key(api_key)
    url = f"{BASE_URL}/v0/addresses/{wallet}/transactions"
    params = {"api-key": key, "limit": limit}

    try:
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        if isinstance(data, list):
            return {"transactions": data, "pagination": {"hasMore": False}}
        if isinstance(data, dict):
            return data
        return {"transactions": [], "pagination": {"hasMore": False}}

    except requests.HTTPError as e:
        try:
            err = e.response.json()
            msg = err.get("error", err.get("message", str(e)))
        except Exception:
            msg = str(e)
        raise HeliusAPIError(f"Helius API error: {msg}") from e
    except requests.RequestException as e:
        raise HeliusAPIError(f"Network error: {e}") from e


def get_token_transfers(
    wallet: str,
    limit: int = 50,
    cursor: str | None = None,
    api_key: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    key = _get_api_key(api_key)
    url = f"{BASE_URL}/v1/wallet/{wallet}/transfers"
    params = {"api-key": key, "limit": min(max(limit, 1), 100)}
    if cursor:
        params["cursor"] = cursor

    try:
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        if "data" not in data:
            return {"data": data if isinstance(data, list) else [], "pagination": {}}
        return data

    except requests.HTTPError as e:
        try:
            err = e.response.json()
            msg = err.get("error", err.get("message", str(e)))
        except Exception:
            msg = str(e)
        raise HeliusAPIError(f"Helius API error: {msg}") from e
    except requests.RequestException as e:
        raise HeliusAPIError(f"Network error: {e}") from e


if __name__ == "__main__":
    import json
    import sys

    wallet = sys.argv[1] if len(sys.argv) > 1 else "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"
    try:
        print("Token transfers:")
        print(json.dumps(get_token_transfers(wallet, limit=5), indent=2))
    except HeliusAPIError as e:
        print(f"Error: {e}")
