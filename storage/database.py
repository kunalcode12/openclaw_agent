"""SQLite database for market data, signals, news, and research reports."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator


@dataclass
class StoredReport:
    """Cached research report with metadata."""

    report_id: str
    symbol: str
    created_at: datetime
    content: dict[str, Any]


@contextmanager
def _get_connection(db_path: Path) -> Iterator[sqlite3.Connection]:
    """Yield a database connection with row factory."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_schema(conn: sqlite3.Connection) -> None:
    """Create tables if they do not exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS market_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            value REAL,
            timestamp TEXT NOT NULL,
            metadata TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            title TEXT,
            source TEXT,
            url TEXT,
            published_at TEXT,
            summary TEXT,
            sentiment TEXT,
            raw TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS research_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id TEXT UNIQUE NOT NULL,
            symbol TEXT NOT NULL,
            created_at TEXT NOT NULL,
            content TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data(symbol);
        CREATE INDEX IF NOT EXISTS idx_market_data_timestamp ON market_data(timestamp);
        CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
        CREATE INDEX IF NOT EXISTS idx_news_symbol ON news(symbol);
        CREATE INDEX IF NOT EXISTS idx_research_reports_symbol ON research_reports(symbol);
        CREATE INDEX IF NOT EXISTS idx_research_reports_created ON research_reports(created_at);
    """)


def save_market_data(
    symbol: str,
    data: list[dict[str, Any]],
    db_path: str | Path = "data/trading.db",
) -> None:
    """
    Save OHLCV market data for a symbol.

    Args:
        symbol: Trading pair symbol (e.g. BTCUSDT).
        data: List of dicts with keys open, high, low, close, volume.
              Optional 'timestamp' per row; defaults to created_at.
        db_path: Path to SQLite database file.
    """
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with _get_connection(path) as conn:
        _init_schema(conn)
        now = datetime.utcnow().isoformat()
        rows = []
        for row in data:
            ts = row.get("timestamp")
            if isinstance(ts, datetime):
                ts = ts.isoformat()
            elif ts is None:
                ts = now
            rows.append((
                symbol,
                ts,
                float(row["open"]),
                float(row["high"]),
                float(row["low"]),
                float(row["close"]),
                float(row["volume"]),
            ))
        conn.executemany(
            """
            INSERT INTO market_data (symbol, timestamp, open, high, low, close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )


def save_report(
    symbol: str,
    report: dict[str, Any],
    db_path: str | Path = "data/trading.db",
) -> str:
    """
    Save a research report and return its ID.

    Args:
        symbol: Trading pair symbol.
        report: Report content as a dict (will be stored as JSON).
        db_path: Path to SQLite database file.

    Returns:
        report_id: Unique identifier for the saved report.
    """
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    report_id = f"{symbol}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
    created_at = datetime.utcnow().isoformat()
    content_json = json.dumps(report)

    with _get_connection(path) as conn:
        _init_schema(conn)
        conn.execute(
            """
            INSERT INTO research_reports (report_id, symbol, created_at, content)
            VALUES (?, ?, ?, ?)
            """,
            (report_id, symbol, created_at, content_json),
        )

    return report_id


def save_signal(
    symbol: str,
    signal_type: str,
    timestamp: str | datetime,
    value: float | None = None,
    metadata: dict[str, Any] | None = None,
    db_path: str | Path = "data/trading.db",
) -> None:
    """
    Save a trading signal.

    Args:
        symbol: Trading pair symbol.
        signal_type: Type of signal (e.g. buy, sell, hold).
        timestamp: When the signal occurred.
        value: Optional numeric value (e.g. confidence score).
        metadata: Optional extra data (stored as JSON).
        db_path: Path to SQLite database file.
    """
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    ts = timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp)
    meta_json = json.dumps(metadata) if metadata else None

    with _get_connection(path) as conn:
        _init_schema(conn)
        conn.execute(
            """
            INSERT INTO signals (symbol, signal_type, value, timestamp, metadata)
            VALUES (?, ?, ?, ?, ?)
            """,
            (symbol, signal_type, value, ts, meta_json),
        )


def save_news(
    symbol: str,
    items: list[dict[str, Any]],
    db_path: str | Path = "data/trading.db",
) -> None:
    """
    Save news items for a symbol.

    Args:
        symbol: Trading pair or topic symbol.
        items: List of dicts with keys like title, source, url, published_at,
               summary, sentiment. Extra keys stored in raw JSON.
        db_path: Path to SQLite database file.
    """
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for item in items:
        title = item.get("title", "")
        source = item.get("source", "")
        url = item.get("url") or item.get("link")
        pub = item.get("published_at") or item.get("pub_date")
        if isinstance(pub, datetime):
            pub = pub.isoformat()
        summary = item.get("summary") or item.get("description")
        sentiment = item.get("sentiment")
        raw = json.dumps(item)
        rows.append((symbol, title, source, url, pub, summary, sentiment, raw))

    with _get_connection(path) as conn:
        _init_schema(conn)
        conn.executemany(
            """
            INSERT INTO news (symbol, title, source, url, published_at, summary, sentiment, raw)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )


def get_last_reports(
    limit: int = 10,
    symbol: str | None = None,
    db_path: str | Path = "data/trading.db",
) -> list[StoredReport]:
    """
    Get the most recent research reports, optionally filtered by symbol.

    Args:
        limit: Maximum number of reports to return.
        symbol: If provided, filter by symbol.
        db_path: Path to SQLite database file.

    Returns:
        List of StoredReport instances, newest first.
    """
    path = Path(db_path)
    if not path.exists():
        return []

    with _get_connection(path) as conn:
        _init_schema(conn)
        if symbol:
            cur = conn.execute(
                """
                SELECT report_id, symbol, created_at, content
                FROM research_reports
                WHERE symbol = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (symbol, limit),
            )
        else:
            cur = conn.execute(
                """
                SELECT report_id, symbol, created_at, content
                FROM research_reports
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            )
        rows = cur.fetchall()

    return [
        StoredReport(
            report_id=r["report_id"],
            symbol=r["symbol"],
            created_at=datetime.fromisoformat(r["created_at"]),
            content=json.loads(r["content"]),
        )
        for r in rows
    ]


def load_report(
    report_id: str,
    db_path: str | Path = "data/trading.db",
) -> StoredReport | None:
    """
    Load a report by ID.

    Args:
        report_id: Unique report identifier.
        db_path: Path to SQLite database file.

    Returns:
        StoredReport if found, else None.
    """
    path = Path(db_path)
    if not path.exists():
        return None

    with _get_connection(path) as conn:
        _init_schema(conn)
        cur = conn.execute(
            "SELECT report_id, symbol, created_at, content FROM research_reports WHERE report_id = ?",
            (report_id,),
        )
        row = cur.fetchone()

    if row is None:
        return None
    return StoredReport(
        report_id=row["report_id"],
        symbol=row["symbol"],
        created_at=datetime.fromisoformat(row["created_at"]),
        content=json.loads(row["content"]),
    )


def get_market_data(
    symbol: str,
    limit: int = 500,
    db_path: str | Path = "data/trading.db",
) -> list[dict[str, Any]]:
    """
    Get OHLCV market data for a symbol, newest first.

    Args:
        symbol: Trading pair symbol.
        limit: Maximum rows to return.
        db_path: Path to SQLite database file.

    Returns:
        List of dicts with open, high, low, close, volume, timestamp.
    """
    path = Path(db_path)
    if not path.exists():
        return []

    with _get_connection(path) as conn:
        _init_schema(conn)
        cur = conn.execute(
            """
            SELECT timestamp, open, high, low, close, volume
            FROM market_data
            WHERE symbol = ?
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (symbol, limit),
        )
        rows = cur.fetchall()

    return [
        {
            "timestamp": r["timestamp"],
            "open": r["open"],
            "high": r["high"],
            "low": r["low"],
            "close": r["close"],
            "volume": r["volume"],
        }
        for r in reversed(rows)
    ]


def get_news(
    symbol: str,
    limit: int = 100,
    db_path: str | Path = "data/trading.db",
) -> list[dict[str, Any]]:
    """
    Get news items for a symbol, newest first.

    Args:
        symbol: Trading pair or topic symbol.
        limit: Maximum items to return.
        db_path: Path to SQLite database file.

    Returns:
        List of dicts with title, source, url, published_at, summary, sentiment.
    """
    path = Path(db_path)
    if not path.exists():
        return []

    with _get_connection(path) as conn:
        _init_schema(conn)
        cur = conn.execute(
            """
            SELECT title, source, url, published_at, summary, sentiment, raw
            FROM news
            WHERE symbol = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (symbol, limit),
        )
        rows = cur.fetchall()

    result = []
    for r in rows:
        if r["raw"]:
            try:
                result.append(json.loads(r["raw"]))
            except json.JSONDecodeError:
                result.append({
                    "title": r["title"],
                    "source": r["source"],
                    "url": r["url"],
                    "published_at": r["published_at"],
                    "summary": r["summary"],
                    "sentiment": r["sentiment"],
                })
        else:
            result.append({
                "title": r["title"],
                "source": r["source"],
                "url": r["url"],
                "published_at": r["published_at"],
                "summary": r["summary"],
                "sentiment": r["sentiment"],
            })
    return result
