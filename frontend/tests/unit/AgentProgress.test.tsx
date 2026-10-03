import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentProgress from '../../src/components/Chat/AgentProgress';
import { AgentStreamEvent } from '../../src/types';

describe('AgentProgress', () => {
  it('renders subagent delegation with 移譲先 and タスク概要', () => {
    const events: AgentStreamEvent[] = [
      { kind: 'tool_start', toolName: 'subagent', agent: 'researcher', task: 'search the web' },
      { kind: 'tool_update', toolName: 'subagent', agent: 'researcher' },
      { kind: 'tool_end', toolName: 'subagent', agent: 'researcher', isError: false },
    ];
    render(<AgentProgress events={events} />);

    expect(screen.getByText(/サブエージェントへ移譲:/)).toBeInTheDocument();
    expect(screen.getByText(/search the web/)).toBeInTheDocument();
    expect(screen.getByText(/サブエージェント実行中:/)).toBeInTheDocument();
    expect(screen.getByText(/サブエージェント完了:/)).toBeInTheDocument();
    // 移譲先「researcher」は3つのイベントそれぞれの強調 span に現れる
    expect(screen.getAllByText('researcher')).toHaveLength(3);
  });

  it('renders subagent failure state', () => {
    const events: AgentStreamEvent[] = [
      { kind: 'tool_start', toolName: 'subagent', agent: 'researcher' },
      { kind: 'tool_end', toolName: 'subagent', agent: 'researcher', isError: true },
    ];
    render(<AgentProgress events={events} />);
    expect(screen.getByText(/サブエージェント失敗:/)).toBeInTheDocument();
    expect(screen.getAllByText('researcher')).toHaveLength(2);
  });

  it('keeps generic tool rendering for non-subagent tools (backward compatible)', () => {
    const events: AgentStreamEvent[] = [
      { kind: 'tool_start', toolName: 'read', args: { path: 'a.ts' } },
      { kind: 'tool_end', toolName: 'read', isError: false },
    ];
    render(<AgentProgress events={events} />);
    expect(screen.getByText(/ツール実行開始:/)).toBeInTheDocument();
    expect(screen.getByText(/ツール完了:/)).toBeInTheDocument();
    expect(screen.getAllByText('read')).toHaveLength(2);
    expect(screen.queryByText(/サブエージェント/)).not.toBeInTheDocument();
  });
});