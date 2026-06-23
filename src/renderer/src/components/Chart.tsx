import {
  CandlestickSeriesPartialOptions,
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp
} from 'lightweight-charts'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Candle, Trade } from '@shared/types'

export interface ChartHandle {
  priceToY(price: number): number | null
  timeToX(time: number): number | null
  size(): { width: number; height: number }
}

interface Props {
  candles: Candle[]
  trades?: Trade[]
  theme: 'dark' | 'light'
  onViewport(): void
}

const darkColors = {
  bg: '#14130F',
  text: '#9a9485',
  grid: 'rgba(58,53,42,0.4)',
  up: '#5FB99A',
  down: '#E06C5E'
}
const lightColors = {
  bg: '#F4F1E9',
  text: '#6c6555',
  grid: 'rgba(216,209,191,0.6)',
  up: '#2f8f6e',
  down: '#c0493b'
}

const Chart = forwardRef<ChartHandle, Props>(({ candles, trades, theme, onViewport }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useImperativeHandle(ref, () => ({
    priceToY: (price: number) => {
      const c = seriesRef.current?.priceToCoordinate(price)
      return c == null ? null : (c as number)
    },
    timeToX: (time: number) => {
      const c = chartRef.current?.timeScale().timeToCoordinate(time as UTCTimestamp)
      return c == null ? null : (c as number)
    },
    size: () => ({
      width: hostRef.current?.clientWidth ?? 0,
      height: hostRef.current?.clientHeight ?? 0
    })
  }))

  // create chart once
  useEffect(() => {
    if (!hostRef.current) return
    const colors = theme === 'dark' ? darkColors : lightColors
    const chart = createChart(hostRef.current, {
      width: hostRef.current.clientWidth,
      height: hostRef.current.clientHeight,
      layout: { background: { color: colors.bg }, textColor: colors.text, fontFamily: 'SF Mono, Menlo, monospace' },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.grid },
      timeScale: { borderColor: colors.grid, timeVisible: true, rightOffset: 6 },
      crosshair: { mode: 0 }
    })
    const seriesOpts: CandlestickSeriesPartialOptions = {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down
    }
    const series = chart.addCandlestickSeries(seriesOpts)
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
  }, [theme])

  // update data
  useEffect(() => {
    if (!seriesRef.current) return
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      }))
    )
    if (trades && trades.length) {
      seriesRef.current.setMarkers(
        trades.flatMap((t) => [
          {
            time: t.entryTime as UTCTimestamp,
            position: t.direction === 'long' ? ('belowBar' as const) : ('aboveBar' as const),
            color: t.direction === 'long' ? darkColors.up : darkColors.down,
            shape: t.direction === 'long' ? ('arrowUp' as const) : ('arrowDown' as const),
            text: 'in'
          },
          {
            time: t.exitTime as UTCTimestamp,
            position: 'aboveBar' as const,
            color: t.returnPct >= 0 ? darkColors.up : darkColors.down,
            shape: 'circle' as const,
            text: t.returnPct >= 0 ? 'win' : 'loss'
          }
        ])
      )
    } else {
      seriesRef.current.setMarkers([])
    }
    chartRef.current?.timeScale().fitContent()
    onViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, trades])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
})

Chart.displayName = 'Chart'
export default Chart
