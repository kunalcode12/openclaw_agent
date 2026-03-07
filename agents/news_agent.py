"""
News agent - fetches crypto headlines and classifies overall sentiment.

Uses NewsData.io for headlines and keyword-based sentiment classification.
Outputs bullish, bearish, or neutral.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

# Add project root to path so imports work when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collectors.news import get_crypto_headlines

# Sentiment keywords (case-insensitive)
BULLISH_KEYWORDS = [
    "surge", "rally", "gain", "gains", "bullish", "soar", "soaring", "jump", "jumped",
    "rise", "rising", "breakout", "break out", "all-time high", "ath", "recovery",
    "adoption", "institutional", "etf", "approval", "upgrade", "optimistic",
    "growth", "record high", "milestone", "breakthrough",
]

BEARISH_KEYWORDS = [
    "crash", "plunge", "drop", "fall", "bearish", "decline", "collapse", "dump",
    "sell-off", "selloff", "correction", "fear", "risk", "warning", "ban",
    "crackdown", "regulation", "lawsuit", "hack", "exploit", "scam", "fraud",
    "recession", "bankruptcy", "liquidation",
]


def _classify_headline_sentiment(title: str, description: str | None) -> str:
    """
    Classify a single headline as bullish, bearish, or neutral.

    Args:
        title: Headline title
        description: Optional article description

    Returns:
        "bullish", "bearish", or "neutral"
    """
    text = f"{title} {description or ''}".lower()
    text = re.sub(r"[^\w\s]", " ", text)
    words = set(text.split())

    bullish_count = sum(1 for kw in BULLISH_KEYWORDS if kw in text or kw in words)
    bearish_count = sum(1 for kw in BEARISH_KEYWORDS if kw in text or kw in words)

    if bullish_count > bearish_count:
        return "bullish"
    if bearish_count > bullish_count:
        return "bearish"
    return "neutral"


def get_news_sentiment(
    limit: int = 10,
    query: str = "cryptocurrency",
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Fetch crypto headlines and classify overall sentiment.

    Args:
        limit: Number of headlines to fetch (default 10)
        query: Search query for news (default "cryptocurrency")
        api_key: NewsData.io API key (default: NEWSDATA_API_KEY env var)

    Returns:
        Dict with keys:
        - sentiment: "bullish", "bearish", or "neutral"
        - bullish_count: Number of bullish headlines
        - bearish_count: Number of bearish headlines
        - neutral_count: Number of neutral headlines
        - headlines: List of headlines with per-article sentiment
    """
    headlines = get_crypto_headlines(limit=limit, query=query, api_key=api_key)

    classified = []
    bullish_count = 0
    bearish_count = 0
    neutral_count = 0

    for h in headlines:
        sentiment = _classify_headline_sentiment(h.get("title", ""), h.get("description"))
        classified.append({
            "title": h.get("title", ""),
            "source": h.get("source_name", ""),
            "sentiment": sentiment,
        })
        if sentiment == "bullish":
            bullish_count += 1
        elif sentiment == "bearish":
            bearish_count += 1
        else:
            neutral_count += 1

    # Overall sentiment: majority wins, else neutral
    if bullish_count > bearish_count and bullish_count > neutral_count:
        overall = "bullish"
    elif bearish_count > bullish_count and bearish_count > neutral_count:
        overall = "bearish"
    else:
        overall = "neutral"

    return {
        "sentiment": overall,
        "bullish_count": bullish_count,
        "bearish_count": bearish_count,
        "neutral_count": neutral_count,
        "headlines": classified,
    }


if __name__ == "__main__":
    import json
    import os

    api_key = os.environ.get("NEWSDATA_API_KEY")
    try:
        result = get_news_sentiment(limit=10, api_key=api_key)
        print("News sentiment:")
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
