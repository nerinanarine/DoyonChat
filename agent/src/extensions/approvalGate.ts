/**
 * 承認ゲート pi 拡張（P3-010 Phase 1）。
 *
 * pi 本体が `--extension <this file>` で読み込む。実行時依存は持たない
 * （型は pi 付属 `docs/extensions.md` の Tool call / ctx.ui 形状に基づく最小定義）。
 *
 * 方針（レビュー F5 の結論）: **confirm 専用**。select/input/editor は
 * gateway 側で即時キャンセル応答するため、本拡張は confirm のみ発火させる。
 *
 * 判定は環境変数で注入する（gateway が実行単位に設定）:
 * - APPROVAL_LEVEL: `auto` | `dangerous-only` | `always`（既定 `dangerous-only`）
 * - APPROVAL_DANGEROUS_TOOLS: カンマ区切り（既定 `write,edit,bash,powershell`）
 */

export type ApprovalLevel = 'auto' | 'dangerous-only' | 'always';

const DEFAULT_DANGEROUS_TOOLS = ['write', 'edit', 'bash', 'powershell'];

interface ToolCallEvent {
  toolName: string;
  toolCallId: string;
  input?: unknown;
}

interface GateUi {
  confirm(title: string, message?: string): Promise<boolean>;
}

interface GateCtx {
  ui: GateUi;
}

interface GatePi {
  on(
    event: 'tool_call',
    handler: (
      event: ToolCallEvent,
      ctx: GateCtx,
    ) => Promise<{ block: boolean; reason: string } | undefined>,
  ): void;
}

export function readApprovalLevel(env: NodeJS.ProcessEnv = process.env): ApprovalLevel {
  const raw = (env.APPROVAL_LEVEL || '').trim().toLowerCase();
  if (raw === 'auto' || raw === 'dangerous-only' || raw === 'always') return raw;
  return 'dangerous-only';
}

export function readDangerousTools(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.APPROVAL_DANGEROUS_TOOLS;
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_DANGEROUS_TOOLS];
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export function shouldConfirm(
  toolName: string,
  level: ApprovalLevel,
  dangerousTools: string[],
): boolean {
  if (level === 'auto') return false;
  if (level === 'always') return true;
  return dangerousTools.includes(toolName);
}

export function summarizeInput(input: unknown): string {
  try {
    const serialized = JSON.stringify(input);
    if (!serialized) return '(引数なし)';
    return serialized.length > 500 ? `${serialized.slice(0, 500)}…` : serialized;
  } catch {
    return '(引数を表示できません)';
  }
}

export default function approvalGate(pi: unknown): void {
  (pi as GatePi).on('tool_call', async (event, ctx) => {
    const level = readApprovalLevel();
    if (!shouldConfirm(event.toolName, level, readDangerousTools())) return undefined;
    const ok = await ctx.ui.confirm(
      `ツール実行の確認: ${event.toolName}`,
      summarizeInput(event.input),
    );
    if (!ok) {
      return {
        block: true,
        reason: `Blocked by approval gate (level=${level}, tool=${event.toolName})`,
      };
    }
    return undefined;
  });
}
