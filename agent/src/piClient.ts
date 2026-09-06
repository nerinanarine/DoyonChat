import {
  ChildProcessWithoutNullStreams,
  spawn,
} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { AgentError } from './errors';
import { JsonlStreamParser, parseJsonLine } from './jsonl';
import { PiOptions } from './config';

export type RawPiEvent = Record<string, unknown>;

export interface RunPromptResult {
  finalText: string;
  events: RawPiEvent[];
  settled: boolean;
}

export interface ExtensionUiRequest {
  id: string;
  method: string;
  title?: string;
  message?: string;
  options?: string[];
}

const DIALOG_METHODS = new Set(['select', 'confirm', 'input', 'editor']);

/**
 * pi `--mode rpc` の子プロセスを所有し、JSONL でコマンド送受信・イベント中継を行う。
 * Phase 0 スコープ: 起動、`command()`（非LLM、get_state 等）、`runPrompt()`（prompt→agent_settled）、
 * タイムアウト・異常終了時のプロセス回収（terminate）。
 */
export class PiClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private parser = new JsonlStreamParser();
  private exitInfo: { code: number | null; signal: string | null } | null = null;
  private killedByUs = false;
  private stderrTail = '';
  private handler: ((event: RawPiEvent) => void) | null = null;
  private runReject: ((err: Error) => void) | null = null;
  private approvalWaiters = new Map<string, { resolve: (approved: boolean) => void; timer: NodeJS.Timeout }>();
  /** 承認待ち時間(ms)の通知先。runPrompt が実行タイマーの期限延長に使う。 */
  private onApprovalWaited: ((waitedMs: number) => void) | null = null;
  /** 承認待ち開始の通知先。runPrompt が実行タイマーを一時停止する。 */
  private onApprovalWaitStarted: (() => void) | null = null;
  /** ダイアログ要求（confirm/select 等）の通知先。gateway が SSE 中継＋承認待ち登録に使う。 */
  onExtensionUiRequest: ((req: ExtensionUiRequest) => void) | null = null;
  /** 承認の解決通知（approved / timeout による自動拒否 / terminate による取消）。gateway が SSE・レジストリ更新に使う。 */
  onApprovalResolved:
    | ((info: { id: string; approved: boolean; expired: boolean; cancelled?: boolean }) => void)
    | null = null;
  private readonly opts: PiOptions;

  constructor(opts: PiOptions) {
    this.opts = opts;
  }

  get isRunning(): boolean {
    return this.child !== null;
  }

  get hasExited(): boolean {
    return this.exitInfo !== null;
  }

  get latestExitInfo(): { code: number | null; signal: string | null } | null {
    return this.exitInfo;
  }

  get lastStderr(): string {
    return this.stderrTail;
  }

  async start(): Promise<void> {
    if (this.child) throw new AgentError('server', 'pi client already started');
    this.exitInfo = null;
    this.killedByUs = false;
    this.parser = new JsonlStreamParser();
    this.stderrTail = '';

    const child = spawn(this.opts.piBin, this.opts.piArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      // 明示マージ（jest ワーカー等で process.env 代入が子に届かない環境があるため）
      env: { ...process.env, ...this.opts.env },
    });
    this.child = child as ChildProcessWithoutNullStreams;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const line of this.parser.feed(chunk)) {
        this.handleLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    let stderr = '';
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
      this.stderrTail = stderr;
    });

    child.on('error', (err) => {
      this.exitInfo = this.exitInfo ?? { code: null, signal: null };
      const childRef = this.child;
      this.child = null;
      childRef?.stdout.destroy();
      childRef?.stderr.destroy();
      const reject = this.runReject;
      this.runReject = null;
      if (reject) {
        reject(new AgentError('server', `pi io error: ${err.message}`));
      }
    });

    child.on('exit', (code, signal) => {
      // 終端直前の stdout バッファを破棄しないよう destroy しない。
      // プロセス終了に伴いストリームは自然に閉じる。
      this.exitInfo = { code, signal: signal === null ? null : String(signal) };
      this.child = null;
      const reject = this.runReject;
      this.runReject = null;
      if (reject) {
        reject(
          new AgentError(
            this.killedByUs ? 'interrupted' : 'server',
            `pi process exited (code=${code} signal=${String(signal)})`,
          ),
        );
      }
    });

    // spawn の成否を待ってから start() を解決する（ENOENT 等の起動失敗を確実に reject）
    await new Promise<void>((resolve, reject) => {
      const failsafe = setTimeout(() => {
        child.removeListener('exit', onExitGuard);
        try {
          child.kill('SIGKILL');
        } catch {
          // 起動未完了での kill 失敗は無視する（exit ハンドラーが後始末する）
        }
        reject(new AgentError('timeout', 'pi spawn timed out'));
      }, 10_000);
      const cleanup = () => clearTimeout(failsafe);
      const onExitGuard = () => {
        cleanup();
        resolve();
      };
      const onSpawn = () => {
        cleanup();
        child.removeListener('exit', onExitGuard);
        resolve();
      };
      const onSpawnError = (err: Error) => {
        cleanup();
        child.removeListener('exit', onExitGuard);
        reject(new AgentError('server', `pi spawn failed: ${err.message}`));
      };
      child.once('spawn', onSpawn);
      child.once('error', onSpawnError);
      child.once('exit', onExitGuard);
    });
  }

  private handleLine(line: string): void {
    const parsed = parseJsonLine(line);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const event: RawPiEvent = { type: 'parse_error', line };
      this.dispatch(event);
      return;
    }
    this.dispatch(parsed as RawPiEvent);
  }

  private dispatch(event: RawPiEvent): void {
    // Extension UI 要求は実行中ハンドラーとは別経路で処理する。
    // ダイアログ系は承認待ちフローへ、fire-and-forget 系は通常イベントとして中継する。
    if (event.type === 'extension_ui_request') {
      void this.handleExtensionUiRequest(event);
      return;
    }
    if (this.handler) {
      try {
        this.handler(event);
      } catch (err) {
        // ハンドラーの例外は実行を失敗させる（安全なコードで通知）
        const reject = this.runReject;
        this.runReject = null;
        if (reject) {
          reject(err instanceof AgentError ? err : new AgentError('server', String(err)));
        }
      }
    }
  }

  /**
   * Extension UI 要求を処理する。confirm は承認待ち（タイムアウトで自動拒否）し、
   * select/input/editor は Phase 1 では未対応のため即時キャンセルで返す。
   * notify 等の fire-and-forget 系は通常イベントとしてハンドラーへ流す。
   */
  private async handleExtensionUiRequest(event: RawPiEvent): Promise<void> {
    const method = typeof event.method === 'string' ? event.method : '';
    const id = typeof event.id === 'string' ? event.id : '';
    if (!DIALOG_METHODS.has(method) || !id) {
      this.handler?.(event);
      return;
    }
    if (method !== 'confirm') {
      this.onExtensionUiRequest?.({
        id,
        method,
        title: typeof event.title === 'string' ? event.title : undefined,
        message: typeof event.message === 'string' ? event.message : undefined,
      });
      await this.writeLine({ type: 'extension_ui_response', id, cancelled: true }).catch(() => undefined);
      this.onApprovalResolved?.({ id, approved: false, expired: false });
      return;
    }
    this.onExtensionUiRequest?.({
      id,
      method,
      title: typeof event.title === 'string' ? event.title : undefined,
      message: typeof event.message === 'string' ? event.message : undefined,
      options: Array.isArray(event.options) ? (event.options as string[]) : undefined,
    });
    const waitStart = Date.now();
    this.onApprovalWaitStarted?.();
    const approved = await this.waitApproval(id);
    // 承認待ちはユーザーの時間でありエージェントの実行予算に算入しない
    this.onApprovalWaited?.(Date.now() - waitStart);
    await this.writeLine(
      approved
        ? { type: 'extension_ui_response', id, confirmed: true }
        : { type: 'extension_ui_response', id, cancelled: true },
    ).catch(() => undefined);
  }

  /**
   * 承認応答を待つ。タイムアウト時は自動拒否（false）で解決する。
   */
  private waitApproval(id: string): Promise<boolean> {
    const timeoutMs = this.opts.approvalTimeoutMs ?? 120_000;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.approvalWaiters.delete(id);
        this.onApprovalResolved?.({ id, approved: false, expired: true });
        resolve(false);
      }, timeoutMs);
      this.approvalWaiters.set(id, { resolve, timer });
    });
  }

  /**
   * POST /approve からの承認応答を対応する待ちへ届ける。該当なしは false。
   */
  resolveApproval(id: string, approved: boolean): boolean {
    const waiter = this.approvalWaiters.get(id);
    if (!waiter) return false;
    this.approvalWaiters.delete(id);
    clearTimeout(waiter.timer);
    this.onApprovalResolved?.({ id, approved, expired: false });
    waiter.resolve(approved);
    return true;
  }

  /**
   * 実行中のエージェントに停止を要求する（graceful）。pi は abort 受理後に
   * agent_settled を送る想定で、既存 runPrompt ハンドラーが部分結果で解決する。
   */
  async requestStop(): Promise<void> {
    await this.writeLine({ type: 'abort' });
  }

  private writeLine(payload: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.child;
      if (!child) {
        reject(new AgentError('network', 'pi process is not running'));
        return;
      }
      const line = `${JSON.stringify(payload)}\n`;
      child.stdin.write(line, (err?: Error | null) => {
        if (err) reject(new AgentError('network', err.message));
        else resolve();
      });
    });
  }

  /**
   * 汎用コマンド送信（LLM を呼ばないもの: get_state / get_available_models / set_model 等）。
   * 対応する id 付き response で resolve、失敗・タイムアウト・終了で reject。
   */
  async command<T extends RawPiEvent = RawPiEvent>(
    cmd: Omit<RawPiEvent, 'id'>,
    timeoutMs?: number,
  ): Promise<T> {
    if (!this.child) await this.start();
    const id = randomUUID();
    const deadlineMs = timeoutMs ?? 30_000;

    return new Promise<T>((resolve, reject) => {
      if (this.handler) {
        reject(new AgentError('server', 'pi client busy'));
        return;
      }
      const timer = setTimeout(() => {
        void this.terminate();
        reject(new AgentError('timeout', `pi command timed out after ${deadlineMs}ms`));
      }, deadlineMs);

      this.runReject = (err) => {
        clearTimeout(timer);
        this.handler = null;
        this.runReject = null;
        reject(err);
      };

      this.handler = (event) => {
        if (event.type === 'response' && event.id === id) {
          clearTimeout(timer);
          this.handler = null;
          this.runReject = null;
          if (event.success === false) {
            reject(new AgentError('server', `pi command '${event.command ?? ''}' failed`));
          } else {
            resolve(event as T);
          }
        }
      };

      this.writeLine({ ...cmd, id }).catch((err) => {
        clearTimeout(timer);
        this.handler = null;
        this.runReject = null;
        reject(err instanceof AgentError ? err : new AgentError('network', String(err)));
      });
    });
  }

  /**
   * ユーザープロンプトを pi に送り、agent_settled までイベントを中継する。
   * `onEvent` は各イベントごとに呼ばれる（Phase 1 で SSE 変換に接続する）。
   * 完了時に累積テキスト（text_delta 連結）とイベント列を返す。
   * タイムアウト時はプロセスを回収して 'timeout'、異常終了時は 'server' で reject する。
   */
  async runPrompt(
    message: string,
    opts: { timeoutMs?: number; onEvent?: (event: RawPiEvent) => void } = {},
  ): Promise<RunPromptResult> {
    if (!this.child) await this.start();
    const id = randomUUID();
    const timeoutMs = opts.timeoutMs ?? this.opts.promptTimeoutMs;
    const events: RawPiEvent[] = [];
    let finalText = '';

    return new Promise<RunPromptResult>((resolve, reject) => {
      if (this.handler) {
        reject(new AgentError('server', 'pi client busy'));
        return;
      }
      // 承認待ちの分だけ期限を延長する（承認はユーザーの時間で実行予算外）
      let deadline = Date.now() + timeoutMs;
      let timer: NodeJS.Timeout;
      const clearHooks = () => {
        this.onApprovalWaited = null;
        this.onApprovalWaitStarted = null;
      };
      const fireTimeout = () => {
        clearHooks();
        void this.terminate();
        reject(new AgentError('timeout', `pi prompt timed out after ${timeoutMs}ms`));
      };
      const armTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(fireTimeout, Math.max(0, deadline - Date.now()));
      };
      armTimer();
      this.onApprovalWaitStarted = () => {
        clearTimeout(timer);
      };
      this.onApprovalWaited = (waitedMs) => {
        deadline += waitedMs;
        armTimer();
      };

      this.runReject = (err) => {
        clearTimeout(timer);
        clearHooks();
        this.handler = null;
        this.runReject = null;
        reject(err);
      };

      this.handler = (event) => {
        events.push(event);
        if (opts.onEvent) opts.onEvent(event);

        if (event.type === 'parse_error') {
          this.runReject?.(new AgentError('server', 'invalid JSONL from pi'));
          return;
        }
        if (event.type === 'response' && event.id === id) {
          if (event.success === false) {
            this.runReject?.(new AgentError('server', "pi rejected 'prompt'"));
          }
          return;
        }
        if (event.type === 'agent_settled') {
          clearTimeout(timer);
          clearHooks();
          this.handler = null;
          this.runReject = null;
          resolve({ finalText, events, settled: true });
          return;
        }
        if (event.type === 'message_update') {
          const assistantEvent = event.assistantMessageEvent as
            | { type?: string; delta?: string }
            | undefined;
          if (
            assistantEvent &&
            assistantEvent.type === 'text_delta' &&
            typeof assistantEvent.delta === 'string'
          ) {
            finalText += assistantEvent.delta;
          }
        }
      };

      this.writeLine({ id, type: 'prompt', message }).catch((err) => {
        clearTimeout(timer);
        clearHooks();
        this.handler = null;
        this.runReject = null;
        reject(err instanceof AgentError ? err : new AgentError('network', String(err)));
      });
    });
  }

  /**
   * 会話対応のセッションへ切り替える（存在しなければ pi が新規扱いにする）。
   */
  async switchSession(sessionPath: string): Promise<void> {
    await this.command({ type: 'switch_session', sessionPath }, 30_000);
  }

  /** プロセスを回収する（SIGKILL→exit 待ち→フェイルセーフ 2s）。再起動可能。 */
  async terminate(): Promise<void> {
    // 承認待ちは実行終了とともに無効になるため取消として解放する
    for (const [id, waiter] of this.approvalWaiters) {
      this.approvalWaiters.delete(id);
      clearTimeout(waiter.timer);
      this.onApprovalResolved?.({ id, approved: false, expired: false, cancelled: true });
      waiter.resolve(false);
    }
    const child = this.child;
    if (!child) return;
    this.killedByUs = true;

    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const onExit = () => {
        clearTimeout(failsafe);
        resolve();
      };
      const failsafe = setTimeout(() => {
        child.removeListener('exit', onExit);
        resolve();
      }, 2000);
      child.once('exit', onExit);
      try {
        child.kill('SIGKILL');
      } catch {
        clearTimeout(failsafe);
        child.removeListener('exit', onExit);
        resolve();
      }
    });
  }
}