import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessageList from '../../src/components/Chat/ChatMessageList';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ChatMessageList', () => {
  it('renders streaming reasoning separately from streaming content', () => {
    render(
      <ChatMessageList
        messages={[]}
        streamingText="最終回答"
        streamingReasoning="思考中"
        isStreaming
      />,
    );

    expect(screen.getByRole('button', { name: /思考プロセス/ })).toBeInTheDocument();
    expect(screen.getByText('最終回答')).toBeInTheDocument();
    expect(screen.queryByText('思考中')).not.toBeInTheDocument();
  });
});
