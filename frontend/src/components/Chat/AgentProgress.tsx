import React from 'react';
import { Bot, Play, Loader2, CheckCircle2, AlertCircle, ShieldQuestion, ThumbsUp, ThumbsDown } from 'lucide-react';
import { AgentStreamEvent } from '../../types';

interface AgentProgressProps {
  events: AgentStreamEvent[];
}

function argsSummary(args: unknown): string | undefined {
  if (args === undefined || args === null) return undefined;
  if (typeof args !== 'object') return String(args);
  const entries = Object.entries(args as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${value === undefined ? '' : String(value).slice(0, 40)}`)
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return undefined;
  return entries.join(', ');
}

function EventLine({ event }: { event: AgentStreamEvent }) {
  switch (event.kind) {
    case 'agent_start':
      return (
        <span className="flex items-center gap-1.5">
          <Bot size={13} className="text-blue-500 shrink-0" />
          <span>エージェントを開始しました</span>
        </span>
      );
    case 'agent_settled':
      return (
        <span className="flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-green-600 shrink-0" />
          <span>エージェントが完了しました</span>
        </span>
      );
    case 'tool_start': {
      const summary = argsSummary(event.args);
      return (
        <span className="flex items-center gap-1.5">
          <Play size={13} className="text-blue-500 shrink-0" />
          <span>
            ツール実行開始: <span className="font-medium">{event.toolName ?? '不明'}</span>
            {summary ? <span className="text-gray-500"> ({summary})</span> : null}
          </span>
        </span>
      );
    }
    case 'tool_update':
      return (
        <span className="flex items-center gap-1.5">
          <Loader2 size={13} className="text-blue-500 shrink-0 animate-spin" />
          <span>
            ツール実行中: <span className="font-medium">{event.toolName ?? '不明'}</span>
          </span>
        </span>
      );
    case 'tool_end':
      return event.isError ? (
        <span className="flex items-center gap-1.5 text-amber-700">
          <AlertCircle size={13} className="shrink-0" />
          <span>
            ツール失敗: <span className="font-medium">{event.toolName ?? '不明'}</span>
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-green-600 shrink-0" />
          <span>
            ツール完了: <span className="font-medium">{event.toolName ?? '不明'}</span>
          </span>
        </span>
      );
    case 'approval_request':
      return (
        <span className="flex items-center gap-1.5 text-amber-700">
          <ShieldQuestion size={13} className="shrink-0" />
          <span>ツール実行の確認を待っています</span>
        </span>
      );
    case 'approval_resolved':
      return event.approved ? (
        <span className="flex items-center gap-1.5 text-green-700">
          <ThumbsUp size={13} className="shrink-0" />
          <span>ツール実行を許可しました</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-red-600">
          <ThumbsDown size={13} className="shrink-0" />
          <span>ツール実行を拒否しました</span>
        </span>
      );
    default:
      return null;
  }
}

const AgentProgress: React.FC<AgentProgressProps> = ({ events }) => {
  if (events.length === 0) return null;
  return (
    <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="mb-1 text-xs font-medium text-gray-500">エージェント進捗</div>
      <ul className="space-y-1 text-xs text-gray-700">
        {events.map((event, index) => (
          <li key={index}>
            <EventLine event={event} />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AgentProgress;