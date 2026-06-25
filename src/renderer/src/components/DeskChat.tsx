import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'

interface Props {
  ctx: DeskContext | null
}

function VerdictCard({ v }: { v: DeskVerdict }) {
  return (
    <div className={`verdict ${v.verdict}`}>
      <div className="verdict-top">
        <span className={`verdict-badge ${v.verdict}`}>{v.verdict}</span>
        <span className="mono" style={{ color: 'var(--bone-dim)' }}>
          {v.direction} · {v.confidence}
        </span>
      </div>
      <p style={{ margin: '8px 0' }}>{v.headline}</p>
      <div className="kv">
        <span>firing</span>
        <span style={{ textAlign: 'right', maxWidth: '70%' }}>{v.firingStrategies}</span>
      </div>
      <div className="kv">
        <span>current read</span>
        <span style={{ textAlign: 'right', maxWidth: '70%' }}>{v.currentRead}</span>
      </div>
      <div className="kv">
        <span>support</span>
        <span className="mono">{v.keyLevels.support}</span>
      </div>
      <div className="kv">
        <span>resistance</span>
        <span className="mono">{v.keyLevels.resistance}</span>
      </div>
      <div className="kv">
        <span>invalidation</span>
        <span className="mono">{v.keyLevels.invalidation}</span>
      </div>
      <div className="kv">
        <span>ML (fragile)</span>
        <span style={{ textAlign: 'right', maxWidth: '70%' }}>{v.mlNote}</span>
      </div>
      <div className="kv">
        <span>risk</span>
        <span style={{ textAlign: 'right', maxWidth: '70%' }}>{v.risk}</span>
      </div>
    </div>
  )
}

export default function DeskChat({ ctx }: Props) {
  const [verdict, setVerdict] = useState<DeskVerdict | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // Reset the conversation when the analysed symbol/timeframe changes.
  useEffect(() => {
    setVerdict(null)
    setMessages([])
  }, [ctx?.symbol, ctx?.interval])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, verdict, busy])

  const getCall = async () => {
    if (!ctx || busy) return
    setBusy(true)
    try {
      const v = await window.desk.deskVerdict(ctx)
      setVerdict(v)
    } catch (e) {
      // Surface the failure instead of leaving the button stuck on "Thinking…".
      setMessages((m) => [...m, { role: 'model', content: `Desk error: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!ctx || !input.trim() || busy) return
    const msg = input.trim()
    setInput('')
    const next = [...messages, { role: 'user' as const, content: msg }]
    setMessages(next)
    setBusy(true)
    try {
      const reply = await window.desk.deskChat(ctx, next, msg)
      setMessages([...next, { role: 'model', content: reply }])
    } catch (e) {
      setMessages([...next, { role: 'model', content: `Desk error: ${(e as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass desk-panel">
      <h3 className="section-title">Desk — your trading coach</h3>

      {!verdict ? (
        <button className="primary" style={{ width: '100%' }} onClick={getCall} disabled={!ctx || busy}>
          {busy ? 'Thinking…' : 'Get Desk call'}
        </button>
      ) : (
        <>
          <VerdictCard v={verdict} />
          <div className="chat-log" ref={logRef} style={{ marginTop: 10 }}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="shimmer" style={{ width: '60%' }} />}
          </div>
          <div className="chat-input">
            <input
              value={input}
              placeholder="why short here? what invalidates this?"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button onClick={send} disabled={busy}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  )
}
