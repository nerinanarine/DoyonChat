import React from 'react';
import { ShieldQuestion } from 'lucide-react';
import { AgentApprovalRequest } from '../../types';

interface ToolCallConfirmationProps {
  request: AgentApprovalRequest;
  busy?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * ツール実行前の承認UI。表示はタイトル（ツール名）・メッセージ（引数概要）と
 * 許可/拒否のみ。承認後は親がダイアログを閉じる（タイムアウト expired でも閉じる）。
 */
const ToolCallConfirmation: React.FC<ToolCallConfirmationProps> = ({
  request,
  busy = false,
  onApprove,
  onReject,
}) => {
  return (
    <div
      role="alertdialog"
      aria-label="ツール実行の確認"
      className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <div className="flex items-center gap-2 mb-1">
        <ShieldQuestion size={16} className="text-amber-600 shrink-0" aria-hidden="true" />
        <div className="text-sm font-medium text-amber-800">
          {request.title ?? 'ツール実行の確認'}
        </div>
      </div>
      {request.message && (
        <p className="mb-3 text-xs text-amber-700 break-all">{request.message}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-amber-300 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          拒否
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          許可
        </button>
      </div>
    </div>
  );
};

export default ToolCallConfirmation;