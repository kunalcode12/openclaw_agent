"""
On-chain agent - detects large whale transfers and summarizes whale activity.

Uses the Helius API to fetch token transfers and identify significant movements.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

# Add project root to path so imports work when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collectors.helius import SOL_MINT, get_token_transfers


def _is_whale_transfer(
    transfer: dict[str, Any],
    sol_threshold: float = 100.0,
    token_threshold: float = 1_000_000.0,
) -> bool:
    """
    Determine if a transfer qualifies as a whale transfer.

    Args:
        transfer: Transfer dict with mint, amount, amountRaw, symbol
        sol_threshold: Min SOL amount to count as whale (default 100 SOL)
        token_threshold: Min token amount for non-SOL (default 1M)

    Returns:
        True if transfer meets whale threshold
    """
    mint = transfer.get("mint", "")
    amount = float(transfer.get("amount", 0))

    if mint == SOL_MINT:
        return amount >= sol_threshold
    # For SPL tokens, use human-readable amount
    return amount >= token_threshold


def get_whale_activity_summary(
    wallet: str,
    limit: int = 100,
    sol_threshold: float = 100.0,
    token_threshold: float = 1_000_000.0,
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Fetch transfers for a wallet and return a summary of whale activity.

    Args:
        wallet: Solana wallet address to analyze
        limit: Max transfers to fetch (default 100)
        sol_threshold: Min SOL amount for whale classification (default 100)
        token_threshold: Min token amount for whale classification (default 1M)
        api_key: Helius API key (default: HELIUS_API_KEY env var)

    Returns:
        Structured summary with:
        - whale_transfers: list of large transfers
        - total_whale_in: sum of incoming whale transfers (SOL equiv for display)
        - total_whale_out: sum of outgoing whale transfers
        - count_in: number of whale inflows
        - count_out: number of whale outflows
        - wallet: analyzed wallet
    """
    result = get_token_transfers(wallet, limit=limit, api_key=api_key)
    transfers = result.get("data", result.get("transfers", []))
    if not isinstance(transfers, list):
        transfers = []

    whale_in: list[dict[str, Any]] = []
    whale_out: list[dict[str, Any]] = []
    total_in = 0.0
    total_out = 0.0

    for t in transfers:
        if not _is_whale_transfer(t, sol_threshold, token_threshold):
            continue
        direction = t.get("direction", "")
        amount = float(t.get("amount", 0))
        entry = {
            "signature": t.get("signature"),
            "timestamp": t.get("timestamp"),
            "direction": direction,
            "amount": amount,
            "symbol": t.get("symbol", "UNKNOWN"),
            "counterparty": t.get("counterparty"),
        }
        if direction == "in":
            whale_in.append(entry)
            total_in += amount
        else:
            whale_out.append(entry)
            total_out += amount

    return {
        "wallet": wallet,
        "whale_transfers": whale_in + whale_out,
        "whale_in": whale_in,
        "whale_out": whale_out,
        "total_whale_in": round(total_in, 4),
        "total_whale_out": round(total_out, 4),
        "count_in": len(whale_in),
        "count_out": len(whale_out),
        "sol_threshold": sol_threshold,
        "token_threshold": token_threshold,
    }


if __name__ == "__main__":
    import json
    import os

    wallet = sys.argv[1] if len(sys.argv) > 1 else "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"
    api_key = os.environ.get("HELIUS_API_KEY")

    try:
        summary = get_whale_activity_summary(wallet, limit=50, api_key=api_key)
        print("Whale activity summary:")
        print(json.dumps(summary, indent=2))
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
