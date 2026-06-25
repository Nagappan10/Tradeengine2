import { useEffect, useRef, useState } from 'react'
import type { Interval } from '@shared/types'

interface Hit {
  symbol: string
  name: string
}

interface Props {
  symbol: string
  interval: Interval
  theme: 'dark' | 'light'
  onPick(symbol: string): void
  onInterval(i: Interval): void
  onToggleTheme(): void
  onOpenSettings(): void
}

const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w']

export default function TopBar({
  symbol,
  interval,
  theme,
  onPick,
  onInterval,
  onToggleTheme,
  onOpenSettings
}: Props) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [ist, setIst] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () =>
      setIst(
        new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      )
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let active = true
    window.desk.searchSymbols(q).then((r) => {
      if (active) setHits(r)
    })
    return () => {
      active = false
    }
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (s: string) => {
    onPick(s)
    setOpen(false)
    setQ('')
  }

  return (
    <div className="topbar">
      <span className="brand mono">▚ STRATEGY DESK</span>

      <div className="search-wrap" ref={wrapRef}>
        <input
          value={q}
          placeholder={`Search symbol (current: ${symbol})`}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) pick(q.trim().toUpperCase())
          }}
        />
        {open && hits.length > 0 && (
          <div className="search-results">
            {hits.map((h) => (
              <div key={h.symbol} onClick={() => pick(h.symbol)}>
                <strong className="mono">{h.symbol}</strong>
                <span style={{ color: 'var(--bone-dim)', marginLeft: 8, fontSize: 12 }}>{h.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tf-group">
        {INTERVALS.map((i) => (
          <button key={i} className={interval === i ? 'active' : ''} onClick={() => onInterval(i)}>
            {i}
          </button>
        ))}
      </div>

      <div className="spacer" />

      <span className="ist-clock mono" title="India Standard Time (live)">
        🇮🇳 IST {ist}
      </span>

      <span className="build-tag mono" title="Build version — compare with the GitHub Release you installed">
        v3.0 · {__APP_BUILD__}
      </span>

      <button onClick={onToggleTheme} title="Toggle theme">
        {theme === 'dark' ? '☾ dark' : '☀ light'}
      </button>
      <button onClick={onOpenSettings}>⚙ Settings</button>
    </div>
  )
}
