import { formatMessagesForApi } from '../../src/services/opencodeGo';
import { Message } from '../../src/types';

describe('formatMessagesForApi', () => {
  it('should format plain text user message as string content', () => {
    const messages: Message[] = [
      {
        id: '1',
        conversationId: 'conv1',
        role: 'user',
        content: 'Hello',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = formatMessagesForApi(messages);
    expect(result).toEqual([
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('should format message with image as multimodal content array', () => {
    const messages: Message[] = [
      {
        id: '1',
        conversationId: 'conv1',
        role: 'user',
        content: 'What is in this image?',
        imageUrl: 'data:image/png;base64,abc123',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = formatMessagesForApi(messages);
    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
        ],
      },
    ]);
  });

  it('should format assistant messages without image as string content', () => {
    const messages: Message[] = [
      {
        id: '1',
        conversationId: 'conv1',
        role: 'assistant',
        content: 'I see a cat in the image.',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = formatMessagesForApi(messages);
    expect(result).toEqual([
      { role: 'assistant', content: 'I see a cat in the image.' },
    ]);
  });

  it('should handle mixed messages (with and without images)', () => {
    const messages: Message[] = [
      {
        id: '1',
        conversationId: 'conv1',
        role: 'user',
        content: 'First message',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        conversationId: 'conv1',
        role: 'user',
        content: 'Second with image',
        imageUrl: 'data:image/png;base64,xyz789',
        createdAt: '2026-01-01T00:00:01Z',
      },
      {
        id: '3',
        conversationId: 'conv1',
        role: 'assistant',
        content: 'Reply',
        createdAt: '2026-01-01T00:00:02Z',
      },
    ];

    const result = formatMessagesForApi(messages);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: 'user', content: 'First message' });
    expect(result[1].role).toBe('user');
    expect(Array.isArray(result[1].content)).toBe(true);
    expect(result[2]).toEqual({ role: 'assistant', content: 'Reply' });
  });

  it('should return empty array for empty messages', () => {
    expect(formatMessagesForApi([])).toEqual([]);
  });
});
