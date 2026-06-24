import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Candle, DeskContext, Interval, MaskedSettings, SymbolAnalysis } from '@shared/types'
import Chart, { ChartHandle } from './components/Chart'
import SetupOverlay from './components/SetupOverlay'
import SetupPanel from './components/SetupPanel'
import DeskChat from './components/DeskChat'
import TopBar from './components/TopBar'
import SettingsModal from './components/SettingsModal'

const BANNER = 'Hypothesis, not a guarantee. Paper-trade before risking capital. Not financial advice.'
const LIVE_POLL_MS = 15000 // refresh candles
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
      setSelectedId(a.firingSetups[0]?.setup.id ?? null)
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

  // Live quote polling — ticks the most recent (forming) bar so the chart moves
  // in real time without re-fetching the whole series or re-running the engine.
  useEffect(() => {
    if (error) return
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
  }, [symbol, interval, error])

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
    return (
      analysis.firingSetups.find((f) => f.setup.id === selectedId)?.setup ??
      analysis.firingSetups[0]?.setup ??
      null
    )
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
          <Chart ref={chartRef} candles={candles} theme={theme} onViewport={onViewport} fitKey={fitKey} />
          <SetupOverlay chartRef={chartRef} version={version} setup={selectedSetup} />
        </div>

        <div className="side">
          <SetupPanel
            firing={analysis?.firingSetups ?? []}
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
            loading={loading}
          />
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
