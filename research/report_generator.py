"""LLM-powered research report generation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ResearchReport:
    """Generated research report with sections."""

    summary: str
    market_overview: str
    technical_analysis: str
    on_chain_insights: str
    news_sentiment: str
    recommendations: str
    raw: dict[str, Any] | None = None


class ReportGenerator:
    """
    Generates a structured research report using an LLM.
    Aggregates market data, technical analysis, on-chain data, and news.
    """

    def __init__(self, model: str = "gpt-4", api_key: str | None = None) -> None:
        self.model = model
        self.api_key = api_key

    def generate(
        self,
        market_data: dict[str, Any],
        technical_indicators: dict[str, Any],
        on_chain_data: dict[str, Any],
        news_items: list[dict[str, Any]],
    ) -> ResearchReport:
        """
        Generate a research report from aggregated data.

        Args:
            market_data: Current prices, volume, etc.
            technical_indicators: RSI, MACD, MAs, etc.
            on_chain_data: Wallet activity, flows, metrics
            news_items: Aggregated news with sentiment

        Returns:
            ResearchReport with structured sections
        """
        prompt = self._build_prompt(
            market_data, technical_indicators, on_chain_data, news_items
        )
        content = self._call_llm(prompt)
        return self._parse_report(content)

    def _build_prompt(
        self,
        market_data: dict[str, Any],
        technical_indicators: dict[str, Any],
        on_chain_data: dict[str, Any],
        news_items: list[dict[str, Any]],
    ) -> str:
        """Build the LLM prompt from aggregated data."""
        return f"""
Generate a crypto trading research report based on the following data.

## Market Data
{market_data}

## Technical Indicators
{technical_indicators}

## On-Chain Data
{on_chain_data}

## News Summary
{news_items}

Provide a structured report with:
1. Executive Summary
2. Market Overview
3. Technical Analysis Insights
4. On-Chain Insights
5. News & Sentiment
6. Recommendations
"""

    def _call_llm(self, prompt: str) -> str:
        """
        Call the LLM API. Override or extend for actual API integration.
        Falls back to template report when API is unavailable or unconfigured.
        """
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.api_key)
            response = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content or ""
        except (ImportError, Exception):
            return self._fallback_report(prompt)

    def _fallback_report(self, _prompt: str) -> str:
        """Fallback when OpenAI is not available."""
        return """
# Crypto Trading Research Report

## Executive Summary
[Configure OpenAI API key to generate dynamic reports]

## Market Overview
[Requires LLM integration]

## Technical Analysis Insights
[Requires LLM integration]

## On-Chain Insights
[Requires LLM integration]

## News & Sentiment
[Requires LLM integration]

## Recommendations
[Requires LLM integration]
"""

    def _parse_report(self, content: str) -> ResearchReport:
        """Parse LLM output into structured ResearchReport."""
        sections = {
            "summary": "",
            "market_overview": "",
            "technical_analysis": "",
            "on_chain_insights": "",
            "news_sentiment": "",
            "recommendations": "",
        }
        current = "summary"
        for line in content.split("\n"):
            line_lower = line.lower()
            if "executive summary" in line_lower or "summary" in line_lower:
                current = "summary"
            elif "market overview" in line_lower:
                current = "market_overview"
            elif "technical" in line_lower:
                current = "technical_analysis"
            elif "on-chain" in line_lower or "on chain" in line_lower:
                current = "on_chain_insights"
            elif "news" in line_lower or "sentiment" in line_lower:
                current = "news_sentiment"
            elif "recommendation" in line_lower:
                current = "recommendations"
            elif line.strip() and not line.strip().startswith("#"):
                sections[current] = sections[current] + line + "\n"

        return ResearchReport(
            summary=sections["summary"].strip() or content[:500],
            market_overview=sections["market_overview"].strip(),
            technical_analysis=sections["technical_analysis"].strip(),
            on_chain_insights=sections["on_chain_insights"].strip(),
            news_sentiment=sections["news_sentiment"].strip(),
            recommendations=sections["recommendations"].strip(),
            raw={"raw_content": content},
        )
