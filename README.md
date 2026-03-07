# AI Trading Research

A modular crypto trading research agent that collects market data, runs technical analysis, gathers on-chain data, aggregates news, and generates research reports using an LLM.

## Setup

```bash
cd ai-trading-research
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## API Keys (`.env`)

Create a `.env` file in the project root (copy from `.env.example`):

```
# Binance – no key needed for public market data
# Helius – Solana on-chain: https://helius.dev
HELIUS_API_KEY=your_key

# NewsData.io – crypto news: https://newsdata.io
NEWSDATA_API_KEY=your_key

# Google Gemini – research reports: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_key
```

The project loads `.env` automatically when you run scripts. Do not commit `.env` to git.

## How to Use

### Full pipeline (main)

```bash
python main.py
```

Runs the full research pipeline for BTC: collects data, runs analysis, generates a report, saves to `data/`.

### Individual agents

```bash
# Market prices (BTC, ETH, SOL)
python agents/market_agent.py

# Quant analysis (RSI, EMA trend, signals)
python agents/quant_agent.py
python agents/quant_agent.py ETHUSDT

# Whale activity (Solana wallet)
python agents/onchain_agent.py
python agents/onchain_agent.py <wallet_address>

# News sentiment (bullish/bearish/neutral)
python agents/news_agent.py
```

### Research synthesizer (Gemini report)

```bash
python -m research.synthesizer
```

Generates a research report from sample data. With `GEMINI_API_KEY` in `.env`, it uses Gemini; otherwise it returns a template.

### Collectors (direct API calls)

```bash
python collectors/binance.py           # Price + 24h stats
python collectors/binance.py ETHUSDT
python collectors/news.py              # Crypto headlines
python -m analysis.indicators          # RSI, EMA, MACD
```

## Structure

```
ai-trading-research/
├── agents/          # market_agent, quant_agent, onchain_agent, news_agent, research_agent
├── collectors/      # binance, helius, news
├── analysis/       # indicators, technical
├── research/       # synthesizer, report_generator
├── storage/        # JSON persistence
├── main.py         # Full pipeline entry point
└── .env            # API keys (create from .env.example)
```

## Pipeline

1. **Collect** – Market (Binance), on-chain (Helius), news (NewsData.io)
2. **Analyze** – RSI, EMA, MACD, whale detection, sentiment
3. **Report** – Gemini synthesizer or OpenAI report generator
4. **Store** – Results in `data/`
