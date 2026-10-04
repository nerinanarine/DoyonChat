import React, { useCallback, useState } from 'react';
import { Download } from 'lucide-react';
import { downloadArtifact } from '../../services/chatApi';
import { errorMessage } from '../../services/errorMessages';
import ErrorMessage from '../Common/ErrorMessage';

interface ArtifactDownloadProps {
  /** 認証済みユーザー ID。設定読み込み前は null（ダウンロード不可）。 */
  userId: string | null;
}

/** Blob をファイルとして保存する（テストでは URL.createObjectURL を差し替える）。 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * チャット画面の成果物ダウンロード導線（P3-016 FR-004）。
 *
 * 暫定 UX: ファイル名入力＋ダウンロードボタン。P3-015 の生成通知導線が入るまでの最小導線であり、
 * 本格的な UX（エージェント出力からのリンク等）は P3-015 側で設計する。
 */
const ArtifactDownload: React.FC<ArtifactDownloadProps> = ({ userId }) => {
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    const name = fileName.trim();
    if (!userId || !name || busy) return;
    setBusy(true);
    setError(null);
    try {
      saveBlob(await downloadArtifact(userId, name), name);
      setFileName('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [userId, fileName, busy]);

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-2">
      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleDownload();
        }}
      >
        <input
          type="text"
          value={fileName}
          onChange={(event) => setFileName(event.target.value)}
          placeholder="ダウンロードするファイル名"
          aria-label="成果物ファイル名"
          disabled={!userId || busy}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={!userId || !fileName.trim() || busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {busy ? (
            <span
              className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"
              aria-hidden
            />
          ) : (
            <Download size={16} />
          )}
          {busy ? '取得中...' : 'ダウンロード'}
        </button>
      </form>
    </div>
  );
};

export default ArtifactDownload;
