import { createChart, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { Candle } from '@shared/types'
import { bollinger, ema } from '@shared/indicators'

export interface ChartHandle {
  priceToY(price: number): number | null
  timeToX(time: number): number | null
  size(): { width: number; height: number }
}

export interface Overlays {
  ema: boolean
  bb: boolean
  volume: boolean
}

interface Props {
  candles: Candle[]
  theme: 'dark' | 'light'
  overlays: Overlays
  onViewport(): void
  fitKey: string
}

function palette(theme: 'dark' | 'light') {
  return theme === 'dark'
    ? { bg: '#14130F', text: '#9a9485', grid: 'rgba(58,53,42,0.4)', up: '#5FB99A', down: '#E06C5E', amber: '#E8A33D', dim: '#9a9485' }
    : { bg: '#F4F1E9', text: '#6c6555', grid: 'rgba(216,209,191,0.6)', up: '#2f8f6e', down: '#c0493b', amber: '#c47d18', dim: '#6c6555' }
}

const Chart = forwardRef<ChartHandle, Props>(({ candles, theme, overlays, onViewport, fitKey }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const emaFastRef = useRef<ISeriesApi<'Line'> | null>(null)
  const emaSlowRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bbUpRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLoRef = useRef<ISeriesApi<'Line'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
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
    // Volume on its own scale pinned to the bottom 18% of the pane.
    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    const emaFast = chart.addLineSeries({ color: c.amber, lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    const emaSlow = chart.addLineSeries({ color: '#6aa0d8', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    const bbUp = chart.addLineSeries({ color: c.dim, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
    const bbLo = chart.addLineSeries({ color: c.dim, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })

    chartRef.current = chart
    seriesRef.current = series
    volRef.current = vol
    emaFastRef.current = emaFast
    emaSlowRef.current = emaSlow
    bbUpRef.current = bbUp
    bbLoRef.current = bbLo

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

  // theme
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
    emaFastRef.current?.applyOptions({ color: c.amber })
    bbUpRef.current?.applyOptions({ color: c.dim })
    bbLoRef.current?.applyOptions({ color: c.dim })
    onViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // data + indicators
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    series.setData(
      candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close }))
    )
    const c = palette(themeRef.current)
    const times = candles.map((k) => k.time as UTCTimestamp)
    const closes = candles.map((k) => k.close)

    volRef.current?.setData(
      candles.map((k) => ({
        time: k.time as UTCTimestamp,
        value: k.volume,
        color: (k.close >= k.open ? c.up : c.down) + '66'
      }))
    )
    const setLine = (s: ISeriesApi<'Line'> | null, vals: (number | null)[]) =>
      s?.setData(times.map((t, i) => ({ time: t, value: vals[i] })).filter((p) => p.value != null) as { time: UTCTimestamp; value: number }[])

    setLine(emaFastRef.current, ema(closes, 20))
    setLine(emaSlowRef.current, ema(closes, 50))
    const bb = bollinger(closes, 20, 2)
    setLine(bbUpRef.current, bb.upper)
    setLine(bbLoRef.current, bb.lower)

    if (fitKey !== lastFitKey.current) {
      chartRef.current?.timeScale().fitContent()
      lastFitKey.current = fitKey
    }
    onViewport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, fitKey])

  // toggle indicator visibility
  useEffect(() => {
    emaFastRef.current?.applyOptions({ visible: overlays.ema })
    emaSlowRef.current?.applyOptions({ visible: overlays.ema })
    bbUpRef.current?.applyOptions({ visible: overlays.bb })
    bbLoRef.current?.applyOptions({ visible: overlays.bb })
    volRef.current?.applyOptions({ visible: overlays.volume })
  }, [overlays])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
})

Chart.displayName = 'Chart'
export default Chart
