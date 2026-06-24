import { RefObject, useMemo } from 'react'
import type { Setup, Trendline, Zone } from '@shared/types'
import type { ChartHandle } from './Chart'

export interface Drawing {
  id: string
  kind: 'trend' | 'hline'
  t1: number
  p1: number
  t2: number
  p2: number
}

interface Props {
  chartRef: RefObject<ChartHandle>
  version: number // bumped whenever the chart viewport/size changes -> forces re-map
  setup: Setup | null
  zones: Zone[]
  trendlines: Trendline[]
  drawings: Drawing[]
}

// Draws the full strategy markup directly on the candles:
// green support box, red resistance box, dashed entry line, green target box,
// red stop box and a small label. Re-maps prices->pixels on every viewport change.
export default function SetupOverlay({ chartRef, version, setup, zones, trendlines, drawings }: Props) {
  const geom = useMemo(() => {
    const api = chartRef.current
    if (!api) return null
    const { width, height } = api.size()
    if (width === 0 || height === 0) return null

    const clamp = (y: number | null): number | null => (y == null ? null : Math.max(0, Math.min(height, y)))

    // Map the detected S/R zones so they're always visible, even with no setup.
    const zoneRects = zones.slice(0, 8).map((z) => ({
      kind: z.kind,
      touches: z.touches,
      yLow: clamp(api.priceToY(z.low)),
      yHigh: clamp(api.priceToY(z.high))
    }))

    // Map a (t1,p1)-(t2,p2) segment to pixels, extended to the right edge.
    const seg = (t1: number, p1: number, t2: number, p2: number) => {
      const x1 = api.timeToX(t1)
      const y1 = api.priceToY(p1)
      const x2 = api.timeToX(t2)
      const y2 = api.priceToY(p2)
      if (x1 == null || y1 == null || x2 == null || y2 == null) return null
      if (x2 === x1) return { x1, y1, x2, y2 }
      const yRight = y1 + ((y2 - y1) * (width - x1)) / (x2 - x1)
      return { x1, y1, x2: width, y2: yRight }
    }

    const tlSegs = trendlines
      .map((t) => ({ kind: t.kind, touches: t.touches, s: seg(t.t1, t.p1, t.t2, t.p2) }))
      .filter((t) => t.s)
    const drawSegs = drawings.map((d) => ({ id: d.id, kind: d.kind, s: seg(d.t1, d.p1, d.t2, d.p2) })).filter((d) => d.s)

    if (!setup) return { width, height, zoneRects, setupGeom: null, tlSegs, drawSegs }

    // Project the R:R boxes in the left-centre so the floating glass panel on the
    // right doesn't hide them.
    const projX = Math.round(width * 0.32)
    const projW = Math.round(width * 0.28)
    const setupGeom = {
      yEntry: clamp(api.priceToY(setup.entryPrice)),
      yStop: clamp(api.priceToY(setup.stopPrice)),
      yTarget: clamp(api.priceToY(setup.targetPrice)),
      ySupLow: clamp(api.priceToY(setup.supportZone.low)),
      ySupHigh: clamp(api.priceToY(setup.supportZone.high)),
      yResLow: clamp(api.priceToY(setup.resistanceZone.low)),
      yResHigh: clamp(api.priceToY(setup.resistanceZone.high)),
      projX,
      projW
    }
    return { width, height, zoneRects, setupGeom, tlSegs, drawSegs }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, setup, zones, trendlines, drawings, chartRef])

  if (!geom) return null

  const bull = getComputedStyle(document.documentElement).getPropertyValue('--bull').trim() || '#5FB99A'
  const bear = getComputedStyle(document.documentElement).getPropertyValue('--bear').trim() || '#E06C5E'

  const rect = (
    x: number,
    yA: number | null,
    yB: number | null,
    fill: string,
    opacity: number,
    w: number
  ) => {
    if (yA == null || yB == null) return null
    const top = Math.min(yA, yB)
    const h = Math.max(2, Math.abs(yA - yB))
    return (
      <rect x={x} y={top} width={w} height={h} fill={fill} fillOpacity={opacity} stroke={fill} strokeOpacity={0.5} rx={2} className="setup-rect" />
    )
  }

  const sg = geom.setupGeom

  return (
    <svg className="overlay" width={geom.width} height={geom.height} style={{ pointerEvents: 'none' }}>
      <style>{`.setup-rect{transition:opacity .3s ease} .setup-line{transition:opacity .3s ease}`}</style>

      {/* Auto-detected diagonal trendlines (labelled with touch count). */}
      {geom.tlSegs.map((t, i) =>
        t.s ? (
          <g key={`tl${i}`}>
            <line
              x1={t.s.x1}
              y1={t.s.y1}
              x2={t.s.x2}
              y2={t.s.y2}
              stroke={t.kind === 'support' ? bull : bear}
              strokeWidth={1.5}
              strokeOpacity={0.8}
            />
            <text x={t.s.x1 + 4} y={t.s.y1 - 4} fill={t.kind === 'support' ? bull : bear} fontSize={10} fontFamily="monospace">
              {t.kind} trend · {t.touches} touches
            </text>
          </g>
        ) : null
      )}

      {/* User-drawn lines */}
      {geom.drawSegs.map((d) =>
        d.s ? (
          <line key={d.id} x1={d.s.x1} y1={d.s.y1} x2={d.s.x2} y2={d.s.y2} stroke="var(--amber)" strokeWidth={1.6} strokeOpacity={0.9} />
        ) : null
      )}

      {/* Detected S/R zones — always drawn so resistance/support is visible. */}
      {geom.zoneRects.map((z, i) => (
        <g key={i}>
          {rect(0, z.yLow, z.yHigh, z.kind === 'support' ? bull : bear, 0.12, geom.width)}
          {z.yHigh != null && (
            <text x={6} y={z.yHigh - 3} fill={z.kind === 'support' ? bull : bear} fontSize={10} fontFamily="monospace">
              {z.kind} · {z.touches} touches
            </text>
          )}
        </g>
      ))}

      {sg && setup && (
        <>
          {/* setup's own support/resistance bands */}
          {rect(0, sg.ySupLow, sg.ySupHigh, bull, 0.14, geom.width)}
          {rect(0, sg.yResLow, sg.yResHigh, bear, 0.14, geom.width)}

          {/* target box (entry -> target) and stop box (entry -> stop) projected right */}
          {rect(sg.projX, sg.yEntry, sg.yTarget, bull, 0.22, sg.projW)}
          {rect(sg.projX, sg.yEntry, sg.yStop, bear, 0.22, sg.projW)}

          {sg.yEntry != null && (
            <line x1={0} x2={geom.width} y1={sg.yEntry} y2={sg.yEntry} stroke="var(--amber)" strokeWidth={1.4} strokeDasharray="6 4" className="setup-line" />
          )}
          {sg.yEntry != null && (
            <text x={sg.projX + 6} y={sg.yEntry - 6} fill="var(--amber)" fontSize={11} fontFamily="monospace">
              entry {setup.entryPrice}
            </text>
          )}
          {sg.yTarget != null && (
            <text x={sg.projX + 6} y={sg.yTarget + 12} fill={bull} fontSize={11} fontFamily="monospace">
              target {setup.targetPrice}
            </text>
          )}
          {sg.yStop != null && (
            <text x={sg.projX + 6} y={sg.yStop + 12} fill={bear} fontSize={11} fontFamily="monospace">
              stop {setup.stopPrice}
            </text>
          )}
          <text x={10} y={geom.height - 10} fill="var(--bone)" fontSize={12} fontFamily="monospace" opacity={0.85}>
            {setup.name} · {setup.reasoning} · R:R 1:{setup.riskReward}
            {setup.firing ? ' · ● FIRING' : ' · (watching)'}
          </text>
        </>
      )}
    </svg>
  )
}
