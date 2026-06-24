import { useState } from 'react'
import type { ResearchDiagnostics, Setup, SetupStats } from '@shared/types'

interface Props {
  setups: { setup: Setup; stats: SetupStats }[]
  diagnostics: ResearchDiagnostics
  selectedId: string | null
  onSelect(id: string): void
  onResearch(): void
  researching: boolean
  loading: boolean
}

function StatRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <span className="mono">{v}</span>
    </div>
  )
}

export default function SetupPanel({
  setups,
  diagnostics,
  selectedId,
  onSelect,
  onResearch,
  researching,
  loading
}: Props) {
  const [openStats, setOpenStats] = useState<Record<string, boolean>>({})
  const firingCount = setups.filter((s) => s.setup.firing).length

  if (loading) {
    return (
      <div className="glass">
        <h3 className="section-title">Setups</h3>
        <div className="shimmer" style={{ width: '70%' }} />
        <div className="shimmer" style={{ width: '90%' }} />
        <div className="shimmer" style={{ width: '50%' }} />
      </div>
    )
  }

  return (
    <div className="glass">
      <div className="panel-head">
        <h3 className="section-title" style={{ margin: 0 }}>
          Setups {setups.length > 0 ? `· ${firingCount} firing` : ''}
        </h3>
        <button className="tiny" onClick={onResearch} disabled={researching}>
          {researching ? 'Researching…' : '⟳ Run research'}
        </button>
      </div>

      {setups.length === 0 ? (
        <div className="diag">
          <p style={{ marginTop: 0 }}>No validated setups for this symbol/timeframe yet.</p>
          <StatRow k="candidates tested" v={String(diagnostics.candidatesTested)} />
          <StatRow k="failed (no entry trigger)" v={String(diagnostics.failedNoEntryTrigger)} />
          <StatRow k="failed in-sample" v={String(diagnostics.failedInSample)} />
          <StatRow k="failed out-of-sample" v={String(diagnostics.failedOutOfSample)} />
          <StatRow k="flagged overfit (withheld)" v={String(diagnostics.flaggedOverfit)} />
          <StatRow k="promoted (validated)" v={String(diagnostics.promoted)} />
          <p style={{ color: 'var(--bone-dim)', marginBottom: 0 }}>
            Nothing survived out-of-sample validation on this data. Try Daily for more history, or hit Run research.
          </p>
        </div>
      ) : (
        setups.map(({ setup, stats }) => {
          const open = !!openStats[setup.id]
          return (
            <div
              key={setup.id}
              className={`setup-card ${selectedId === setup.id ? 'selected' : ''}`}
              onClick={() => onSelect(setup.id)}
            >
              <div className="setup-head">
                <strong>
                  {setup.firing && <span style={{ color: 'var(--bull)' }}>● </span>}
                  {setup.name}
                </strong>
                <span className={`dir ${setup.direction}`}>{setup.direction.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--bone-dim)', margin: '2px 0 6px' }}>{setup.reasoning}</div>
              <StatRow k="entry" v={String(setup.entryPrice)} />
              <StatRow k="stop" v={String(setup.stopPrice)} />
              <StatRow k="target" v={String(setup.targetPrice)} />
              <StatRow k="R:R" v={`1:${setup.riskReward}`} />

              <button
                style={{ marginTop: 8, width: '100%' }}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenStats((s) => ({ ...s, [setup.id]: !s[setup.id] }))
                }}
              >
                {open ? 'Hide stats' : 'Show stats'}
              </button>

              {open && (
                <div className="stats">
                  <StatRow k="OOS win rate" v={`${(stats.winRate * 100).toFixed(0)}%`} />
                  <StatRow k="sample size" v={`${stats.sampleSize} trades`} />
                  <StatRow k="avg R:R" v={String(stats.avgRiskReward)} />
                  <StatRow k="profit factor" v={String(stats.profitFactor)} />
                  <StatRow k="in-sample win" v={`${(stats.inSampleWinRate * 100).toFixed(0)}%`} />
                  <StatRow k="out-of-sample win" v={`${(stats.outOfSampleWinRate * 100).toFixed(0)}%`} />
                  {stats.sampleSize < 10 && (
                    <div className="overfit-flag">⚠ Small sample ({stats.sampleSize}) — treat with caution.</div>
                  )}
                  {stats.overfit && <div className="overfit-flag">⚠ {stats.overfitReason}</div>}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
