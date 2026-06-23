import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DeskContext, Interval, MaskedSettings, SymbolAnalysis } from '@shared/types'
import Chart, { ChartHandle } from './components/Chart'
import SetupOverlay from './components/SetupOverlay'
import SetupPanel from './components/SetupPanel'
import DeskChat from './components/DeskChat'
import TopBar from './components/TopBar'
import SettingsModal from './components/SettingsModal'

const BANNER = 'Hypothesis, not a guarantee. Paper-trade before risking capital. Not financial advice.'

export default function App() {
  const [symbol, setSymbol] = useState('BTCUSDT')
  const [interval, setInterval] = useState<Interval>('1d') // default to Daily
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [analysis, setAnalysis] = useState<SymbolAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  const chartRef = useRef<ChartHandle>(null)

  // apply theme to :root for CSS variables + chart colors
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // load persisted theme from settings once
  useEffect(() => {
    window.desk.getSettings().then((s: MaskedSettings) => setTheme(s.theme))
  }, [])

  const load = useCallback(async (sym: string, iv: Interval) => {
    setLoading(true)
    setError(null)
    try {
      const a = await window.desk.analyze(sym, iv)
      setAnalysis(a)
      setSelectedId(a.firingSetups[0]?.setup.id ?? null)
    } catch (e) {
      setError((e as Error).message)
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(symbol, interval)
  }, [symbol, interval, load])

  const onViewport = useCallback(() => setVersion((v) => v + 1), [])

  const selectedSetup = useMemo(() => {
    if (!analysis) return null
    return analysis.firingSetups.find((f) => f.setup.id === selectedId)?.setup ?? analysis.firingSetups[0]?.setup ?? null
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
              {analysis.meta.source} · {analysis.meta.resolution}
              {analysis.meta.degraded ? ' · degraded→daily' : ''} · {analysis.candles.length} bars
            </div>
          )}
          {error && (
            <div className="chart-badge mono" style={{ top: 40, color: 'var(--bear)' }}>
              {error}
            </div>
          )}
          <Chart ref={chartRef} candles={analysis?.candles ?? []} theme={theme} onViewport={onViewport} />
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
