'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  IChartApi,
} from 'lightweight-charts';

export default function LightweightChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Create chart
    const chart = createChart(containerRef.current, {
      layout: {
        textColor: 'white',
        background: { type: ColorType.Solid, color: 'black' },
      },
      width: containerRef.current.clientWidth,
      height: 400,
    });

    chartRef.current = chart;

    // 2. Add a candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // 3. Set data
    candleSeries.setData([
      { time: '2024-01-01', open: 100, high: 110, low: 95, close: 105 },
      { time: '2024-01-02', open: 105, high: 115, low: 100, close: 108 },
      { time: '2024-01-03', open: 108, high: 120, low: 104, close: 118 },
      { time: '2024-01-04', open: 118, high: 122, low: 110, close: 112 },
      { time: '2024-01-05', open: 112, high: 116, low: 106, close: 114 },
    ]);

    // 4. Fit content
    chart.timeScale().fitContent();

    // 5. Handle resize
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // 6. Cleanup on unmount — CRITICAL to avoid memory leaks
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height: '400px' }} />;
}