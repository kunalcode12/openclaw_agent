"""Collectors module - fetches market data, on-chain data, and news."""

from collectors.binance import get_klines, get_price, get_24h_stats
from collectors.helius import get_token_transfers, get_wallet_transactions
from collectors.market_data import MarketDataCollector, OHLCV
from collectors.news import NewsCollector, NewsArticle, get_crypto_headlines
from collectors.on_chain import OnChainCollector, OnChainMetrics

__all__ = [
    "MarketDataCollector",
    "OHLCV",
    "OnChainCollector",
    "OnChainMetrics",
    "NewsCollector",
    "NewsArticle",
    "get_price",
    "get_24h_stats",
    "get_klines",
    "get_crypto_headlines",
    "get_token_transfers",
    "get_wallet_transactions",
]
