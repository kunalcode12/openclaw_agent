"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CandleData {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TokenInfo {
  symbol: string;
  name: string;
  address?: string;
  price: number;
  priceChange: number; // percentage
  marketCap?: string;
  liquidity?: string;
  volume24h?: string;
  holders?: string;
}

interface TradingChartProps {
  tokenInfo?: TokenInfo;
  data?: CandleData[];
  interval?: "1m" | "1h" | "4h" | "1D";
}

// ─── Default demo data (SOL-like price action) ───────────────────────────────

function generateDemoData(): CandleData[] {
  const baseTime = Math.floor(new Date("2025-04-16T00:00:00Z").getTime() / 1000);
  const hourSec = 3600;
  const raw = [
    [84.2, 85.1, 83.8, 84.9, 1200000],
    [84.9, 87.3, 84.5, 86.8, 2300000],
    [86.8, 89.1, 86.2, 88.5, 3100000],
    [88.5, 90.5, 87.9, 90.1, 4200000],
    [90.1, 90.9, 89.3, 89.7, 2800000],
    [89.7, 90.2, 88.6, 89.0, 1900000],
    [89.0, 89.5, 87.8, 88.2, 2100000],
    [88.2, 88.9, 87.1, 87.5, 1700000],
    [87.5, 88.1, 86.8, 87.2, 1500000],
    [87.2, 87.8, 86.3, 86.9, 1400000],
    [86.9, 87.4, 85.9, 86.4, 1600000],
    [86.4, 86.9, 85.5, 86.0, 1800000],
    // Apr 17
    [86.0, 87.2, 85.7, 87.0, 2200000],
    [87.0, 87.6, 86.4, 87.3, 1900000],
    [87.3, 87.8, 86.9, 87.1, 1600000],
    [87.1, 87.5, 86.6, 87.0, 1400000],
    [87.0, 87.3, 86.2, 86.5, 1500000],
    [86.5, 87.0, 86.0, 86.3, 1300000],
    [86.3, 86.8, 85.8, 86.1, 1200000],
    [86.1, 86.5, 85.6, 85.9, 1100000],
    [85.9, 86.4, 85.4, 86.2, 1300000],
    [86.2, 86.7, 85.8, 86.0, 1200000],
    [86.0, 86.4, 85.5, 85.8, 1100000],
    [85.8, 86.2, 85.3, 85.6, 1000000],
    // Apr 18 (down trend)
    [85.6, 86.1, 85.1, 85.4, 1500000],
    [85.4, 85.9, 84.8, 85.1, 1700000],
    [85.1, 85.6, 84.5, 84.8, 1900000],
    [84.8, 85.3, 84.2, 84.5, 2100000],
    [84.5, 85.0, 83.9, 84.2, 2300000],
    [84.2, 84.7, 83.6, 83.9, 2500000],
    [83.9, 84.5, 83.3, 83.6, 27000000],  // big volume spike
    [83.6, 84.2, 83.0, 83.4, 2200000],
    [83.4, 84.0, 82.8, 83.2, 2000000],
    [83.2, 83.8, 82.6, 83.0, 1800000],
    [83.0, 83.6, 82.4, 83.5, 1700000],
    [83.5, 84.0, 83.0, 83.8, 1600000],
    // Apr 19-20
    [83.8, 84.5, 83.3, 84.2, 2100000],
    [84.2, 84.9, 83.8, 84.7, 2300000],
    [84.7, 85.5, 84.3, 85.0, 2600000],
    [85.0, 85.8, 84.6, 85.4, 2900000],
    [85.4, 86.2, 85.0, 85.8, 3200000],
    [85.8, 86.6, 85.4, 86.2, 2800000],
    [86.2, 86.8, 85.8, 86.0, 2500000],
    [86.0, 86.5, 85.5, 85.7, 2200000],
    [85.7, 86.2, 85.3, 85.5, 2000000],
    [85.5, 86.0, 85.1, 85.4, 1800000],
    // Apr 20-21 (recovery)
    [85.4, 85.9, 84.9, 85.3, 1600000],
    [85.3, 85.8, 84.8, 85.2, 1500000],
    [85.2, 85.7, 84.7, 85.6, 1700000],
    [85.6, 86.1, 85.2, 86.0, 1900000],
    [86.0, 86.5, 85.6, 86.4, 2100000],
    [86.4, 86.9, 86.0, 86.3, 2300000],
    [86.3, 86.7, 85.9, 86.1, 2000000],
    [86.1, 86.5, 85.7, 85.9, 1800000],
    [85.9, 86.3, 85.5, 86.2, 1700000],
    [86.2, 86.7, 85.8, 86.5, 1900000],
    [86.5, 87.0, 86.1, 85.58, 2930000],
  ];

  return raw.map((d, i) => ({
    time: (baseTime + i * hourSec) as UTCTimestamp,
    open: d[0],
    high: d[1],
    low: d[2],
    close: d[3],
    volume: d[4],
  }));
}

const DEFAULT_TOKEN: TokenInfo = {
  symbol: "SOL",
  name: "Wrapped SOL",
  address: "So1111...111112",
  price: 85.58,
  priceChange: 0.736,
  marketCap: "$49,274,091,867.4",
  liquidity: "$6,087,249,468.43",
  volume24h: "$14,872,328,626.45",
  holders: "6,340,383",
};

const TV_COLORS = {
  pageBg: "#0b0e11",
  panelBg: "#0f131b",
  panelBgAlt: "#111723",
  grid: "#1a202b",
  border: "#232a38",
  textPrimary: "#d1d4dc",
  textMuted: "#787b86",
  up: "#00c2a8",
  down: "#f6465d",
};

// ─── Left toolbar icons ───────────────────────────────────────────────────────

const ToolbarIcons = () => (
  <div className="toolbar">
    {[
      // Crosshair
      <svg key="cross" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>,
      // Line
      <svg key="line" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="4" y1="20" x2="20" y2="4"/></svg>,
      // Horizontal lines
      <svg key="hlines" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="16" x2="21" y2="16"/></svg>,
      // Fib
      <svg key="fib" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 20 L20 4"/><path d="M4 14 L20 14" strokeDasharray="2 2"/><path d="M4 10 L20 10" strokeDasharray="2 2"/></svg>,
      // Measure
      <svg key="meas" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="10" width="18" height="4" rx="1"/><line x1="3" y1="7" x2="3" y2="17"/><line x1="21" y1="7" x2="21" y2="17"/></svg>,
      // Text
      <svg key="text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M12 6v12M8 18h8"/></svg>,
      // Emoji
      <svg key="emoji" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>,
      // Eraser
      <svg key="erase" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 20H7L3 16l10-10 7 7-2 3z"/><line x1="6" y1="14" x2="14" y2="6"/></svg>,
      // Zoom +
      <svg key="zoom" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>,
      // Magnet
      <svg key="mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 3v7a6 6 0 0012 0V3"/><line x1="6" y1="3" x2="6" y2="7"/><line x1="18" y1="3" x2="18" y2="7"/></svg>,
      // Lock
      <svg key="edit" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
      // Eye
      <svg key="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>,
    ].map((icon, i) => (
      <button key={i} className="tool-btn">{icon}</button>
    ))}
    <style>{`
      .toolbar {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 8px 6px;
        background: #161a25;
        border-right: 1px solid #2a2e3e;
        width: 52px;
        flex-shrink: 0;
      }
      .tool-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background: transparent;
        border: none;
        color: #787b86;
        cursor: pointer;
        transition: all 0.15s;
        padding: 0;
      }
      .tool-btn:hover { background: #2a2e3e; color: #d1d4dc; }
      .tool-btn svg { width: 18px; height: 18px; }
    `}</style>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export default function TradingChart({
  tokenInfo = DEFAULT_TOKEN,
  data,
  interval: defaultInterval = "1h",
}: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [interval, setInterval] = useState(defaultInterval);
  const [hoverData, setHoverData] = useState<{
    open: number; high: number; low: number; close: number; change: number;
  } | null>(null);

  const [initialChartData] = useState<CandleData[]>(() => data ?? generateDemoData());
  const chartData = data ?? initialChartData;

  useEffect(() => {
    if (!chartContainerRef.current || !volumeContainerRef.current) return;

    // ── Main candlestick chart ──
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: TV_COLORS.pageBg },
        textColor: TV_COLORS.textMuted,
        fontFamily: "'DM Mono', 'Courier New', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: TV_COLORS.grid, style: 1 },
        horzLines: { color: TV_COLORS.grid, style: 1 },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#3a4150", width: 1, style: 2 },
        horzLine: { color: "#3a4150", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 5,
        minBarSpacing: 3.5,
        rightOffset: 8,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return `${d.getDate()}`;
        },
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: TV_COLORS.up,
      downColor: TV_COLORS.down,
      borderVisible: true,
      borderUpColor: TV_COLORS.up,
      borderDownColor: TV_COLORS.down,
      wickUpColor: TV_COLORS.up,
      wickDownColor: TV_COLORS.down,
    });

    candleSeries.setData(
      initialChartData.map(({ time, open, high, low, close }) => ({
        time, open, high, low, close,
      }))
    );

    // Price line at current price
    const lastCandle = initialChartData[initialChartData.length - 1];
    candleSeries.createPriceLine({
      price: lastCandle.close,
      color: lastCandle.close >= lastCandle.open ? TV_COLORS.up : TV_COLORS.down,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "",
    });

    chart.timeScale().fitContent();

    // Crosshair subscription for OHLC display
    chart.subscribeCrosshairMove((param) => {
      if (param.seriesData.size > 0) {
        const bar = param.seriesData.get(candleSeries);
        if (bar && "open" in bar && "high" in bar && "low" in bar && "close" in bar) {
          setHoverData({
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            change: ((bar.close - bar.open) / bar.open) * 100,
          });
        }
      } else {
        setHoverData(null);
      }
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // ── Volume chart ──
    const volChart = createChart(volumeContainerRef.current, {
      layout: {
        background: { color: TV_COLORS.pageBg },
        textColor: TV_COLORS.textMuted,
        fontFamily: "'DM Mono', 'Courier New', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: TV_COLORS.grid, style: 1 },
        horzLines: { color: "transparent" },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#3a4150", width: 1, style: 2 },
        horzLine: { color: "transparent", labelVisible: false },
      },
      rightPriceScale: {
        borderColor: TV_COLORS.border,
        textColor: TV_COLORS.textMuted,
        scaleMargins: { top: 0.2, bottom: 0 },
      },
      timeScale: {
        borderColor: TV_COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        visible: true,
        barSpacing: 5,
        minBarSpacing: 3.5,
        rightOffset: 8,
      },
      handleScroll: true,
      handleScale: true,
    });

    const volSeries = volChart.addSeries(HistogramSeries, {
      color: TV_COLORS.down,
      priceFormat: { type: "volume" },
    });

    volSeries.setData(
      initialChartData
        .filter((d) => d.volume !== undefined)
        .map(({ time, open, close, volume }) => ({
          time,
          value: volume!,
          color: close >= open ? TV_COLORS.up : TV_COLORS.down,
        }))
    );

    volChart.timeScale().fitContent();
    volumeChartRef.current = volChart;
    volumeSeriesRef.current = volSeries;

    // Sync time scales
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) volChart.timeScale().setVisibleLogicalRange(range);
    });
    volChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) chart.timeScale().setVisibleLogicalRange(range);
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      const cw = chartContainerRef.current?.clientWidth ?? 0;
      const ch = chartContainerRef.current?.clientHeight ?? 0;
      const vw = volumeContainerRef.current?.clientWidth ?? 0;
      const vh = volumeContainerRef.current?.clientHeight ?? 0;
      if (cw && ch) chart.resize(cw, ch);
      if (vw && vh) volChart.resize(vw, vh);
    });

    if (chartContainerRef.current) resizeObserver.observe(chartContainerRef.current);
    if (volumeContainerRef.current) resizeObserver.observe(volumeContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      volChart.remove();
    };
  }, [initialChartData]);

  // Update data when prop changes
  useEffect(() => {
    if (data && candleSeriesRef.current && volumeSeriesRef.current) {
      candleSeriesRef.current.setData(
        data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
      );
      volumeSeriesRef.current.setData(
        data
          .filter((d) => d.volume !== undefined)
          .map(({ time, open, close, volume }) => ({
            time, value: volume!,
            color: close >= open ? TV_COLORS.up : TV_COLORS.down,
          }))
      );
      chartRef.current?.timeScale().fitContent();
      volumeChartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  const ohlc = hoverData ?? {
    open: chartData[chartData.length - 1].open,
    high: chartData[chartData.length - 1].high,
    low: chartData[chartData.length - 1].low,
    close: chartData[chartData.length - 1].close,
    change: ((chartData[chartData.length - 1].close - chartData[chartData.length - 1].open) /
      chartData[chartData.length - 1].open) * 100,
  };

  const isUp = tokenInfo.priceChange >= 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .tc-root {
          font-family: 'DM Sans', sans-serif;
          background: ${TV_COLORS.pageBg};
          color: ${TV_COLORS.textPrimary};
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100vh;
          min-height: 600px;
          overflow: hidden;
        }

        /* ── Header ── */
        .tc-header {
          display: flex;
          align-items: center;
          gap: 0;
          background: ${TV_COLORS.panelBg};
          border-bottom: 1px solid ${TV_COLORS.border};
          height: 56px;
          flex-shrink: 0;
          padding: 0 16px 0 0;
          overflow: hidden;
        }

        .tc-token-block {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 20px;
          border-right: 1px solid ${TV_COLORS.border};
          height: 100%;
          min-width: 180px;
        }

        .tc-token-icon {
          width: 32px; height: 32px;
          background: linear-gradient(135deg, #9945FF, #14F195);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 12px; color: #fff;
          flex-shrink: 0;
        }

        .tc-token-name { font-size: 18px; font-weight: 600; color: ${TV_COLORS.textPrimary}; letter-spacing: 0.5px; }
        .tc-token-full { font-size: 11px; color: ${TV_COLORS.textMuted}; margin-top: 1px; }
        .tc-addr { font-family: 'DM Mono', monospace; font-size: 10px; color: ${TV_COLORS.textMuted}; display: flex; align-items: center; gap: 4px; }
        .tc-copy { background: none; border: none; color: #4a4e5e; cursor: pointer; padding: 0; }
        .tc-copy:hover { color: #787b86; }

        .tc-price-block {
          display: flex;
          flex-direction: column;
          padding: 0 24px;
          border-right: 1px solid ${TV_COLORS.border};
          height: 100%;
          justify-content: center;
        }
        .tc-price { font-family: 'DM Mono', monospace; font-size: 24px; font-weight: 500; color: ${TV_COLORS.textPrimary}; }
        .tc-change { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; }
        .tc-change.up { color: ${TV_COLORS.up}; }
        .tc-change.dn { color: ${TV_COLORS.down}; }

        .tc-stat {
          display: flex; flex-direction: column; padding: 0 20px;
          border-right: 1px solid ${TV_COLORS.border}; height: 100%; justify-content: center;
        }
        .tc-stat-label { font-size: 11px; color: ${TV_COLORS.textMuted}; margin-bottom: 2px; }
        .tc-stat-val { font-family: 'DM Mono', monospace; font-size: 13px; color: ${TV_COLORS.textPrimary}; }

        /* ── Toolbar row ── */
        .tc-toolbar-row {
          display: flex;
          align-items: center;
          gap: 0;
          background: ${TV_COLORS.panelBg};
          border-bottom: 1px solid ${TV_COLORS.border};
          height: 44px;
          flex-shrink: 0;
          padding: 0 12px;
        }

        .tc-intervals { display: flex; align-items: center; gap: 2px; border-right: 1px solid ${TV_COLORS.border}; padding-right: 12px; margin-right: 12px; }
        .tc-int-btn {
          padding: 4px 10px; border-radius: 4px; font-size: 13px; font-weight: 500;
          background: transparent; border: none; color: ${TV_COLORS.textMuted}; cursor: pointer;
          transition: all 0.15s; font-family: 'DM Sans', sans-serif;
        }
        .tc-int-btn:hover { color: ${TV_COLORS.textPrimary}; }
        .tc-int-btn.active { background: #202838; color: ${TV_COLORS.textPrimary}; }

        .tc-chart-type {
          display: flex; align-items: center; gap: 4px; padding: 5px 10px;
          border-radius: 4px; background: transparent; border: none; color: ${TV_COLORS.textMuted};
          cursor: pointer; border-right: 1px solid ${TV_COLORS.border}; margin-right: 12px; padding-right: 12px;
        }
        .tc-chart-type:hover { color: ${TV_COLORS.textPrimary}; }
        .tc-chart-type svg { width: 18px; height: 18px; }

        .tc-toolbar-btn {
          display: flex; align-items: center; gap: 5px; padding: 5px 10px;
          border-radius: 4px; background: transparent; border: none; color: ${TV_COLORS.textMuted};
          cursor: pointer; font-size: 13px; font-family: 'DM Sans', sans-serif;
          transition: all 0.15s;
        }
        .tc-toolbar-btn:hover { color: ${TV_COLORS.textPrimary}; }
        .tc-toolbar-btn svg { width: 16px; height: 16px; }

        .tc-toolbar-right { margin-left: auto; display: flex; align-items: center; gap: 4px; }
        .tc-icon-btn {
          width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
          border-radius: 4px; background: transparent; border: none; color: ${TV_COLORS.textMuted};
          cursor: pointer; transition: all 0.15s;
        }
        .tc-icon-btn:hover { background: #202838; color: ${TV_COLORS.textPrimary}; }
        .tc-icon-btn svg { width: 18px; height: 18px; }

        /* ── Body ── */
        .tc-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .tc-charts-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* ── OHLC bar ── */
        .tc-ohlc-bar {
          padding: 6px 12px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          background: ${TV_COLORS.panelBgAlt};
          display: flex;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
          border-bottom: 1px solid ${TV_COLORS.grid};
        }
        .tc-ohlc-sym { color: ${TV_COLORS.textPrimary}; font-weight: 500; font-size: 13px; margin-right: 4px; }
        .tc-ohlc-int { color: ${TV_COLORS.textMuted}; font-size: 12px; margin-right: 8px; }
        .tc-ohlc-item { display: flex; align-items: center; gap: 3px; }
        .tc-ohlc-lbl { color: ${TV_COLORS.textMuted}; }
        .tc-ohlc-val-o { color: ${TV_COLORS.textPrimary}; }
        .tc-ohlc-val-h { color: ${TV_COLORS.textPrimary}; }
        .tc-ohlc-val-l { color: ${TV_COLORS.textPrimary}; }
        .tc-ohlc-val-c.up { color: ${TV_COLORS.textPrimary}; }
        .tc-ohlc-val-c.dn { color: ${TV_COLORS.textPrimary}; }
        .tc-ohlc-delta { }
        .tc-ohlc-delta.up { color: ${TV_COLORS.up}; }
        .tc-ohlc-delta.dn { color: ${TV_COLORS.down}; }

        /* ── Chart areas ── */
        .tc-candle-wrap { flex: 1; overflow: hidden; }
        .tc-vol-separator { height: 1px; background: ${TV_COLORS.border}; flex-shrink: 0; display: flex; align-items: center; padding: 0 8px; cursor: row-resize; }
        .tc-vol-label-row { display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: ${TV_COLORS.panelBgAlt}; flex-shrink: 0; }
        .tc-vol-label { font-size: 12px; color: ${TV_COLORS.textMuted}; }
        .tc-vol-val { font-family: 'DM Mono', monospace; font-size: 12px; color: ${TV_COLORS.down}; }
        .tc-vol-wrap { height: 160px; flex-shrink: 0; overflow: hidden; }

        /* ── Bottom bar ── */
        .tc-bottom-bar {
          display: flex; align-items: center; justify-content: space-between;
          background: ${TV_COLORS.panelBg}; border-top: 1px solid ${TV_COLORS.border};
          padding: 6px 16px; height: 36px; flex-shrink: 0;
        }
        .tc-quick-ranges { display: flex; gap: 8px; }
        .tc-qr-btn {
          padding: 3px 8px; border-radius: 3px; font-size: 12px; background: transparent;
          border: none; color: ${TV_COLORS.textMuted}; cursor: pointer; font-family: 'DM Sans', sans-serif;
        }
        .tc-qr-btn:hover { color: ${TV_COLORS.textPrimary}; }
        .tc-bottom-right { display: flex; align-items: center; gap: 12px; }
        .tc-utc { font-family: 'DM Mono', monospace; font-size: 12px; color: ${TV_COLORS.textMuted}; }
        .tc-scale-options { display: flex; gap: 8px; }
        .tc-scale-btn { font-size: 12px; background: transparent; border: none; color: ${TV_COLORS.textMuted}; cursor: pointer; }
        .tc-scale-btn.active { color: ${TV_COLORS.textPrimary}; }

        /* ── TradingView badge ── */
        .tc-tv-badge {
          width: 36px; height: 36px; background: #2a2e3e; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          position: absolute; bottom: 48px; left: 60px;
          font-size: 10px; font-weight: 700; color: #d1d4dc;
          pointer-events: none;
        }
      `}</style>

      <div className="tc-root">
        {/* ── Header ── */}
        <div className="tc-header">
          <div className="tc-token-block">
            <div className="tc-token-icon">{tokenInfo.symbol.slice(0, 2)}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="tc-token-name">{tokenInfo.symbol}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#787b86" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </div>
              <div className="tc-token-full">{tokenInfo.name}</div>
              {tokenInfo.address && (
                <div className="tc-addr">
                  <span>{tokenInfo.address}</span>
                  <button className="tc-copy">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="tc-price-block">
            <div className="tc-price">${tokenInfo.price.toFixed(2)}</div>
            <div className={`tc-change ${isUp ? "up" : "dn"}`}>
              {isUp ? "+" : ""}{tokenInfo.priceChange.toFixed(3)}%
            </div>
          </div>

          {tokenInfo.marketCap && (
            <div className="tc-stat">
              <div className="tc-stat-label">Market Cap</div>
              <div className="tc-stat-val">{tokenInfo.marketCap}</div>
            </div>
          )}
          {tokenInfo.liquidity && (
            <div className="tc-stat">
              <div className="tc-stat-label">Liquidity</div>
              <div className="tc-stat-val">{tokenInfo.liquidity}</div>
            </div>
          )}
          {tokenInfo.volume24h && (
            <div className="tc-stat">
              <div className="tc-stat-label">Volume (24h)</div>
              <div className="tc-stat-val">{tokenInfo.volume24h}</div>
            </div>
          )}
          {tokenInfo.holders && (
            <div className="tc-stat" style={{ borderRight: "none" }}>
              <div className="tc-stat-label">Holders</div>
              <div className="tc-stat-val">{tokenInfo.holders}</div>
            </div>
          )}
        </div>

        {/* ── Toolbar row ── */}
        <div className="tc-toolbar-row">
          <div className="tc-intervals">
            {(["1m", "1h", "4h", "1D"] as const).map((iv) => (
              <button
                key={iv}
                className={`tc-int-btn${interval === iv ? " active" : ""}`}
                onClick={() => setInterval(iv)}
              >
                {iv}
              </button>
            ))}
          </div>

          <button className="tc-chart-type">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="8" width="3" height="8"/><line x1="4.5" y1="6" x2="4.5" y2="8"/><line x1="4.5" y1="16" x2="4.5" y2="18"/>
              <rect x="10" y="5" width="3" height="14"/><line x1="11.5" y1="3" x2="11.5" y2="5"/><line x1="11.5" y1="19" x2="11.5" y2="21"/>
              <rect x="17" y="10" width="3" height="6"/><line x1="18.5" y1="8" x2="18.5" y2="10"/><line x1="18.5" y1="16" x2="18.5" y2="18"/>
            </svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>

          <button className="tc-toolbar-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Indicators
          </button>

          <button className="tc-toolbar-btn" style={{ borderLeft: "1px solid #2a2e3e", marginLeft: 4, paddingLeft: 12 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
            </svg>
            Display
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>

          <div className="tc-toolbar-right">
            {[
              <svg key="tc-target-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" strokeDasharray="2 3"/></svg>,
              <svg key="tc-layout-split-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
              <svg key="tc-layout-grid-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
            ].map((icon, i) => (
              <button key={i} className="tc-icon-btn">{icon}</button>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="tc-body">
          <ToolbarIcons />

          <div className="tc-charts-col">
            {/* OHLC bar */}
            <div className="tc-ohlc-bar">
              <span className="tc-ohlc-sym">{tokenInfo.symbol}</span>
              <span className="tc-ohlc-int">· {interval} · SOLANA</span>
              <span className="tc-ohlc-item">
                <span className="tc-ohlc-lbl">O</span>
                <span className="tc-ohlc-val-o">{ohlc.open.toFixed(4)}</span>
              </span>
              <span className="tc-ohlc-item">
                <span className="tc-ohlc-lbl">H</span>
                <span className="tc-ohlc-val-h">{ohlc.high.toFixed(4)}</span>
              </span>
              <span className="tc-ohlc-item">
                <span className="tc-ohlc-lbl">L</span>
                <span className="tc-ohlc-val-l">{ohlc.low.toFixed(4)}</span>
              </span>
              <span className="tc-ohlc-item">
                <span className="tc-ohlc-lbl">C</span>
                <span className={`tc-ohlc-val-c ${ohlc.close >= ohlc.open ? "up" : "dn"}`}>
                  {ohlc.close.toFixed(4)}
                </span>
              </span>
              <span className={`tc-ohlc-delta ${ohlc.change >= 0 ? "up" : "dn"}`}>
                {ohlc.change >= 0 ? "+" : ""}{ohlc.change.toFixed(5)} ({ohlc.change >= 0 ? "+" : ""}{ohlc.change.toFixed(2)}%)
              </span>
            </div>

            {/* Candlestick chart */}
            <div ref={chartContainerRef} className="tc-candle-wrap" />

            {/* Volume separator */}
            <div style={{ height: 1, background: "#2a2e3e", flexShrink: 0 }} />

            {/* Volume label */}
            <div className="tc-vol-label-row">
              <span className="tc-vol-label">Volume</span>
              <span className="tc-vol-val">
                {((chartData[chartData.length - 1].volume ?? 0) / 1_000_000).toFixed(2)}M
              </span>
            </div>

            {/* Volume chart */}
            <div ref={volumeContainerRef} className="tc-vol-wrap" />
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="tc-bottom-bar">
          <div className="tc-quick-ranges">
            {["3m", "5d", "1d"].map((r) => (
              <button key={r} className="tc-qr-btn">{r}</button>
            ))}
            <button className="tc-qr-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
          </div>
          <div className="tc-bottom-right">
            <span className="tc-utc">{new Date().toISOString().slice(11, 19)} UTC</span>
            <div className="tc-scale-options">
              <button className="tc-scale-btn">%</button>
              <button className="tc-scale-btn">log</button>
              <button className="tc-scale-btn active">auto</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}