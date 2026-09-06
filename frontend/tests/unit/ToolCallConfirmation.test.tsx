import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ToolCallConfirmation from '../../src/components/Chat/ToolCallConfirmation';
import { AgentApprovalRequest } from '../../src/types';

const request: AgentApprovalRequest = {
  id: 'appr-1',
  runId: 'run-1',
  method: 'confirm',
  title: 'ツール実行の確認: write',
  message: 'write {"path":"a.ts"}',
};

describe('ToolCallConfirmation', () => {
  it('shows the tool title, argument summary and both actions', () => {
    render(
      <ToolCallConfirmation request={request} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText('ツール実行の確認: write')).toBeInTheDocument();
    expect(screen.getByText('write {"path":"a.ts"}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '許可' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拒否' })).toBeInTheDocument();
  });

  it('fires onApprove when the approve button is clicked', () => {
    const onApprove = vi.fn();
    render(<ToolCallConfirmation request={request} onApprove={onApprove} onReject={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '許可' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('fires onReject when the reject button is clicked', () => {
    const onReject = vi.fn();
    render(<ToolCallConfirmation request={request} onApprove={vi.fn()} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: '拒否' }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while a response is in flight', () => {
    render(
      <ToolCallConfirmation request={request} busy onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '許可' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒否' })).toBeDisabled();
  });
});