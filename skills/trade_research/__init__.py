"""
Polymarket Trade Research - Opportunity and arbitrage detection.

Fetches market data from Polymarket Gamma API, clusters related markets
via semantic similarity, and identifies trading opportunities.
"""

from skills.trade_research.trade_research import run_research, print_results

__all__ = ["run_research", "print_results"]
