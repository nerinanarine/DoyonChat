import React from 'react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/** APIエラーをユーザー向け文言で表示し、必要なら再試行・破棄を提供する共通表示。 */
const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry, onDismiss }) => {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-800"
    >
      <div className="flex-1 min-w-0">{message}</div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-2.5 py-1 rounded border border-red-300 hover:bg-red-100 transition-colors"
          >
            再試行
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="エラーを閉じる"
            className="p-1 rounded hover:bg-red-100 text-red-600"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;