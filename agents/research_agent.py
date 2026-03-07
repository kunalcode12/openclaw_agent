"""Orchestrating agent for the crypto trading research pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from collectors.market_data import MarketDataCollector
from collectors.on_chain import OnChainCollector
from collectors.news import NewsCollector
from analysis.technical import TechnicalAnalyzer, TechnicalIndicators
from research.report_generator import ReportGenerator, ResearchReport
from storage.repository import StorageRepository


@dataclass
class ResearchContext:
    """Context passed through the research pipeline."""

    symbol: str
    market_data: list[dict[str, Any]]
    on_chain_data: dict[str, Any]
    news_items: list[dict[str, Any]]
    technical_indicators: TechnicalIndicators | None
    report: ResearchReport | None


class ResearchAgent:
    """
    Main agent that orchestrates:
    - Data collection (market, on-chain, news)
    - Technical analysis
    - LLM report generation
    - Storage of results
    """

    def __init__(
        self,
        storage_path: str = "data",
        llm_model: str = "gpt-4",
        llm_api_key: str | None = None,
    ) -> None:
        self.market_collector = MarketDataCollector()
        self.on_chain_collector = OnChainCollector()
        self.news_collector = NewsCollector()
        self.analyzer = TechnicalAnalyzer()
        self.report_generator = ReportGenerator(model=llm_model, api_key=llm_api_key)
        self.storage = StorageRepository(base_path=storage_path)

    def run(self, symbol: str = "BTC") -> ResearchContext:
        """
        Execute the full research pipeline for a given symbol.

        Args:
            symbol: Crypto symbol (e.g. BTC, ETH)

        Returns:
            ResearchContext with all collected data and generated report
        """
        market_data = self.market_collector.collect(symbol)
        on_chain_data = self.on_chain_collector.collect(symbol)
        news_items = self.news_collector.collect(symbol)

        self.storage.save_market_data(symbol, market_data)
        self.storage.save_on_chain_data(symbol, on_chain_data)
        self.storage.save_news(symbol, news_items)

        technical_indicators = self.analyzer.analyze(market_data)

        market_summary = self._market_summary(market_data)
        tech_dict = self._indicators_to_dict(technical_indicators)

        report = self.report_generator.generate(
            market_data=market_summary,
            technical_indicators=tech_dict,
            on_chain_data=on_chain_data,
            news_items=news_items,
        )

        report_id = self.storage.save_report(
            symbol,
            {
                "summary": report.summary,
                "market_overview": report.market_overview,
                "technical_analysis": report.technical_analysis,
                "on_chain_insights": report.on_chain_insights,
                "news_sentiment": report.news_sentiment,
                "recommendations": report.recommendations,
            },
        )

        return ResearchContext(
            symbol=symbol,
            market_data=market_data,
            on_chain_data=on_chain_data,
            news_items=news_items,
            technical_indicators=technical_indicators,
            report=report,
        )

    def _market_summary(self, market_data: list[dict[str, Any]]) -> dict[str, Any]:
        """Extract a compact market summary from OHLCV."""
        if not market_data:
            return {}
        latest = market_data[-1]
        return {
            "close": latest.get("close"),
            "volume": latest.get("volume"),
            "high_24h": latest.get("high"),
            "low_24h": latest.get("low"),
            "candles_count": len(market_data),
        }

    def _indicators_to_dict(self, ti: TechnicalIndicators) -> dict[str, Any]:
        """Convert TechnicalIndicators to a serializable dict."""
        return {
            "rsi": ti.rsi,
            "macd": ti.macd,
            "macd_signal": ti.macd_signal,
            "macd_histogram": ti.macd_histogram,
            "moving_average_20": ti.moving_average_20,
            "moving_average_50": ti.moving_average_50,
            "bollinger_upper": ti.bollinger_upper,
            "bollinger_lower": ti.bollinger_lower,
            "volume_sma": ti.volume_sma,
        }
