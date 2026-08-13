import {
  createReasoningMarkupParser,
  normalizeChatCompletionDelta,
  normalizeResponsesEvent,
} from '../../src/services/reasoningNormalizer';

describe('reasoning normalizer', () => {
  it('normalizes reasoning_content and content independently', () => {
    const parser = createReasoningMarkupParser();

    expect(
      normalizeChatCompletionDelta(
        { reasoning_content: '考えます。', content: '結論です。' },
        parser,
      ),
    ).toEqual({ content: '結論です。', reasoning: '考えます。' });
  });

  it('supports reasoning aliases and structured text values', () => {
    const parser = createReasoningMarkupParser();

    expect(
      normalizeChatCompletionDelta(
        {
          thinking: [{ text: '検討' }, { content: 'しました。' }],
          reasoning_details: [{ text: '補足' }],
        },
        parser,
      ),
    ).toEqual({ content: '', reasoning: '検討しました。補足' });
  });

  it('does not discard content for an unknown reasoning shape', () => {
    const parser = createReasoningMarkupParser();

    expect(
      normalizeChatCompletionDelta(
        { unknown_reasoning: { opaque: true }, content: '通常回答' },
        parser,
      ),
    ).toEqual({ content: '通常回答', reasoning: '' });
  });

  it('splits complete think markup', () => {
    const parser = createReasoningMarkupParser();

    expect(parser.push('<think>手順を整理</think>結論')).toEqual({
      content: '結論',
      reasoning: '手順を整理',
    });
  });

  it('handles think markup split across chunks', () => {
    const parser = createReasoningMarkupParser();

    expect(parser.push('<thi')).toEqual({ content: '', reasoning: '' });
    expect(parser.push('nk>手順</thin')).toEqual({
      content: '',
      reasoning: '手順',
    });
    expect(parser.push('k>結論')).toEqual({ content: '結論', reasoning: '' });
  });

  it('flushes an unclosed marker without losing text', () => {
    const parser = createReasoningMarkupParser();

    expect(parser.push('<think>途中の内容')).toEqual({
      content: '',
      reasoning: '途中の内容',
    });
    expect(parser.flush()).toEqual({ content: '', reasoning: '' });
  });

  it('normalizes Responses API output and reasoning events', () => {
    const parser = createReasoningMarkupParser();

    expect(
      normalizeResponsesEvent(
        { type: 'response.reasoning_summary_text.delta', delta: '考察' },
        parser,
      ),
    ).toEqual({ content: '', reasoning: '考察', done: false });
    expect(
      normalizeResponsesEvent(
        { type: 'response.output_text.delta', delta: '回答' },
        parser,
      ),
    ).toEqual({ content: '回答', reasoning: '', done: false });
    expect(
      normalizeResponsesEvent({ type: 'response.completed' }, parser),
    ).toEqual({
      content: '',
      reasoning: '',
      done: true,
    });
  });
});
