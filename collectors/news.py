from __future__ import annotations

import os
from typing import Any

import requests

BASE_URL = "https://newsdata.io/api/1/latest"
DEFAULT_TIMEOUT = 15


class NewsDataAPIError(Exception):
    pass


def _get_api_key(api_key: str | None) -> str:
    key = api_key or os.environ.get("NEWSDATA_API_KEY")
    if not key:
        raise NewsDataAPIError(
            "NewsData.io API key required. Set NEWSDATA_API_KEY env var or pass api_key."
        )
    return key


def get_crypto_headlines(
    limit: int = 10,
    query: str = "cryptocurrency",
    language: str = "en",
    api_key: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> list[dict[str, Any]]:
    key = _get_api_key(api_key)
    params = {
        "apikey": key,
        "q": query,
        "language": language,
    }

    try:
        response = requests.get(BASE_URL, params=params, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        if data.get("status") == "error":
            msg = data.get("message", "Unknown API error")
            raise NewsDataAPIError(f"NewsData.io API error: {msg}")

        results = data.get("results", [])
        headlines = []

        for item in results[:limit]:
            headlines.append({
                "article_id": item.get("article_id"),
                "title": item.get("title", ""),
                "link": item.get("link"),
                "source_name": item.get("source_name", ""),
                "description": item.get("description"),
                "pub_date": item.get("pubDate"),
                "creator": item.get("creator"),
            })

        return headlines

    except requests.HTTPError as e:
        try:
            err = e.response.json()
            msg = err.get("message", str(e))
        except Exception:
            msg = str(e)
        raise NewsDataAPIError(f"NewsData.io API error: {msg}") from e
    except requests.RequestException as e:
        raise NewsDataAPIError(f"Network error: {e}") from e


from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class NewsArticle:
    title: str
    source: str
    url: Optional[str]
    published_at: datetime
    summary: Optional[str] = None
    sentiment: Optional[str] = None


class NewsCollector:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def collect(self, symbol: str = "cryptocurrency", limit: int = 20) -> list[dict]:
        headlines = get_crypto_headlines(limit=limit, query="cryptocurrency", api_key=self.api_key)
        return [
            {
                "title": h.get("title", ""),
                "source": h.get("source_name", ""),
                "url": h.get("link"),
                "published_at": h.get("pub_date", ""),
                "summary": h.get("description"),
                "sentiment": None,
            }
            for h in headlines
        ]


if __name__ == "__main__":
    import json
    import sys

    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    try:
        headlines = get_crypto_headlines(limit=limit)
        print(json.dumps(headlines, indent=2))
    except NewsDataAPIError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
