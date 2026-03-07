"""On-chain data collector for blockchain metrics."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class OnChainMetrics:
    """On-chain metrics for a token or network."""

    active_addresses: Optional[int] = None
    transaction_count: Optional[int] = None
    total_value_locked: Optional[float] = None
    exchange_inflow: Optional[float] = None
    exchange_outflow: Optional[float] = None
    whale_transactions: Optional[int] = None


class OnChainCollector:
    """Collects on-chain data from blockchain explorers and analytics providers."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def get_metrics(self, token_address_or_symbol: str, network: str = "ethereum") -> OnChainMetrics:
        """Fetch on-chain metrics for a token."""
        # TODO: Integrate with Glassnode, Dune, Etherscan, etc.
        raise NotImplementedError("Connect to on-chain data provider")

    def get_exchange_flows(self, symbol: str) -> dict[str, float]:
        """Fetch exchange inflow/outflow data."""
        # TODO: Integrate with on-chain analytics
        raise NotImplementedError("Connect to on-chain data provider")

    def collect(self, symbol: str) -> dict:
        """
        Collect on-chain metrics for a symbol. Returns dict for pipeline integration.
        """
        try:
            metrics = self.get_metrics(symbol, "ethereum")
            flows = self.get_exchange_flows(symbol)
            return {
                "active_addresses": metrics.active_addresses,
                "transaction_count": metrics.transaction_count,
                "total_value_locked": metrics.total_value_locked,
                "exchange_inflow": metrics.exchange_inflow or flows.get("inflow"),
                "exchange_outflow": metrics.exchange_outflow or flows.get("outflow"),
                "whale_transactions": metrics.whale_transactions,
            }
        except NotImplementedError:
            return self._demo_metrics(symbol)

    def _demo_metrics(self, symbol: str) -> dict:
        """Return demo on-chain data when API is not configured."""
        import random

        return {
            "active_addresses": random.randint(800_000, 1_200_000),
            "transaction_count": random.randint(1_000_000, 2_000_000),
            "total_value_locked": random.uniform(40e9, 60e9),
            "exchange_inflow": random.uniform(1e9, 5e9),
            "exchange_outflow": random.uniform(1e9, 5e9),
            "whale_transactions": random.randint(50, 200),
        }
