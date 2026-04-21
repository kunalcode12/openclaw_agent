"use client";

import { useEffect, useRef } from "react";

export type TokenInfo = {
  symbol: string;
  name: string;
  address?: string;
  price: number;
  priceChange: number;
  marketCap?: string;
  liquidity?: string;
  volume24h?: string;
  holders?: string;
};

type TradingTerminalProps = {
  tokenInfo: TokenInfo;
};

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => unknown;
    };
  }
}

export default function TradingTerminal({ tokenInfo }: TradingTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const existingScript = document.getElementById("tradingview-widget-script");
    const mountWidget = () => {
      if (!window.TradingView || !containerRef.current) {
        return;
      }

      containerRef.current.innerHTML = "";
      // Use TradingView advanced chart so candles/indicators/toolbars work.
      new window.TradingView.widget({
        autosize: true,
        symbol: "BINANCE:SOLUSDT",
        interval: "60",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        allow_symbol_change: false,
        withdateranges: true,
        hide_side_toolbar: false,
        hide_top_toolbar: false,
        details: true,
        studies: ["MACD@tv-basicstudies", "RSI@tv-basicstudies"],
        container_id: "tradingview_chart_container",
      });
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "tradingview-widget-script";
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = mountWidget;
      document.body.appendChild(script);
    } else {
      mountWidget();
    }
  }, []);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#070b14]">
      <div className="flex h-12 items-center gap-4 border-b border-white/10 bg-black px-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">{tokenInfo.symbol}</span>
          <span className="text-xs text-white/50">{tokenInfo.name}</span>
        </div>
        <div className="text-xl font-semibold">
          ${tokenInfo.price.toFixed(2)}
        </div>
        <div
          className={
            tokenInfo.priceChange >= 0 ? "text-emerald-300" : "text-rose-300"
          }
        >
          {tokenInfo.priceChange >= 0 ? "+" : ""}
          {tokenInfo.priceChange.toFixed(3)}%
        </div>
        <div className="ml-auto hidden items-center gap-6 text-xs text-white/60 md:flex">
          <span>Market Cap {tokenInfo.marketCap ?? "-"}</span>
          <span>Liquidity {tokenInfo.liquidity ?? "-"}</span>
          <span>Volume {tokenInfo.volume24h ?? "-"}</span>
          <span>Holders {tokenInfo.holders ?? "-"}</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          id="tradingview_chart_container"
          ref={containerRef}
          className="h-full w-full"
          aria-label="TradingView chart"
        />
      </div>

      <div className="flex h-9 items-center gap-4 border-t border-white/10 bg-[#0a0f18] px-4 text-xs text-white/70">
        <button className="border-b border-indigo-400 pb-1 text-white">
          Positions
        </button>
        <button>Orders</button>
        <button>History</button>
        <button>Backtest</button>
      </div>
    </div>
  );
}
