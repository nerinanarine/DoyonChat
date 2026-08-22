import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationList from '../../src/components/Sidebar/ConversationList';
import { Conversation } from '../../src/types';

const conversations: Conversation[] = [
  {
    id: 'conversation-1',
    title: '最初の会話',
    model: 'model-1',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T02:00:00.000Z',
  },
  {
    id: 'conversation-2',
    title: '次の会話',
    model: 'model-2',
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T01:00:00.000Z',
  },
];

const onSelect = vi.fn();
const onDelete = vi.fn();
const onNewChat = vi.fn();

function renderList(onRename = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ConversationList
      conversations={conversations}
      activeId="conversation-1"
      onSelect={onSelect}
      onDelete={onDelete}
      onRename={onRename}
      onNewChat={onNewChat}
    />,
  );
  return onRename;
}

function startEditing(title = '最初の会話') {
  fireEvent.click(screen.getByRole('button', { name: title }));
  return screen.getByRole('textbox', { name: '会話タイトルを編集' });
}

describe('ConversationList rename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts editing with the current title without selecting the conversation', () => {
    renderList();

    const input = startEditing('次の会話');

    expect(input).toHaveValue('次の会話');
    expect(input).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('saves the trimmed title with Enter', async () => {
    const onRename = renderList();
    const input = startEditing();
    fireEvent.change(input, { target: { value: '  更新後の会話  ' } });

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith('conversation-1', '更新後の会話'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: '会話タイトルを編集' })).not.toBeInTheDocument(),
    );
  });

  it.each([
    ['Escape', (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Escape' })],
    ['blur', (input: HTMLElement) => fireEvent.blur(input)],
    [
      'empty Enter',
      (input: HTMLElement) => {
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      },
    ],
  ])('cancels without saving on %s', (_caseName, cancel) => {
    const onRename = renderList();
    const input = startEditing();
    fireEvent.change(input, { target: { value: '未保存の会話' } });

    cancel(input);

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: '会話タイトルを編集' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最初の会話' })).toBeInTheDocument();
  });

  it('ignores Enter while an IME composition is active', () => {
    const onRename = renderList();
    const input = startEditing();
    fireEvent.change(input, { target: { value: '変換中' } });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(onRename).not.toHaveBeenCalled();
    expect(input).toHaveValue('変換中');
    expect(input).toBeInTheDocument();
  });

  it('keeps editing and shows an error for titles over 100 characters', () => {
    const onRename = renderList();
    const input = startEditing();
    fireEvent.change(input, { target: { value: 'あ'.repeat(101) } });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).not.toHaveBeenCalled();
    expect(input).toHaveValue('あ'.repeat(101));
    expect(screen.getByRole('alert')).toHaveTextContent('タイトルは100文字以内で入力してください。');
  });

  it('accepts a title at the 100 character boundary', async () => {
    const onRename = renderList();
    const input = startEditing();
    fireEvent.change(input, { target: { value: 'あ'.repeat(100) } });

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('conversation-1', 'あ'.repeat(100)));
  });

  it('counts an emoji as one character', async () => {
    const onRename = renderList();
    const input = startEditing();
    fireEvent.change(input, { target: { value: '😀'.repeat(100) } });

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith('conversation-1', '😀'.repeat(100)));
  });

  it('prevents duplicate submissions while saving', async () => {
    let resolveRename: (() => void) | undefined;
    const onRename = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve;
        }),
    );
    renderList(onRename);
    const input = startEditing();
    fireEvent.change(input, { target: { value: '更新後の会話' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledTimes(1);
    await act(async () => resolveRename?.());
  });

  it('keeps the input and inline error after failure, then allows retry', async () => {
    const onRename = vi
      .fn()
      .mockRejectedValueOnce(new Error('update failed'))
      .mockResolvedValueOnce(undefined);
    renderList(onRename);
    const input = startEditing();
    fireEvent.change(input, { target: { value: '再試行する会話' } });

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(input).toHaveValue('再試行する会話');
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onRename).toHaveBeenCalledTimes(2));
  });

  it('keeps only one conversation in edit mode', () => {
    renderList();
    startEditing();

    fireEvent.click(screen.getByRole('button', { name: '次の会話' }));

    expect(screen.getAllByRole('textbox', { name: '会話タイトルを編集' })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: '会話タイトルを編集' })).toHaveValue('次の会話');
  });
});
