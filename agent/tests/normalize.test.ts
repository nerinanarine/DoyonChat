import { normalizePiEventForSSE } from '../src/normalize';

describe('normalizePiEventForSSE', () => {
  it('maps text_delta to content chunks', () => {
    expect(
      normalizePiEventForSSE({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'hello' },
      }),
    ).toEqual([{ content: 'hello' }]);
  });

  it('maps thinking_delta to reasoning chunks', () => {
    expect(
      normalizePiEventForSSE({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'hmm' },
      }),
    ).toEqual([{ reasoning: 'hmm' }]);
  });

  it('drops empty deltas', () => {
    expect(
      normalizePiEventForSSE({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '' },
      }),
    ).toEqual([]);
  });

  it('passes through toolcall and marker events unchanged', () => {
    const toolcall = {
      type: 'message_update',
      assistantMessageEvent: { type: 'toolcall_start', contentIndex: 1, id: 'c1', toolName: 'read' },
    };
    expect(normalizePiEventForSSE(toolcall)).toEqual([toolcall]);
    const settled = { type: 'agent_settled' };
    expect(normalizePiEventForSSE(settled)).toEqual([settled]);
  });
});
