import { useEffect, useRef, useState } from 'react'
import type { Interval, Ticker } from '@shared/types'

interface Props {
  symbol: string
  interval: Interval
  onPick(symbol: string): void
}

const WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AAPL', 'NVDA', 'SPY', 'EURUSD=X']

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800
}

function fmtCountdown(sec: number): string {
  if (sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// Slim TradingView-style ticker tape (other assets with green/red %) plus an IST
// clock and a live countdown to the next candle close.
export default function TickerBar({ symbol, interval, onPick }: Props) {
  const [tickers, setTickers] = useState<Record<string, Ticker>>({})
  const [now, setNow] = useState(Date.now())
  const tickRef = useRef<number>()

  useEffect(() => {
    let stop = false
    const load = async () => {
      const list = WATCHLIST.includes(symbol) ? WATCHLIST : [symbol, ...WATCHLIST]
      for (const s of list) {
        try {
          const t = await window.desk.getTicker(s)
          if (!stop) setTickers((prev) => ({ ...prev, [s]: t }))
        } catch {
          /* skip unreachable symbol */
        }
      }
    }
    load()
    const id = window.setInterval(load, 15000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [symbol])

  useEffect(() => {
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tickRef.current)
  }, [])

  const nowSec = Math.floor(now / 1000)
  const iv = INTERVAL_SECONDS[interval]
  const remaining = Math.ceil(nowSec / iv) * iv - nowSec
  const ist = new Date(now).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  const list = WATCHLIST.includes(symbol) ? WATCHLIST : [symbol, ...WATCHLIST]

  return (
    <div className="ticker-bar mono">
      <div className="ticker-tape">
        {list.map((s) => {
          const t = tickers[s]
          const chg = t?.changePct ?? 0
          return (
            <button
              key={s}
              className={`ticker-item ${s === symbol ? 'active' : ''}`}
              onClick={() => onPick(s)}
              title={`Switch to ${s}`}
            >
              <span className="tk-sym">{s.replace('=X', '').replace('USDT', '')}</span>
              <span className="tk-px">{t ? t.price : '—'}</span>
              <span className={chg >= 0 ? 'up' : 'down'}>
                {t ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : ''}
              </span>
            </button>
          )
        })}
      </div>
      <div className="ticker-clock">
        <span title="Next candle closes in">⏱ {fmtCountdown(remaining)}</span>
        <span title="India Standard Time">IST {ist}</span>
      </div>
    </div>
  )
}
