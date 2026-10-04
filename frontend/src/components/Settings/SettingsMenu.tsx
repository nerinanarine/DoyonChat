import React, { useState, useEffect } from 'react';
import { Settings, LogOut } from 'lucide-react';
import { AgentApprovalLevel, UserSettings, SettingsStatus } from '../../types';

const APPROVAL_LEVEL_LABELS: Record<AgentApprovalLevel, string> = {
  auto: '自動（確認なし）',
  'dangerous-only': '危険なツールのみ確認',
  always: 'すべて確認',
};

const APPROVAL_LEVEL_OPTIONS: Array<{ value: AgentApprovalLevel | ''; label: string }> = [
  { value: '', label: 'デフォルト（dangerous-only）' },
  { value: 'auto', label: APPROVAL_LEVEL_LABELS.auto },
  { value: 'dangerous-only', label: APPROVAL_LEVEL_LABELS['dangerous-only'] },
  { value: 'always', label: APPROVAL_LEVEL_LABELS.always },
];

interface SettingsMenuProps {
  settings: UserSettings;
  settingsStatus: SettingsStatus;
  onChangeDisplayName: (name: string | null) => Promise<void>;
  onChangeAgentApprovalLevel?: (level: AgentApprovalLevel | null) => Promise<void>;
  onChangeAgentModel?: (modelId: string | null) => Promise<void>;
  onChangeAgentSubagentModel?: (modelId: string | null) => Promise<void>;
  onLogout: () => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  settings,
  settingsStatus,
  onChangeDisplayName,
  onChangeAgentApprovalLevel,
  onChangeAgentModel,
  onChangeAgentSubagentModel,
  onLogout,
}) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(settings.displayName ?? '');
  const [agentModelDraft, setAgentModelDraft] = useState(settings.agentModel ?? '');
  const [agentSubagentModelDraft, setAgentSubagentModelDraft] = useState(
    settings.agentSubagentModel ?? '',
  );

  useEffect(() => {
    setDisplayNameDraft(settings.displayName ?? '');
  }, [settings.displayName]);

  useEffect(() => {
    setAgentModelDraft(settings.agentModel ?? '');
  }, [settings.agentModel]);

  useEffect(() => {
    setAgentSubagentModelDraft(settings.agentSubagentModel ?? '');
  }, [settings.agentSubagentModel]);

  const settingsUnavailable = settingsStatus === 'loading' || settingsStatus === 'error';

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

  const handleApprovalLevelChange = async (value: string) => {
    if (!onChangeAgentApprovalLevel) return;
    const level = value === '' ? null : (value as AgentApprovalLevel);
    setSaving(true);
    try {
      await onChangeAgentApprovalLevel(level);
    } finally {
      setSaving(false);
    }
  };

  const saveAgentModel = async (draft: string, current: string | undefined, save: (value: string | null) => Promise<void>) => {
    const trimmed = draft.trim();
    if (trimmed === (current ?? '')) return;
    setSaving(true);
    try {
      await save(trimmed === '' ? null : trimmed);
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

            <div className="mt-4 pt-3 border-t border-gray-100" />

            <div className="mb-1 text-sm text-gray-700">エージェントのツール確認レベル</div>
            <div className="mb-1 text-xs text-gray-500">ツール実行前に確認するかどうかの既定です。</div>
            <select
              value={settings.agentApprovalLevel ?? ''}
              onChange={(event) => handleApprovalLevelChange(event.target.value)}
              disabled={settingsUnavailable || saving}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
              aria-label="エージェントのツール確認レベル"
            >
              {APPROVAL_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="mb-1 mt-3 text-sm text-gray-700">エージェントのモデル</div>
            <div className="mb-1 text-xs text-gray-500">エージェント実行に使用するモデルIDです。</div>
            <input
              type="text"
              value={agentModelDraft}
              onChange={(event) => setAgentModelDraft(event.target.value)}
              onBlur={() =>
                onChangeAgentModel &&
                void saveAgentModel(agentModelDraft, settings.agentModel, onChangeAgentModel)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (onChangeAgentModel) {
                    void saveAgentModel(agentModelDraft, settings.agentModel, onChangeAgentModel);
                  }
                }
              }}
              placeholder="未設定（pi の既定）"
              disabled={!onChangeAgentModel || settingsUnavailable || saving}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
              aria-label="エージェントのモデル"
            />

            <div className="mb-1 mt-3 text-sm text-gray-700">サブエージェントのモデル</div>
            <div className="mb-1 text-xs text-gray-500">pi-subagents のデフォルト・サブエージェントのモデルIDです。</div>
            <input
              type="text"
              value={agentSubagentModelDraft}
              onChange={(event) => setAgentSubagentModelDraft(event.target.value)}
              onBlur={() =>
                onChangeAgentSubagentModel &&
                void saveAgentModel(agentSubagentModelDraft, settings.agentSubagentModel, onChangeAgentSubagentModel)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (onChangeAgentSubagentModel) {
                    void saveAgentModel(agentSubagentModelDraft, settings.agentSubagentModel, onChangeAgentSubagentModel);
                  }
                }
              }}
              placeholder="未設定（pi-subagents の既定）"
              disabled={!onChangeAgentSubagentModel || settingsUnavailable || saving}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
              aria-label="サブエージェントのモデル"
            />

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