import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAgentsMd } from '../../hooks/useAgentsMd';
import LoadingState from '../Common/LoadingState';
import ErrorMessage from '../Common/ErrorMessage';

/** 未設定（GET 404）時に本文のプレースホルダとして示す既定文（US1-3: 未設定とわかる表示）。 */
export const DEFAULT_AGENTS_MD = [
  '# エージェントへの指示',
  'このユーザー向けの追加指示をここに書きます。',
].join('\n');

interface AgentsMdEditorProps {
  onClose: () => void;
}

/**
 * 自分の AGENTS.md を参照・編集・保存する画面（P2-020 US1、設定メニュー配下）。
 * 未設定は既定文を表示し、保存すると新規作成になる。空で保存するとクリア。
 */
const AgentsMdEditor: React.FC<AgentsMdEditorProps> = ({ onClose }) => {
  const { content, status, error, saving, save, reload } = useAgentsMd();
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  // 読み込み・保存で content が確定したら下書きへ反映する（ユーザーの編集は content 変化時のみ上書き）。
  useEffect(() => {
    setDraft(content ?? '');
  }, [content]);

  const unset = !content;

  const handleSave = async () => {
    setSaved(false);
    try {
      await save(draft);
      setSaved(true);
    } catch {
      // 失敗時は useAgentsMd が error を設定し、下段の ErrorMessage が表示する。
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AGENTS.md の編集"
        className="w-full max-w-2xl max-h-full flex flex-col bg-white rounded-lg shadow-lg"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">エージェント指示（AGENTS.md）</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        {status === 'loading' && <LoadingState label="AGENTS.md を読み込み中..." />}
        {status === 'error' && (
          <ErrorMessage message={error ?? ''} onRetry={() => void reload()} />
        )}
        {status === 'loaded' && (
          <>
            {error && <ErrorMessage message={error} />}
            <div className="flex flex-col gap-2 p-4 overflow-y-auto">
              {unset && (
                <p className="text-xs text-gray-500">
                  未設定です。既定の指示が使われます。保存すると新規作成されます。
                </p>
              )}
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setSaved(false);
                }}
                placeholder={DEFAULT_AGENTS_MD}
                aria-label="AGENTS.md の内容"
                rows={14}
                spellCheck={false}
                className="w-full resize-y border border-gray-200 rounded-lg p-3 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200">
              {saved && (
                <span role="status" className="text-sm text-green-600">
                  保存しました
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentsMdEditor;
