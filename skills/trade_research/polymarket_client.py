"""
Async client for Polymarket Gamma API.

Fetches market data from https://gamma-api.polymarket.com/markets
and parses into normalized dataclass format.
"""

import json
import logging
from datetime import datetime
from typing import Optional

import httpx
from dataclasses import dataclass

logger = logging.getLogger(__name__)

GAMMA_API_BASE = "https://gamma-api.polymarket.com"


@dataclass
class Polymarket:
    """Normalized market data from Polymarket Gamma API."""

    id: str
    question: str
    yes_price: float
    no_price: float
    liquidity: float
    volume: float
    end_date: Optional[datetime]
    closed: bool
    slug: Optional[str] = None
    raw: Optional[dict] = None

    @property
    def total_probability(self) -> float:
        """YES + NO; should be ~1.0; >1 indicates same-market arbitrage."""
        return self.yes_price + self.no_price


def _parse_prices(raw: dict) -> tuple[float, float]:
    """
    Parse outcomePrices from API response.
    Format: outcomePrices is JSON string '["0.60","0.40"]' with index 0=YES, 1=NO.
    """
    prices_str = raw.get("outcomePrices")
    if not prices_str:
        return 0.5, 0.5  # fallback

    try:
        if isinstance(prices_str, str):
            prices = json.loads(prices_str)
        else:
            prices = list(prices_str)
        yes = float(prices[0]) if len(prices) > 0 else 0.5
        no = float(prices[1]) if len(prices) > 1 else (1.0 - yes)
        return yes, no
    except (json.JSONDecodeError, ValueError, TypeError):
        logger.warning(f"Failed to parse outcomePrices: {prices_str}")
        return 0.5, 0.5


def _parse_float(val, default: float = 0.0) -> float:
    """Parse string/number to float safely."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _parse_datetime(val) -> Optional[datetime]:
    """Parse ISO datetime string."""
    if not val:
        return None
    try:
        if isinstance(val, datetime):
            return val
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _parse_market(raw: dict) -> Optional[Polymarket]:
    """Parse a single raw market object into Polymarket dataclass."""
    try:
        market_id = str(raw.get("id", raw.get("conditionId", "")))
        if not market_id:
            return None

        question = raw.get("question") or raw.get("title") or ""
        if not question:
            return None

        yes_price, no_price = _parse_prices(raw)
        liquidity = _parse_float(raw.get("liquidity"))
        volume = _parse_float(raw.get("volume"))
        end_date = _parse_datetime(raw.get("endDate"))
        closed = bool(raw.get("closed", False))

        return Polymarket(
            id=market_id,
            question=question,
            yes_price=yes_price,
            no_price=no_price,
            liquidity=liquidity,
            volume=volume,
            end_date=end_date,
            closed=closed,
            slug=raw.get("slug"),
            raw=raw,
        )
    except Exception as e:
        logger.warning(f"Failed to parse market: {e}")
        return None


async def fetch_markets(
    limit: int = 500,
    offset: int = 0,
    closed: bool = False,
    client: Optional[httpx.AsyncClient] = None,
) -> list[Polymarket]:
    """
    Fetch markets from Polymarket Gamma API.

    Args:
        limit: Max markets to fetch per request
        offset: Pagination offset
        closed: If False, exclude closed markets (default)
        client: Optional shared httpx client for connection pooling

    Returns:
        List of parsed Polymarket objects
    """
    params = {"limit": limit, "offset": offset}
    # Gamma API: closed=false for active markets (filter client-side if unsupported)
    if not closed:
        params["closed"] = "false"

    url = f"{GAMMA_API_BASE}/markets"

    async def _do_fetch(c: httpx.AsyncClient):
        resp = await c.get(url, params=params)
        resp.raise_for_status()
        return resp.json()

    try:
        if client is not None:
            data = await _do_fetch(client)
        else:
            async with httpx.AsyncClient(timeout=30.0) as c:
                data = await _do_fetch(c)
    except httpx.HTTPError as e:
        logger.error(f"Polymarket API error: {e}")
        return []
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON from Polymarket: {e}")
        return []

    # Handle both list and dict responses (some APIs wrap in {"data": [...]})
    if isinstance(data, dict):
        data = data.get("data", data.get("markets", []))
    if not isinstance(data, list):
        data = []

    markets = []
    for item in data:
        m = _parse_market(item)
        if m:
            markets.append(m)

    logger.info(f"Fetched {len(markets)} markets from Polymarket (offset={offset})")
    return markets


async def fetch_all_markets(
    max_markets: int = 1000,
    closed: bool = False,
) -> list[Polymarket]:
    """
    Fetch all active markets with pagination.

    Args:
        max_markets: Maximum total markets to fetch
        closed: Include closed markets

    Returns:
        List of all parsed markets
    """
    all_markets = []
    offset = 0
    batch_size = 200

    async with httpx.AsyncClient(timeout=30.0) as client:
        while len(all_markets) < max_markets:
            batch = await fetch_markets(
                limit=batch_size,
                offset=offset,
                closed=closed,
                client=client,
            )
            if not batch:
                break
            all_markets.extend(batch)
            offset += batch_size
            if len(batch) < batch_size:
                break
            if len(all_markets) >= max_markets:
                all_markets = all_markets[:max_markets]
                break

    # Filter closed markets client-side if API ignored closed param
    if not closed:
        all_markets = [m for m in all_markets if not m.closed]

    logger.info(f"Total markets fetched: {len(all_markets)}")
    return all_markets
