import { useState } from 'react'
import type { Candle } from '@shared/types'

interface Props {
  symbol: string
  candles: Candle[]
}

// A small closable TradingView-style P/L readout: live price plus change vs the
// previous bar and over the whole loaded period, with period high/low.
export default function StatsWidget({ symbol, candles }: Props) {
  const [open, setOpen] = useState(true)
  if (candles.length < 2) return null

  const last = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const first = candles[0]
  const dayChg = ((last.close - prev.close) / prev.close) * 100
  const periodChg = ((last.close - first.close) / first.close) * 100
  const hi = Math.max(...candles.map((c) => c.high))
  const lo = Math.min(...candles.map((c) => c.low))
  const cls = (v: number) => (v >= 0 ? 'up' : 'down')
  const sign = (v: number) => (v >= 0 ? '+' : '')

  if (!open) {
    return (
      <button className="stats-toggle mono" onClick={() => setOpen(true)} title="Show P/L">
        {symbol} <span className={cls(dayChg)}>{sign(dayChg)}{dayChg.toFixed(2)}%</span>
      </button>
    )
  }

  return (
    <div className="stats-widget glass">
      <div className="stats-head">
        <strong className="mono">{symbol}</strong>
        <button className="x" onClick={() => setOpen(false)} title="Close">
          ✕
        </button>
      </div>
      <div className="stats-price mono">{last.close}</div>
      <div className="kv">
        <span>last bar</span>
        <span className={`mono ${cls(dayChg)}`}>{sign(dayChg)}{dayChg.toFixed(2)}%</span>
      </div>
      <div className="kv">
        <span>period</span>
        <span className={`mono ${cls(periodChg)}`}>{sign(periodChg)}{periodChg.toFixed(2)}%</span>
      </div>
      <div className="kv">
        <span>high</span>
        <span className="mono">{hi}</span>
      </div>
      <div className="kv">
        <span>low</span>
        <span className="mono">{lo}</span>
      </div>
    </div>
  )
}
