import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

_project_root = Path(__file__).resolve().parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from skills.trade_research.market_analyzer import run_analysis

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


async def run_research(
    max_markets: int = 500,
    top_n: int = 10,
) -> dict:
    return await run_analysis(max_markets=max_markets, top_opportunities_n=top_n)


def print_results(result: dict) -> None:
    try:
        from rich.console import Console
        from rich.table import Table
        from rich.panel import Panel
    except ImportError:
        _print_fallback(result)
        return

    console = Console()
    opps = result.get("top_opportunities", [])
    if opps:
        table = Table(title="Top 10 Trading Opportunities", show_header=True)
        table.add_column("Rank", style="cyan", width=4)
        table.add_column("Question", style="white", max_width=50)
        table.add_column("YES", justify="right", width=6)
        table.add_column("NO", justify="right", width=6)
        table.add_column("Liquidity", justify="right", width=10)
        table.add_column("Volume", justify="right", width=10)
        table.add_column("Reason", style="dim", max_width=30)

        for row in opps:
            table.add_row(
                str(row.get("rank", "")),
                str(row.get("question", ""))[:50],
                f"{row.get('yes_price', 0):.2f}",
                f"{row.get('no_price', 0):.2f}",
                f"{row.get('liquidity', 0):,.0f}",
                f"{row.get('volume', 0):,.0f}",
                str(row.get("reason", ""))[:30],
            )
        console.print(table)
    else:
        console.print("[yellow]No opportunities detected.[/yellow]")
    arbs = result.get("arbitrage", [])
    if arbs:
        table = Table(title="Arbitrage Opportunities", show_header=True)
        table.add_column("Type", style="green", width=18)
        table.add_column("Total Prob", justify="right", width=10)
        table.add_column("Profit %", justify="right", width=8)
        table.add_column("Details", style="dim", max_width=40)

        for a in arbs:
            table.add_row(
                a.get("type", ""),
                str(a.get("total_probability", "")),
                f"{a.get('profit_potential_pct', 0):.2f}%",
                str(a.get("details", ""))[:40],
            )
        console.print(table)
    else:
        console.print("[yellow]No arbitrage opportunities detected.[/yellow]")


def _print_fallback(result: dict) -> None:
    opps = result.get("top_opportunities", [])
    arbs = result.get("arbitrage", [])

    print("\n=== Top 10 Trading Opportunities ===")
    for row in opps:
        print(
            f"  {row.get('rank')}. {row.get('question', '')[:60]} | "
            f"YES={row.get('yes_price', 0):.2f} NO={row.get('no_price', 0):.2f} | "
            f"{row.get('reason', '')}"
        )

    print("\n=== Arbitrage Opportunities ===")
    for a in arbs:
        print(
            f"  [{a.get('type')}] prob={a.get('total_probability')} "
            f"profit={a.get('profit_potential_pct')}% | {a.get('details', '')}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Polymarket Trade Research")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON only (no tables)",
    )
    parser.add_argument(
        "--max-markets",
        type=int,
        default=500,
        help="Max markets to fetch (default 500)",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=10,
        help="Number of top opportunities (default 10)",
    )
    args = parser.parse_args()

    result = asyncio.run(run_research(max_markets=args.max_markets, top_n=args.top))

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print_results(result)


if __name__ == "__main__":
    main()
