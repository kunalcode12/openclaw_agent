"""
Arbitrage detection: same-market, contradicting related markets, synthetic.

Checks YES+NO > 1, related markets whose probabilities contradict each other,
and synthetic arbitrage across multiple markets (extensible).
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ArbitrageOpportunity:
    """A detected arbitrage opportunity."""

    arb_type: str  # "same_market" | "contradicting_related" | "synthetic"
    market_ids: list[str]
    questions: list[str]
    total_probability: float
    profit_potential: float  # approximate % profit
    details: str


def detect_arbitrage(
    markets: list,
    clusters: list,
    same_market_threshold: float = 1.01,
    contradicting_threshold: float = 1.05,
) -> list[ArbitrageOpportunity]:
    """
    Detect arbitrage opportunities.

    Types:
    1. Same-market: YES + NO > threshold (buy both, guaranteed profit)
    2. Contradicting related: Sum of YES in mutually exclusive cluster > threshold
    3. Synthetic: multi-market combos (extension point for v2)

    Args:
        markets: List of Polymarket objects
        clusters: List of Cluster from market_clusterer
        same_market_threshold: Flag when YES+NO > this (default 1.01)
        contradicting_threshold: Flag when cluster YES sum > this (default 1.05)

    Returns:
        List of ArbitrageOpportunity
    """
    market_by_id = {m.id: m for m in markets}
    opportunities = []

    # 1. Same-market arbitrage
    for m in markets:
        total = m.yes_price + m.no_price
        if total >= same_market_threshold:
            profit = (total - 1.0) * 100  # approx % profit if you buy both
            opportunities.append(
                ArbitrageOpportunity(
                    arb_type="same_market",
                    market_ids=[m.id],
                    questions=[m.question[:60] + "..." if len(m.question) > 60 else m.question],
                    total_probability=total,
                    profit_potential=profit,
                    details=f"YES={m.yes_price:.2f} + NO={m.no_price:.2f} = {total:.2f}",
                )
            )

    # 2. Contradicting related markets (mutually exclusive outcomes in same cluster)
    for cluster in clusters:
        cluster_markets = [market_by_id[mid] for mid in cluster.market_ids if mid in market_by_id]
        if len(cluster_markets) < 2:
            continue

        total_yes = sum(m.yes_price for m in cluster_markets)
        if total_yes >= contradicting_threshold:
            questions = [
                m.question[:50] + "..." if len(m.question) > 50 else m.question
                for m in cluster_markets
            ]
            profit = (total_yes - 1.0) * 100
            opportunities.append(
                ArbitrageOpportunity(
                    arb_type="contradicting_related",
                    market_ids=[m.id for m in cluster_markets],
                    questions=questions,
                    total_probability=total_yes,
                    profit_potential=profit,
                    details=f"Cluster YES sum={total_yes:.2f} (should be ~1.0)",
                )
            )

    logger.info(f"Detected {len(opportunities)} arbitrage opportunities")
    return opportunities
