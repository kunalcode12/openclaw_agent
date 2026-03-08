from __future__ import annotations

import json
import os
from typing import Any

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _get_api_key(api_key: str | None) -> str | None:
    return api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def synthesize_report(
    market_data: dict[str, Any],
    quant_signals: dict[str, Any],
    on_chain_analysis: dict[str, Any],
    news_sentiment: dict[str, Any],
    polymarket_research: dict[str, Any] | None = None,
    api_key: str | None = None,
    model: str = "gemini-2.5-flash",
) -> str:
    polymarket_research = polymarket_research or {}
    key = _get_api_key(api_key)
    if not key:
        return _fallback_report(
            market_data, quant_signals, on_chain_analysis, news_sentiment, polymarket_research
        )

    prompt = _build_prompt(
        market_data, quant_signals, on_chain_analysis, news_sentiment, polymarket_research
    )
    models_to_try = [
        model,
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
    ]
    models_to_try = list(dict.fromkeys(models_to_try))
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
        market_data, quant_signals, on_chain_analysis, news_sentiment, polymarket_research
    )


def _build_prompt(
    market_data: dict[str, Any],
    quant_signals: dict[str, Any],
    on_chain_analysis: dict[str, Any],
    news_sentiment: dict[str, Any],
    polymarket_research: dict[str, Any],
) -> str:
    sections = [
        "## Market Data",
        json.dumps(market_data, indent=2),
        "## Quant Signals (Technical)",
        json.dumps(quant_signals, indent=2),
        "## On-Chain Analysis",
        json.dumps(on_chain_analysis, indent=2),
        "## News Sentiment",
        json.dumps(news_sentiment, indent=2),
    ]
    if polymarket_research:
        sections.extend(
            [
                "## Polymarket Research",
                json.dumps(polymarket_research, indent=2),
            ]
        )

    report_sections = [
        "## Market Overview",
        "Summarize current market conditions, key price levels, and notable movements.",
        "## Technical Analysis",
        "Interpret the quant signals (RSI, EMA trend, etc.) and what they imply for price action.",
        "## On-Chain Analysis",
        "Summarize whale activity and on-chain metrics. What do large transfers suggest?",
        "## Sentiment Analysis",
        "Summarize news sentiment and how it aligns or conflicts with market/technical signals.",
    ]
    if polymarket_research:
        report_sections.extend(
            [
                "## Polymarket Opportunities",
                "Summarize top opportunities and arbitrage findings from Polymarket. Highlight mispriced markets or cross-market arbitrage if present.",
            ]
        )
    report_sections.extend(
        [
            "## Trade Thesis",
            "Provide a clear, actionable trade thesis: bullish, bearish, or neutral, with key levels and catalysts.",
        ]
    )

    data_block = "\n\n".join(sections)
    instructions = "\n\n".join(report_sections)

    return f"""You are a crypto trading research analyst. Generate a concise, actionable research report based on the following data.

{data_block}

---

Write a structured report with exactly these sections. Use clear headers (##) for each section. Be concise and data-driven.

{instructions}
"""


def _fallback_report(
    market_data: dict[str, Any],
    quant_signals: dict[str, Any],
    on_chain_analysis: dict[str, Any],
    news_sentiment: dict[str, Any],
    polymarket_research: dict[str, Any] | None = None,
) -> str:
    polymarket_research = polymarket_research or {}
    polymarket_block = ""
    if polymarket_research:
        polymarket_block = f"""
## Polymarket Research
{json.dumps(polymarket_research, indent=2)}
"""
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
{polymarket_block}
## Trade Thesis
[Configure GEMINI_API_KEY for AI-generated trade thesis]
"""


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()  # Load .env so GEMINI_API_KEY is available

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
