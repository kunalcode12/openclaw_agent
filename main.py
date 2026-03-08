import argparse
import asyncio
import json

from dotenv import load_dotenv

load_dotenv()

from agents.market_agent import analyze_market as get_market_prices
from agents.news_agent import get_news_sentiment
from agents.onchain_agent import get_whale_activity_summary
from agents.quant_agent import analyze_market as get_quant_signals
from research.synthesizer import synthesize_report

DEFAULT_ONCHAIN_WALLET = "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"

def main() -> None:
    print("Running AI Trading Research pipeline...\n")
    print("[1/6] Fetching market prices...")
    market_data = get_market_prices()
    print(f"      BTC: {market_data.get('BTC', 'N/A')} | ETH: {market_data.get('ETH', 'N/A')} | SOL: {market_data.get('SOL', 'N/A')}")
    print("[2/6] Running quant analysis (BTC)...")
    quant_signals = get_quant_signals(symbol="BTCUSDT")
    print(f"      Trend: {quant_signals.get('trend')} | RSI: {quant_signals.get('rsi')} | Signal: {quant_signals.get('signal')}")
    print("[3/6] Fetching on-chain whale activity...")
    try:
        on_chain_analysis = get_whale_activity_summary(DEFAULT_ONCHAIN_WALLET, limit=50)
        on_chain_analysis = {
            "wallet": on_chain_analysis.get("wallet", ""),
            "whale_in": on_chain_analysis.get("count_in", 0),
            "whale_out": on_chain_analysis.get("count_out", 0),
            "total_whale_in": on_chain_analysis.get("total_whale_in", 0),
            "total_whale_out": on_chain_analysis.get("total_whale_out", 0),
        }
        total_in = on_chain_analysis.get("total_whale_in", 0)
        print(f"      Whale in: {on_chain_analysis.get('whale_in', 0)} | Whale out: {on_chain_analysis.get('whale_out', 0)} | Total in: {total_in:,.0f}")
    except Exception as e:
        print(f"      (On-chain skipped: {e})")
        on_chain_analysis = {"whale_in": 0, "whale_out": 0, "note": "Helius API not configured"}
    print("[4/6] Fetching news sentiment...")
    try:
        news_sentiment = get_news_sentiment(limit=10)
        print(f"      Sentiment: {news_sentiment.get('sentiment')} | Bullish: {news_sentiment.get('bullish_count')} | Bearish: {news_sentiment.get('bearish_count')}")
    except Exception as e:
        print(f"      (News skipped: {e})")
        news_sentiment = {"sentiment": "neutral", "bullish_count": 0, "bearish_count": 0, "note": "NewsData API not configured"}
    print("[5/6] Running Polymarket research...")
    try:
        from skills.trade_research.trade_research import run_research

        polymarket_results = asyncio.run(run_research())
        print(
            f"      Opportunities: {len(polymarket_results.get('top_opportunities', []))} | "
            f"Arbitrage: {len(polymarket_results.get('arbitrage', []))}"
        )
    except Exception as e:
        print(f"      (Polymarket skipped: {e})")
        polymarket_results = {"top_opportunities": [], "arbitrage": [], "mispriced_markets": []}
    print("[6/6] Generating research report (Gemini)...\n")
    report = synthesize_report(
        market_data=market_data,
        quant_signals=quant_signals,
        on_chain_analysis=on_chain_analysis,
        news_sentiment=news_sentiment,
        polymarket_research=polymarket_results,
    )

    print("=" * 60)
    print("FINAL RESEARCH REPORT")
    print("=" * 60)
    print(report)


def run_polymarket(json_output: bool = False) -> None:
    from skills.trade_research.trade_research import run_research, print_results

    result = asyncio.run(run_research())
    if json_output:
        print(json.dumps(result, indent=2))
    else:
        print_results(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="AI Trading Research",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  crypto      Full crypto pipeline (default)
  polymarket  Polymarket opportunities & arbitrage
        """,
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="crypto",
        choices=["crypto", "polymarket"],
        help="crypto: full pipeline | polymarket: Polymarket opportunities",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="JSON output (polymarket only)",
    )
    args = parser.parse_args()

    if args.command == "polymarket":
        run_polymarket(json_output=args.json)
    else:
        main()
