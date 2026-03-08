import asyncio
import logging
from typing import Any

import numpy as np

from skills.trade_research.polymarket_client import fetch_all_markets
from skills.trade_research.market_clusterer import cluster_markets
from skills.trade_research.opportunity_detector import detect_opportunities, Opportunity
from skills.trade_research.arbitrage_detector import detect_arbitrage, ArbitrageOpportunity

logger = logging.getLogger(__name__)


def _rank_opportunities(opportunities: list[Opportunity], top_n: int = 10) -> list[dict]:
    sorted_opps = sorted(
        opportunities,
        key=lambda o: o.score_component,
        reverse=True,
    )
    top = sorted_opps[:top_n]
    return [
        {
            "rank": i + 1,
            "market_id": o.market_id,
            "question": o.question,
            "yes_price": o.yes_price,
            "no_price": o.no_price,
            "liquidity": o.liquidity,
            "volume": o.volume,
            "reason": o.reason,
            "score": round(o.score_component, 4),
        }
        for i, o in enumerate(top)
    ]


def _serialize_arbitrage(arbs: list[ArbitrageOpportunity]) -> list[dict]:
    return [
        {
            "type": a.arb_type,
            "market_ids": a.market_ids,
            "questions": a.questions,
            "total_probability": round(a.total_probability, 3),
            "profit_potential_pct": round(a.profit_potential, 2),
            "details": a.details,
        }
        for a in arbs
    ]


def _serialize_mispriced(mispriced: list[dict]) -> list[dict]:
    return [
        {
            "market_id": m["market_id"],
            "question": m["question"],
            "yes_price": m["yes_price"],
            "cluster_mean_yes": m.get("cluster_mean_yes"),
            "mispricing": round(m["mispricing"], 3),
        }
        for m in mispriced
    ]


async def run_analysis(
    max_markets: int = 500,
    top_opportunities_n: int = 10,
) -> dict[str, Any]:
    logger.info("Starting Polymarket analysis...")
    markets = await fetch_all_markets(max_markets=max_markets, closed=False)
    if not markets:
        return {
            "top_opportunities": [],
            "arbitrage": [],
            "mispriced_markets": [],
        }
    clusters = cluster_markets(markets, similarity_threshold=0.75, min_cluster_size=2)
    opportunities, mispriced = detect_opportunities(markets, clusters)
    arbs = detect_arbitrage(markets, clusters)
    top_opps = _rank_opportunities(opportunities, top_n=top_opportunities_n)
    if not top_opps and markets:
        logger.info("No opportunities from clustering—showing top markets by activity.")
        sorted_by_activity = sorted(
            markets,
            key=lambda m: np.log1p(m.liquidity) * np.log1p(m.volume),
            reverse=True,
        )[:top_opportunities_n]
        top_opps = [
            {
                "rank": i + 1,
                "market_id": m.id,
                "question": m.question[:80] + "..." if len(m.question) > 80 else m.question,
                "yes_price": m.yes_price,
                "no_price": m.no_price,
                "liquidity": m.liquidity,
                "volume": m.volume,
                "reason": "high_activity (install sentence-transformers for full analysis)",
                "score": 0.0,
            }
            for i, m in enumerate(sorted_by_activity)
        ]
    arb_list = _serialize_arbitrage(arbs)
    mispriced_list = _serialize_mispriced(mispriced)

    return {
        "top_opportunities": top_opps,
        "arbitrage": arb_list,
        "mispriced_markets": mispriced_list,
    }
