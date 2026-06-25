import type { Overlays } from './Chart'

interface Props {
  overlays: Overlays
  onToggle(key: keyof Overlays): void
  showStrategy: boolean
  onToggleStrategy(): void
}

const LABELS: { key: keyof Overlays; label: string }[] = [
  { key: 'ema', label: 'EMA 20/50' },
  { key: 'bb', label: 'Bollinger' },
  { key: 'volume', label: 'Volume' }
]

// Chart controls: a prominent Strategy on/off toggle (clean chart by default) plus
// the indicator toggles.
export default function IndicatorBar({ overlays, onToggle, showStrategy, onToggleStrategy }: Props) {
  return (
    <div className="indicator-bar">
      <button className={`strat-toggle ${showStrategy ? 'active' : ''}`} onClick={onToggleStrategy}>
        {showStrategy ? '◧ Strategy ON' : '◧ Strategy'}
      </button>
      <span className="ib-divider" />
      {LABELS.map(({ key, label }) => (
        <button key={key} className={overlays[key] ? 'active' : ''} onClick={() => onToggle(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}
