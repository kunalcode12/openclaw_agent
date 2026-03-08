"""Storage module - persistence for collected data and reports."""

from storage.database import (
    get_last_reports,
    get_market_data,
    get_news,
    load_report,
    save_market_data,
    save_news,
    save_report,
    save_signal,
    StoredReport,
)
from storage.repository import StorageRepository

__all__ = [
    "StorageRepository",
    "StoredReport",
    "save_market_data",
    "save_report",
    "save_signal",
    "save_news",
    "get_last_reports",
    "load_report",
    "get_market_data",
    "get_news",
]
