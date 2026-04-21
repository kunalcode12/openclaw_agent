import { UTCTimestamp } from "lightweight-charts";
import type { CandleData, TokenInfo } from "@/components/TradingChart";

const START_TIME = Math.floor(new Date("2026-03-01T00:00:00Z").getTime() / 1000);
const CANDLE_SECONDS = 60 * 60; // 1h bars

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeDeterministicNoise(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function buildTradingDummyData(count = 360): CandleData[] {
  const candles: CandleData[] = [];
  let prevClose = 84.9;

  for (let i = 0; i < count; i++) {
    const cycle = Math.sin(i / 16) * 0.55 + Math.cos(i / 31) * 0.3;
    const drift = i < count * 0.35 ? 0.018 : i < count * 0.65 ? -0.01 : 0.015;
    const noise = (makeDeterministicNoise(i) - 0.5) * 0.9;
    const open = prevClose;
    const close = clamp(open + cycle + drift + noise, 72, 112);

    const wickNoise = Math.abs((makeDeterministicNoise(i + 3) - 0.5) * 1.4);
    const high = Math.max(open, close) + 0.18 + wickNoise;
    const low = Math.min(open, close) - 0.18 - wickNoise * 0.9;

    const baseVolume = 2_100_000 + Math.abs(cycle) * 2_700_000;
    const burst = i % 74 === 0 || i % 93 === 0 ? 7_500_000 : 0;
    const volume = Math.round(baseVolume + burst + makeDeterministicNoise(i + 9) * 650_000);

    candles.push({
      time: (START_TIME + i * CANDLE_SECONDS) as UTCTimestamp,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume,
    });

    prevClose = close;
  }

  return candles;
}

export const tradingDummyData: CandleData[] = buildTradingDummyData();

const latest = tradingDummyData[tradingDummyData.length - 1];
const previous = tradingDummyData[tradingDummyData.length - 2] ?? latest;
const pct = ((latest.close - previous.close) / previous.close) * 100;

export const tradingDummyToken: TokenInfo = {
  symbol: "SOL",
  name: "Wrapped SOL",
  address: "So1111...111112",
  price: Number(latest.close.toFixed(2)),
  priceChange: Number(pct.toFixed(3)),
  marketCap: "$49,274,091,867",
  liquidity: "$6,087,249,468",
  volume24h: "$14,872,328,626",
  holders: "6,340,383",
};
