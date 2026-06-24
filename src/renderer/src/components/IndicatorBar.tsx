import type { Overlays } from './Chart'

interface Props {
  overlays: Overlays
  onToggle(key: keyof Overlays): void
}

const LABELS: { key: keyof Overlays; label: string }[] = [
  { key: 'ema', label: 'EMA 20/50' },
  { key: 'bb', label: 'Bollinger' },
  { key: 'volume', label: 'Volume' }
]

// Floating indicator toggles over the top-right of the chart.
export default function IndicatorBar({ overlays, onToggle }: Props) {
  return (
    <div className="indicator-bar">
      {LABELS.map(({ key, label }) => (
        <button key={key} className={overlays[key] ? 'active' : ''} onClick={() => onToggle(key)}>
          {label}
        </button>
      ))}
    </div>
  )
}
