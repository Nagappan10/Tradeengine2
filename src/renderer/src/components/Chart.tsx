import { createChart, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Candle } from '@shared/types'

export interface ChartHandle {
  priceToY(price: number): number | null
  timeToX(time: number): number | null
  size(): { width: number; height: number }
}

interface Props {
  candles: Candle[]
  theme: 'dark' | 'light'
  onViewport(): void
  fitKey: string // changes when symbol/interval changes -> refit; stays stable on live ticks
}

function palette(theme: 'dark' | 'light') {
  return theme === 'dark'
    ? { bg: '#14130F', text: '#9a9485', grid: 'rgba(58,53,42,0.4)', up: '#5FB99A', down: '#E06C5E' }
    : { bg: '#F4F1E9', text: '#6c6555', grid: 'rgba(216,209,191,0.6)', up: '#2f8f6e', down: '#c0493b' }
}

const Chart = forwardRef<ChartHandle, Props>(({ candles, theme, onViewport, fitKey }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lastFitKey = useRef<string>('')
  const themeRef = useRef(theme)
  themeRef.current = theme

  useImperativeHandle(ref, () => ({
    priceToY: (price: number) => {
      const c = seriesRef.current?.priceToCoordinate(price)
      return c == null ? null : (c as number)
    },
    timeToX: (time: number) => {
      const c = chartRef.current?.timeScale().timeToCoordinate(time as UTCTimestamp)
      return c == null ? null : (c as number)
    },
    size: () => ({ width: hostRef.current?.clientWidth ?? 0, height: hostRef.current?.clientHeight ?? 0 })
  }))

  // Create the chart ONCE. Theme + data are applied by the effects below, so a
  // theme toggle never tears down the series (which previously blanked the candles).
  useEffect(() => {
    if (!hostRef.current) return
    const c = palette(themeRef.current)
    const chart = createChart(hostRef.current, {
      width: hostRef.current.clientWidth,
      height: hostRef.current.clientHeight,
      layout: { background: { color: c.bg }, textColor: c.text, fontFamily: 'SF Mono, Menlo, monospace' },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.grid },
      timeScale: { borderColor: c.grid, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: 0 }
    })
    const series = chart.addCandlestickSeries({
      upColor: c.up,
      downColor: c.down,
      borderUpColor: c.up,
      borderDownColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down
    })
    chartRef.current = chart
    seriesRef.current = series

    const fire = () => onViewport()
    chart.timeScale().subscribeVisibleTimeRangeChange(fire)
    const ro = new ResizeObserver(() => {
      if (!hostRef.current) return
      chart.applyOptions({ width: hostRef.current.clientWidth, height: hostRef.current.clientHeight })
      fire()
    })
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply theme colours live, without recreating the chart.
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    const c = palette(theme)
    chart.applyOptions({
      layout: { background: { color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.grid },
      timeScale: { borderColor: c.grid }
    })
    series.applyOptions({
      upColor: c.up,
      downColor: c.down,
      borderUpColor: c.up,
      borderDownColor: c.down,
      wickUpColor: c.up,
      wickDownColor: c.down
    })
    onViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // Push data on every change (including live ticks). Only refit the viewport when
  // the symbol/interval changes, so live updates don't yank the user's zoom/pan.
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      }))
    )
    if (fitKey !== lastFitKey.current) {
      chartRef.current?.timeScale().fitContent()
      lastFitKey.current = fitKey
    }
    onViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, fitKey])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
})

Chart.displayName = 'Chart'
export default Chart
