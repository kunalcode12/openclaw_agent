"""Storage layer for market data, reports, and cached results."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import json


@dataclass
class StoredReport:
    """Cached research report with metadata."""

    report_id: str
    symbol: str
    created_at: datetime
    content: dict[str, Any]


class StorageRepository:
    """
    Persists and retrieves market data, on-chain data, and research reports.
    Uses local JSON files; can be extended for DB/cloud storage.
    """

    def __init__(self, base_path: str | Path = "data") -> None:
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        (self.base_path / "reports").mkdir(exist_ok=True)
        (self.base_path / "market").mkdir(exist_ok=True)
        (self.base_path / "onchain").mkdir(exist_ok=True)
        (self.base_path / "news").mkdir(exist_ok=True)

    def save_report(self, symbol: str, report: dict[str, Any]) -> str:
        """Save a research report and return its ID."""
        report_id = f"{symbol}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        path = self.base_path / "reports" / f"{report_id}.json"
        data = {
            "report_id": report_id,
            "symbol": symbol,
            "created_at": datetime.utcnow().isoformat(),
            "content": report,
        }
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return report_id

    def load_report(self, report_id: str) -> StoredReport | None:
        """Load a report by ID."""
        path = self.base_path / "reports" / f"{report_id}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return StoredReport(
            report_id=data["report_id"],
            symbol=data["symbol"],
            created_at=datetime.fromisoformat(data["created_at"]),
            content=data["content"],
        )

    def save_market_data(self, symbol: str, data: list[dict[str, Any]]) -> None:
        """Cache market OHLCV data."""
        path = self.base_path / "market" / f"{symbol}.json"
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def load_market_data(self, symbol: str) -> list[dict[str, Any]]:
        """Load cached market data."""
        path = self.base_path / "market" / f"{symbol}.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def save_on_chain_data(self, symbol: str, data: dict[str, Any]) -> None:
        """Cache on-chain data."""
        path = self.base_path / "onchain" / f"{symbol}.json"
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def load_on_chain_data(self, symbol: str) -> dict[str, Any]:
        """Load cached on-chain data."""
        path = self.base_path / "onchain" / f"{symbol}.json"
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def save_news(self, symbol: str, items: list[dict[str, Any]]) -> None:
        """Cache news items."""
        path = self.base_path / "news" / f"{symbol}.json"
        path.write_text(json.dumps(items, indent=2), encoding="utf-8")

    def load_news(self, symbol: str) -> list[dict[str, Any]]:
        """Load cached news."""
        path = self.base_path / "news" / f"{symbol}.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))
