import React from 'react';

interface LoadingStateProps {
  label: string;
}

/** データ取得中を示すアクセシブルな共通表示（role="status"）。 */
const LoadingState: React.FC<LoadingStateProps> = ({ label }) => {
  return (
    <div role="status" className="flex items-center justify-center gap-2 px-4 py-8">
      <span
        className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"
        aria-hidden
      />
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
};

export default LoadingState;