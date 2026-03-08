import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Opportunity:
    market_id: str
    question: str
    reason: str
    yes_price: float
    no_price: float
    liquidity: float
    volume: float
    mispricing: float
    score_component: float


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    return float(np.percentile(values, p))


def detect_opportunities(
    markets: list,
    clusters: list,
    mispricing_threshold: float = 0.15,
    liquidity_percentile_low: float = 10.0,
    volume_percentile_high: float = 90.0,
) -> tuple[list[Opportunity], list[dict]]:
    if not markets:
        return [], []

    market_by_id = {m.id: m for m in markets}
    liquidity_values = [m.liquidity for m in markets if m.liquidity > 0]
    volume_values = [m.volume for m in markets if m.volume > 0]

    liq_threshold = _percentile(liquidity_values, liquidity_percentile_low) or 1e-6
    vol_threshold = _percentile(volume_values, volume_percentile_high) or 0

    opportunities = []
    mispriced_markets = []
    cluster_members: dict[str, list[str]] = {}
    for cluster in clusters:
        for mid in cluster.market_ids:
            cluster_members[mid] = [m for m in cluster.market_ids if m != mid]

    for m in markets:
        reasons = []
        mispricing = 0.0
        if m.id in cluster_members and cluster_members[m.id]:
            related_ids = cluster_members[m.id]
            related = [market_by_id[rid] for rid in related_ids if rid in market_by_id]
            if related:
                mean_yes = np.mean([r.yes_price for r in related])
                diff = abs(m.yes_price - mean_yes)
                if diff >= mispricing_threshold:
                    reasons.append(f"prob_diff_vs_cluster={diff:.2f}")
                    mispricing = diff
                    mispriced_markets.append(
                        {
                            "market_id": m.id,
                            "question": m.question,
                            "yes_price": m.yes_price,
                            "cluster_mean_yes": mean_yes,
                            "mispricing": diff,
                        }
                    )
        if m.liquidity > 0 and m.liquidity <= liq_threshold and m.volume >= vol_threshold:
            reasons.append("low_liq_volume_spike")
        total_prob = m.yes_price + m.no_price
        if abs(total_prob - 1.0) > 0.02:
            prob_mispricing = abs(total_prob - 1.0)
            if prob_mispricing > mispricing:
                mispricing = prob_mispricing
            reasons.append(f"yes_plus_no={total_prob:.2f}")

        if not reasons:
            continue
        liq_norm = np.log1p(m.liquidity) / max(np.log1p(max(liquidity_values)), 1)
        vol_norm = np.log1p(m.volume) / max(np.log1p(max(volume_values)), 1)
        score_component = liq_norm * max(mispricing, 0.01) * vol_norm

        opportunities.append(
            Opportunity(
                market_id=m.id,
                question=m.question[:80] + "..." if len(m.question) > 80 else m.question,
                reason=" | ".join(reasons),
                yes_price=m.yes_price,
                no_price=m.no_price,
                liquidity=m.liquidity,
                volume=m.volume,
                mispricing=mispricing,
                score_component=score_component,
            )
        )

    logger.info(f"Detected {len(opportunities)} opportunities, {len(mispriced_markets)} mispriced")
    return opportunities, mispriced_markets
