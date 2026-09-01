import React, { useState, useEffect } from 'react';
import { Settings, LogOut } from 'lucide-react';
import { ModelInfo, UserSettings, ModelsStatus, SettingsStatus } from '../../types';

interface SettingsMenuProps {
  models: ModelInfo[];
  modelsStatus: ModelsStatus;
  settings: UserSettings;
  settingsStatus: SettingsStatus;
  settingsError: string | null;
  onChangeDefaultModel: (modelId: string | null) => Promise<void>;
  onChangeDisplayName: (name: string | null) => Promise<void>;
  onLogout: () => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  models,
  modelsStatus,
  settings,
  settingsStatus,
  settingsError,
  onChangeDefaultModel,
  onChangeDisplayName,
  onLogout,
}) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(settings.displayName ?? '');

  useEffect(() => {
    setDisplayNameDraft(settings.displayName ?? '');
  }, [settings.displayName]);

  const defaultModelId = settings.defaultModel;
  const defaultModelUnavailable =
    modelsStatus === 'loaded' && defaultModelId !== undefined && !models.some((m) => m.id === defaultModelId);
  const settingsUnavailable = settingsStatus === 'loading' || settingsStatus === 'error';

  const handleModelChange = async (value: string) => {
    setSaving(true);
    try {
      await onChangeDefaultModel(value === '' ? null : value);
    } finally {
      setSaving(false);
    }
  };

  const handleDisplayNameSave = async () => {
    const trimmed = displayNameDraft.trim();
    if (trimmed === (settings.displayName ?? '')) return;
    setSaving(true);
    try {
      await onChangeDisplayName(trimmed === '' ? null : trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="設定"
        aria-label="設定"
        className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
      >
        <Settings size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">設定</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="閉じる"
              >
                <span aria-hidden>×</span>
              </button>
            </div>

            <div className="mb-1 text-sm text-gray-700">表示名</div>
            <div className="mb-1 text-xs text-gray-500">チャット画面であなたの代わりに表示される名前です。</div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                onBlur={handleDisplayNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDisplayNameSave();
                  }
                }}
                placeholder="あなた"
                maxLength={50}
                disabled={settingsUnavailable || saving}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
                aria-label="表示名"
              />
            </div>

            <div className="mb-1 text-sm text-gray-700">デフォルトモデル</div>
            <div className="mb-1 text-xs text-gray-500">新規会話で使用するモデルです。</div>
            <select
              value={defaultModelId ?? ''}
              onChange={(event) => handleModelChange(event.target.value)}
              disabled={
                settingsUnavailable || modelsStatus !== 'loaded' || saving
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
              aria-label="デフォルトのモデル"
            >
              <option value="">デフォルトなし</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            {modelsStatus === 'loading' && (
              <p className="mt-1 text-xs text-gray-500">モデル一覧を読み込み中です。</p>
            )}
            {modelsStatus === 'error' && (
              <p className="mt-1 text-xs text-gray-500">モデル一覧を取得できませんでした。</p>
            )}
            {settingsStatus === 'loading' && (
              <p className="mt-1 text-xs text-gray-500">設定を読み込み中です。</p>
            )}
            {settingsStatus === 'error' && (
              <p className="mt-1 text-xs text-red-600">
                設定を取得できませんでした。{settingsError ? `（${settingsError}）` : ''}
              </p>
            )}
            {defaultModelUnavailable && (
              <p className="mt-1 text-xs text-amber-600">
                保存済みモデル「{defaultModelId}」は利用不可です。再選択してください。
              </p>
            )}

            <div className="mt-4 pt-3 border-t border-gray-100">
              <button
                onClick={onLogout}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut size={16} />
                ログアウト
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsMenu;