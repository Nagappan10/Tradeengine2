export type DrawTool = 'none' | 'trend' | 'hline' | 'edit'

interface Props {
  tool: DrawTool
  onTool(t: DrawTool): void
  onClear(): void
  hasDrawings: boolean
}

const TOOLS: { key: DrawTool; label: string; title: string }[] = [
  { key: 'none', label: '⌖', title: 'Cursor / pan' },
  { key: 'trend', label: '╱', title: 'Trendline (click two points)' },
  { key: 'hline', label: '─', title: 'Horizontal line (click a level)' },
  { key: 'edit', label: '✥', title: 'Move / edit lines (drag an endpoint)' }
]

// Minimal TradingView-style drawing tools — intentionally small, not a clone.
export default function DrawToolbar({ tool, onTool, onClear, hasDrawings }: Props) {
  return (
    <div className="draw-toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.key}
          className={tool === t.key ? 'active' : ''}
          title={t.title}
          onClick={() => onTool(t.key)}
        >
          {t.label}
        </button>
      ))}
      <button title="Clear drawings" onClick={onClear} disabled={!hasDrawings}>
        🗑
      </button>
    </div>
  )
}
