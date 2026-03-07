"""
Research synthesizer using Google Gemini API.

Combines market data, quant signals, on-chain analysis, and news sentiment
into a structured crypto trading research report.
"""

from __future__ import annotations

import json
import os
from typing import Any

# Load .env early so GEMINI_API_KEY is available when module is imported
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _get_api_key(api_key: str | None) -> str | None:
    """Resolve API key from parameter or environment."""
    return api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def synthesize_report(
    market_data: dict[str, Any],
    quant_signals: dict[str, Any],
    on_chain_analysis: dict[str, Any],
    news_sentiment: dict[str, Any],
    api_key: str | None = None,
    model: str = "gemini-2.5-flash",
) -> str:
    """
    Generate a crypto research report using Google Gemini.

    Args:
        market_data: Prices, volume, 24h stats (e.g., from Binance)
        quant_signals: RSI, EMA trend, signals (e.g., from quant_agent)
        on_chain_analysis: Whale activity, transfers (e.g., from onchain_agent)
        news_sentiment: Headlines, sentiment (e.g., from news_agent)
        api_key: Gemini API key (default: GEMINI_API_KEY or GOOGLE_API_KEY env var)
        model: Gemini model name (default gemini-2.0-flash)

    Returns:
        Full research report as text with sections:
        - Market Overview
        - Technical Analysis
        - On-chain Analysis
        - Sentiment Analysis
        - Trade Thesis
    """
    key = _get_api_key(api_key)
    if not key:
        return _fallback_report(market_data, quant_signals, on_chain_analysis, news_sentiment)

    prompt = _build_prompt(market_data, quant_signals, on_chain_analysis, news_sentiment)

    # Try models in order (free tier: gemini-2.5-flash, gemini-2.0-flash)
    models_to_try = [
        model,
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
    ]
    models_to_try = list(dict.fromkeys(models_to_try))  # dedupe, keep order

    for m in models_to_try:
        try:
            from google import genai

            os.environ["GEMINI_API_KEY"] = key
            client = genai.Client()
            response = client.models.generate_content(
                model=m,
                contents=prompt,
            )
            text = response.text
            if text and text.strip():
                return text
        except Exception as e:
            import sys
            print(f"Gemini ({m}) failed: {e}", file=sys.stderr)
            continue

    return _fallback_report(
        market_data, quant_signals, on_chain_analysis, news_sentiment
    )


def _build_prompt(
    market_data: dict[str, Any],
    quant_signals: dict[str, Any],
    on_chain_analysis: dict[str, Any],
    news_sentiment: dict[str, Any],
) -> str:
    """Build the Gemini prompt from aggregated inputs."""
    return f"""You are a crypto trading research analyst. Generate a concise, actionable research report based on the following data.

## Market Data
{json.dumps(market_data, indent=2)}

## Quant Signals (Technical)
{json.dumps(quant_signals, indent=2)}

## On-Chain Analysis
{json.dumps(on_chain_analysis, indent=2)}

## News Sentiment
{json.dumps(news_sentiment, indent=2)}

---

Write a structured report with exactly these sections. Use clear headers (##) for each section. Be concise and data-driven.

## Market Overview
Summarize current market conditions, key price levels, and notable movements.

## Technical Analysis
Interpret the quant signals (RSI, EMA trend, etc.) and what they imply for price action.

## On-Chain Analysis
Summarize whale activity and on-chain metrics. What do large transfers suggest?

## Sentiment Analysis
Summarize news sentiment and how it aligns or conflicts with market/technical signals.

## Trade Thesis
Provide a clear, actionable trade thesis: bullish, bearish, or neutral, with key levels and catalysts.
"""


def _fallback_report(
    market_data: dict[str, Any],
    quant_signals: dict[str, Any],
    on_chain_analysis: dict[str, Any],
    news_sentiment: dict[str, Any],
) -> str:
    """Template report when Gemini API is unavailable."""
    return f"""# Crypto Trading Research Report

*Set GEMINI_API_KEY to generate dynamic reports with Google Gemini.*

---

## Market Overview
{json.dumps(market_data, indent=2)}

## Technical Analysis
{json.dumps(quant_signals, indent=2)}

## On-Chain Analysis
{json.dumps(on_chain_analysis, indent=2)}

## Sentiment Analysis
{json.dumps(news_sentiment, indent=2)}

## Trade Thesis
[Configure GEMINI_API_KEY for AI-generated trade thesis]
"""


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()  # Load .env so GEMINI_API_KEY is available

    # Example usage with sample data
    sample_market = {"BTC": "67850", "ETH": "1978", "SOL": "83.70"}
    sample_quant = {"trend": "bullish", "rsi": 62, "signal": "possible breakout"}
    sample_onchain = {"whale_in": 2, "whale_out": 1, "total_whale_in": 500}
    sample_news = {"sentiment": "bullish", "bullish_count": 7, "bearish_count": 1}

    report = synthesize_report(
        market_data=sample_market,
        quant_signals=sample_quant,
        on_chain_analysis=sample_onchain,
        news_sentiment=sample_news,
    )
    print(report)
