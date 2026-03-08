from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collectors.helius import SOL_MINT, get_token_transfers


def _is_whale_transfer(
    transfer: dict[str, Any],
    sol_threshold: float = 100.0,
    token_threshold: float = 1_000_000.0,
) -> bool:
    mint = transfer.get("mint", "")
    amount = float(transfer.get("amount", 0))

    if mint == SOL_MINT:
        return amount >= sol_threshold
    return amount >= token_threshold


def get_whale_activity_summary(
    wallet: str,
    limit: int = 100,
    sol_threshold: float = 100.0,
    token_threshold: float = 1_000_000.0,
    api_key: str | None = None,
) -> dict[str, Any]:
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
