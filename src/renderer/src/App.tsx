import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Candle, DeskContext, Interval, MaskedSettings, SymbolAnalysis } from '@shared/types'
import Chart, { ChartHandle, Overlays } from './components/Chart'
import SetupOverlay from './components/SetupOverlay'
import SetupPanel from './components/SetupPanel'
import SignalsCard from './components/SignalsCard'
import IndicatorBar from './components/IndicatorBar'
import DeskChat from './components/DeskChat'
import TopBar from './components/TopBar'
import SettingsModal from './components/SettingsModal'

const BANNER = 'Hypothesis, not a guarantee. Paper-trade before risking capital. Not financial advice.'
const LIVE_POLL_MS = 5000 // tick the live price
const SOFT_REFRESH_MS = 60000 // refresh firing setups / ML

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [interval, setInterval] = useState<Interval>('1d')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [analysis, setAnalysis] = useState<SymbolAnalysis | null>(null)
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [live, setLive] = useState(false)
  const [researching, setResearching] = useState(false)
  const [overlays, setOverlays] = useState<Overlays>({ ema: true, bb: false, volume: true })

  const chartRef = useRef<ChartHandle>(null)
  const fitKey = `${symbol}|${interval}`

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    window.desk.getSettings().then((s: MaskedSettings) => setTheme(s.theme))
  }, [])

  const load = useCallback(async (sym: string, iv: Interval) => {
    setLoading(true)
    setError(null)
    try {
      const a = await window.desk.analyze(sym, iv)
      setAnalysis(a)
      setCandles(a.candles)
      // Default selection: a firing setup if any, else the best promoted setup,
      // so the chart always has markup drawn on it.
      setSelectedId(a.firingSetups[0]?.setup.id ?? a.promotedSetups[0]?.setup.id ?? null)
    } catch (e) {
      setError((e as Error).message)
      setAnalysis(null)
      setCandles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(symbol, interval)
  }, [symbol, interval, load])

  const [streaming, setStreaming] = useState(false)

  // Merge a live bar into the series: replace the forming bar, or append a new one.
  const applyLiveBar = useCallback((c: Candle) => {
    setCandles((prev) => {
      if (!prev.length) return prev
      const next = prev.slice()
      const last = next[next.length - 1]
      if (c.time === last.time) next[next.length - 1] = c
      else if (c.time > last.time) next.push(c)
      else return prev
      return next
    })
  }, [])

  // Real-time Binance WebSocket for crypto — true tick-by-tick updates.
  useEffect(() => {
    let unsub: (() => void) | null = null
    let cancelled = false
    setStreaming(false)
    window.desk.subscribeStream(symbol, interval).then((active) => {
      if (cancelled) return
      setStreaming(active)
      setLive(active)
    })
    unsub = window.desk.onStreamCandle((candle) => {
      applyLiveBar(candle)
      setLive(true)
    })
    return () => {
      cancelled = true
      if (unsub) unsub()
      window.desk.unsubscribeStream()
    }
  }, [symbol, interval, applyLiveBar])

  // Fallback quote polling for non-crypto (no WebSocket) — ticks the forming bar.
  useEffect(() => {
    if (error || streaming) return
    let stop = false
    const tick = async () => {
      try {
        const q = await window.desk.getQuote(symbol)
        if (stop || !q.price) return
        setLive(true)
        setCandles((prev) => {
          if (!prev.length) return prev
          const next = prev.slice()
          const last = { ...next[next.length - 1] }
          last.close = q.price
          last.high = Math.max(last.high, q.price)
          last.low = Math.min(last.low, q.price)
          next[next.length - 1] = last
          return next
        })
      } catch {
        if (!stop) setLive(false)
      }
    }
    const id = window.setInterval(tick, LIVE_POLL_MS)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [symbol, interval, error, streaming])

  // Periodic soft refresh of firing setups / ML (no loading shimmer).
  useEffect(() => {
    if (error) return
    const id = window.setInterval(async () => {
      try {
        const a = await window.desk.analyze(symbol, interval)
        setAnalysis(a)
        setCandles(a.candles)
      } catch {
        /* keep last good analysis */
      }
    }, SOFT_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [symbol, interval, error])

  const onViewport = useCallback(() => setVersion((v) => v + 1), [])

  const selectedSetup = useMemo(() => {
    if (!analysis) return null
    const list = analysis.promotedSetups
    return list.find((f) => f.setup.id === selectedId)?.setup ?? list[0]?.setup ?? null
  }, [analysis, selectedId])

  const deskCtx: DeskContext | null = useMemo(() => {
    if (!analysis) return null
    return {
      symbol,
      interval,
      firingSetups: analysis.firingSetups,
      zones: analysis.zones,
      ml: analysis.ml,
      source: analysis.meta.source,
      resolution: analysis.meta.resolution
    }
  }, [analysis, symbol, interval])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    window.desk.saveSettings({ theme: next })
  }

  const runResearch = async () => {
    if (researching) return
    setResearching(true)
    try {
      await window.desk.runResearch(symbol, interval)
      await load(symbol, interval)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setResearching(false)
    }
  }

  const toggleOverlay = (key: keyof Overlays) => setOverlays((o) => ({ ...o, [key]: !o[key] }))

  const lastPrice = candles.length ? candles[candles.length - 1].close : null

  return (
    <div className="app">
      <TopBar
        symbol={symbol}
        interval={interval}
        theme={theme}
        onPick={setSymbol}
        onInterval={setInterval}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="body">
        <div className="chart-host">
          {analysis && (
            <div className="chart-badge mono">
              <span className={`live-dot ${live ? 'on' : ''}`} />
              {symbol} · {analysis.meta.source} · {analysis.meta.resolution}
              {streaming ? ' · live stream' : ' · delayed'}
              {analysis.meta.degraded ? ' · degraded→daily' : ''}
              {lastPrice != null ? ` · ${lastPrice}` : ''} · {candles.length} bars
            </div>
          )}
          {error && (
            <div className="chart-badge mono" style={{ top: 44, color: 'var(--bear)' }}>
              {error}
            </div>
          )}
          {loading && !analysis && (
            <div className="chart-badge mono" style={{ top: 44 }}>
              loading…
            </div>
          )}
          <IndicatorBar overlays={overlays} onToggle={toggleOverlay} />
          <Chart
            ref={chartRef}
            candles={candles}
            theme={theme}
            overlays={overlays}
            onViewport={onViewport}
            fitKey={fitKey}
          />
          <SetupOverlay chartRef={chartRef} version={version} setup={selectedSetup} zones={analysis?.zones ?? []} />
        </div>

        <div className="side">
          <SetupPanel
            setups={analysis?.promotedSetups ?? []}
            diagnostics={
              analysis?.diagnostics ?? {
                candidatesTested: 0,
                failedInSample: 0,
                failedOutOfSample: 0,
                failedNoEntryTrigger: 0,
                flaggedOverfit: 0,
                promoted: 0
              }
            }
            selectedId={selectedId}
            onSelect={setSelectedId}
            onResearch={runResearch}
            researching={researching}
            loading={loading}
          />
          <SignalsCard ml={analysis?.ml ?? null} decay={analysis?.decay ?? []} />
          <DeskChat ctx={deskCtx} />
        </div>
      </div>

      <div className="banner mono">{BANNER}</div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onSaved={(s) => setTheme(s.theme)} />
      )}
    </div>
  )
}
