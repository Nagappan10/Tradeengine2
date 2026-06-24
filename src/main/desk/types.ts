import type { ChatMessage, DeskContext, DeskVerdict } from '@shared/types'

// Common shape every Desk LLM provider implements. verdict()/chat() THROW on
// failure so the router can fail over to the next provider that has a key.
export interface DeskProvider {
  name: string
  hasKey(): boolean
  verdict(ctx: DeskContext): Promise<DeskVerdict>
  chat(ctx: DeskContext, history: ChatMessage[], message: string): Promise<string>
  test(): Promise<{ ok: boolean; message: string }>
}
