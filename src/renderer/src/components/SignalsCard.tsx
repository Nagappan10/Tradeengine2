import type { DecayStatus, MlSignal } from '@shared/types'

interface Props {
  ml: MlSignal | null
  decay: DecayStatus[]
}

// Secondary signals: the fragile ML probability and any decaying setups.
export default function SignalsCard({ ml, decay }: Props) {
  const decaying = decay.filter((d) => d.decaying)
  const pct = ml ? Math.round(ml.probabilityUp * 100) : 50
  return (
    <div className="glass">
      <h3 className="section-title">Secondary signals</h3>

      <div className="kv">
        <span>ML P(up) · fragile</span>
        <span className="mono">{ml?.available ? `${pct}%` : 'n/a'}</span>
      </div>
      {ml?.available && (
        <div className="ml-bar" aria-hidden>
          <div className="ml-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p style={{ fontSize: 11, color: 'var(--bone-dim)', margin: '6px 0 10px' }}>{ml?.note ?? '—'}</p>

      <div className="kv">
        <span>decay watch</span>
        <span className="mono">{decaying.length ? `${decaying.length} fading` : 'all stable'}</span>
      </div>
      {decaying.slice(0, 3).map((d) => (
        <div key={d.setupId} className="overfit-flag" style={{ marginTop: 4 }}>
          ⚠ {d.setupName}: {Math.round(d.rollingWinRate * 100)}% vs {Math.round(d.baselineWinRate * 100)}% baseline
        </div>
      ))}
    </div>
  )
}
