from __future__ import annotations

from pathlib import Path
from typing import Any

import json

from storage.database import (
    StoredReport,
    get_market_data,
    get_news,
    load_report as db_load_report,
    save_market_data as db_save_market_data,
    save_news as db_save_news,
    save_report as db_save_report,
)


class StorageRepository:
    def __init__(self, base_path: str | Path = "data") -> None:
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        (self.base_path / "onchain").mkdir(exist_ok=True)
        self.db_path = self.base_path / "trading.db"

    def save_report(self, symbol: str, report: dict[str, Any]) -> str:
        return db_save_report(symbol, report, db_path=self.db_path)

    def load_report(self, report_id: str) -> StoredReport | None:
        return db_load_report(report_id, db_path=self.db_path)

    def save_market_data(self, symbol: str, data: list[dict[str, Any]]) -> None:
        db_save_market_data(symbol, data, db_path=self.db_path)

    def load_market_data(self, symbol: str) -> list[dict[str, Any]]:
        return get_market_data(symbol, db_path=self.db_path)

    def save_on_chain_data(self, symbol: str, data: dict[str, Any]) -> None:
        path = self.base_path / "onchain" / f"{symbol}.json"
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def load_on_chain_data(self, symbol: str) -> dict[str, Any]:
        path = self.base_path / "onchain" / f"{symbol}.json"
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def save_news(self, symbol: str, items: list[dict[str, Any]]) -> None:
        db_save_news(symbol, items, db_path=self.db_path)

    def load_news(self, symbol: str) -> list[dict[str, Any]]:
        return get_news(symbol, db_path=self.db_path)
