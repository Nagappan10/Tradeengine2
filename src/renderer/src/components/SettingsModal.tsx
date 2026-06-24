import { useEffect, useState } from 'react'
import type { AppSettings, MaskedSettings } from '@shared/types'

interface Props {
  onClose(): void
  onSaved(s: MaskedSettings): void
}

export default function SettingsModal({ onClose, onSaved }: Props) {
  const [s, setS] = useState<MaskedSettings | null>(null)
  const [geminiKey, setGeminiKey] = useState('')
  const [alpacaKey, setAlpacaKey] = useState('')
  const [alpacaSecret, setAlpacaSecret] = useState('')
  const [twelveKey, setTwelveKey] = useState('')
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    window.desk.getSettings().then(setS)
  }, [])

  if (!s) return null

  const persist = async (): Promise<MaskedSettings> => {
    const patch: Partial<AppSettings> = {
      geminiModel: s.geminiModel,
      llmAugmentation: s.llmAugmentation
    }
    if (geminiKey) patch.geminiApiKey = geminiKey
    if (alpacaKey) patch.alpacaKey = alpacaKey
    if (alpacaSecret) patch.alpacaSecret = alpacaSecret
    if (twelveKey) patch.twelveDataKey = twelveKey
    return window.desk.saveSettings(patch)
  }

  const save = async () => {
    const masked = await persist()
    onSaved(masked)
    onClose()
  }

  const test = async () => {
    setTesting(true)
    setTestMsg(null)
    try {
      // Save the typed key first so the test exercises exactly what will be used.
      const masked = await persist()
      setS(masked)
      setGeminiKey('')
      const res = await window.desk.testGemini()
      setTestMsg({ ok: res.ok, text: res.message })
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="glass modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="section-title">Settings</h3>

        <div className="field">
          <label>Gemini API key {s.hasGeminiKey ? '· (set)' : '· (not set)'}</label>
          <input
            type="password"
            placeholder={s.hasGeminiKey ? '•••••••• (leave blank to keep)' : 'paste Gemini API key'}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Gemini model</label>
          <select value={s.geminiModel} onChange={(e) => setS({ ...s, geminiModel: e.target.value })}>
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
          </select>
        </div>

        <div className="field">
          <label>Alpaca key (optional) {s.hasAlpacaKey ? '· (set)' : ''}</label>
          <input value={alpacaKey} onChange={(e) => setAlpacaKey(e.target.value)} placeholder="optional" />
        </div>
        <div className="field">
          <label>Alpaca secret (optional)</label>
          <input
            type="password"
            value={alpacaSecret}
            onChange={(e) => setAlpacaSecret(e.target.value)}
            placeholder="optional"
          />
        </div>
        <div className="field">
          <label>Twelve Data key (optional) {s.hasTwelveDataKey ? '· (set)' : ''}</label>
          <input
            type="password"
            value={twelveKey}
            onChange={(e) => setTwelveKey(e.target.value)}
            placeholder="optional"
          />
        </div>

        <div className="field row">
          <input
            type="checkbox"
            id="llm-aug"
            style={{ width: 'auto' }}
            checked={s.llmAugmentation}
            onChange={(e) => setS({ ...s, llmAugmentation: e.target.checked })}
          />
          <label htmlFor="llm-aug" style={{ margin: 0 }}>
            LLM-augmented strategy generation (off = fully local/free)
          </label>
        </div>

        {testMsg && (
          <p
            className="mono"
            style={{ fontSize: 12, color: testMsg.ok ? 'var(--bull)' : 'var(--bear)', marginTop: 0 }}
          >
            {testMsg.ok ? '✓ ' : '✗ '}
            {testMsg.text}
          </p>
        )}

        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <button onClick={test} disabled={testing}>
            {testing ? 'Testing…' : 'Test Gemini key'}
          </button>
          <div className="row">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" onClick={save}>
              Save
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--bone-dim)', marginBottom: 0 }}>
          Keys are stored locally in the main process only and never reach the chart UI.
        </p>
      </div>
    </div>
  )
}
