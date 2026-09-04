import { RawPiEvent } from './piClient';

/**
 * pi イベントを既存 SSE 契約へ正規化する（RG-1 F1）。
 * - message_update の text_delta → `{content}`（既存チャット本文チャンクと同形）
 * - message_update の thinking_delta → `{reasoning}`（既存推論チャンクと同形）
 * - 空 delta は送らない（既存 createStreamChunk の流儀）
 * - それ以外（toolcall_*・開始/終了マーカー等）は生のまま1件で返す
 */
export function normalizePiEventForSSE(event: RawPiEvent): unknown[] {
  if (event && event.type === 'message_update') {
    const assistantEvent = event.assistantMessageEvent as
      | { type?: unknown; delta?: unknown }
      | undefined;
    if (assistantEvent?.type === 'text_delta' || assistantEvent?.type === 'thinking_delta') {
      const delta = typeof assistantEvent.delta === 'string' ? assistantEvent.delta : '';
      if (!delta) return [];
      return assistantEvent.type === 'text_delta' ? [{ content: delta }] : [{ reasoning: delta }];
    }
  }
  return [event];
}
