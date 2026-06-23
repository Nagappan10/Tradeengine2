import { RefObject, useMemo } from 'react'
import type { Setup } from '@shared/types'
import type { ChartHandle } from './Chart'

interface Props {
  chartRef: RefObject<ChartHandle>
  version: number // bumped whenever the chart viewport/size changes -> forces re-map
  setup: Setup | null
}

// Draws the full strategy markup directly on the candles:
// green support box, red resistance box, dashed entry line, green target box,
// red stop box and a small label. Re-maps prices->pixels on every viewport change.
export default function SetupOverlay({ chartRef, version, setup }: Props) {
  const geom = useMemo(() => {
    const api = chartRef.current
    if (!api || !setup) return null
    const { width, height } = api.size()
    if (width === 0 || height === 0) return null

    const clamp = (y: number | null): number | null => (y == null ? null : Math.max(0, Math.min(height, y)))
    const yEntry = clamp(api.priceToY(setup.entryPrice))
    const yStop = clamp(api.priceToY(setup.stopPrice))
    const yTarget = clamp(api.priceToY(setup.targetPrice))
    const ySupLow = clamp(api.priceToY(setup.supportZone.low))
    const ySupHigh = clamp(api.priceToY(setup.supportZone.high))
    const yResLow = clamp(api.priceToY(setup.resistanceZone.low))
    const yResHigh = clamp(api.priceToY(setup.resistanceZone.high))

    // Project the entry/target/stop boxes onto the right portion of the chart so the
    // risk:reward reads as two rectangles, like a real setup chart.
    const projX = Math.round(width * 0.52)
    const projW = Math.max(20, width - projX - 64) // leave room for the price axis

    return { width, height, yEntry, yStop, yTarget, ySupLow, ySupHigh, yResLow, yResHigh, projX, projW }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, setup, chartRef])

  if (!geom || !setup) return null

  const bull = getComputedStyle(document.documentElement).getPropertyValue('--bull').trim() || '#5FB99A'
  const bear = getComputedStyle(document.documentElement).getPropertyValue('--bear').trim() || '#E06C5E'

  const rect = (
    x: number,
    yA: number | null,
    yB: number | null,
    fill: string,
    stroke: string,
    opacity = 0.16,
    w?: number
  ) => {
    if (yA == null || yB == null) return null
    const top = Math.min(yA, yB)
    const h = Math.max(2, Math.abs(yA - yB))
    return (
      <rect
        x={x}
        y={top}
        width={w ?? geom.width}
        height={h}
        fill={fill}
        fillOpacity={opacity}
        stroke={stroke}
        strokeOpacity={0.55}
        rx={2}
        className="setup-rect"
      />
    )
  }

  const label = `${setup.name} · ${setup.reasoning} · R:R 1:${setup.riskReward}`

  return (
    <svg className="overlay" width={geom.width} height={geom.height} style={{ pointerEvents: 'none' }}>
      <style>{`.setup-rect{transition:opacity .3s ease} .setup-line{transition:opacity .3s ease}`}</style>

      {/* support / resistance zones — full width horizontal bands */}
      {rect(0, geom.ySupLow, geom.ySupHigh, bull, bull, 0.14)}
      {rect(0, geom.yResLow, geom.yResHigh, bear, bear, 0.14)}

      {/* target box (entry -> target) and stop box (entry -> stop), projected right */}
      {rect(geom.projX, geom.yEntry, geom.yTarget, bull, bull, 0.22, geom.projW)}
      {rect(geom.projX, geom.yEntry, geom.yStop, bear, bear, 0.22, geom.projW)}

      {/* dashed entry trigger line */}
      {geom.yEntry != null && (
        <line
          x1={0}
          x2={geom.width}
          y1={geom.yEntry}
          y2={geom.yEntry}
          stroke="var(--amber)"
          strokeWidth={1.4}
          strokeDasharray="6 4"
          className="setup-line"
        />
      )}

      {/* labels */}
      {geom.yEntry != null && (
        <text x={geom.projX + 6} y={geom.yEntry - 6} fill="var(--amber)" fontSize={11} fontFamily="monospace">
          entry {setup.entryPrice}
        </text>
      )}
      {geom.yTarget != null && (
        <text x={geom.projX + 6} y={geom.yTarget + 12} fill={bull} fontSize={11} fontFamily="monospace">
          target {setup.targetPrice}
        </text>
      )}
      {geom.yStop != null && (
        <text x={geom.projX + 6} y={geom.yStop + 12} fill={bear} fontSize={11} fontFamily="monospace">
          stop {setup.stopPrice}
        </text>
      )}
      {geom.ySupHigh != null && (
        <text x={6} y={geom.ySupHigh - 4} fill={bull} fontSize={10} fontFamily="monospace">
          support · {setup.supportZone.touches} touches
        </text>
      )}
      {geom.yResHigh != null && (
        <text x={6} y={geom.yResHigh - 4} fill={bear} fontSize={10} fontFamily="monospace">
          resistance · {setup.resistanceZone.touches} touches
        </text>
      )}

      <text x={10} y={geom.height - 10} fill="var(--bone)" fontSize={12} fontFamily="monospace" opacity={0.85}>
        {label}
      </text>
    </svg>
  )
}
