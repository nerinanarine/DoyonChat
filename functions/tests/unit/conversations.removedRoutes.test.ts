import { HttpFunctionOptions } from '@azure/functions';

jest.mock('@azure/functions', () => {
  const actual = jest.requireActual('@azure/functions');
  return {
    ...actual,
    app: { ...actual.app, http: jest.fn() },
  };
});

import { app } from '@azure/functions';
import '../../src/index';
import * as conversations from '../../src/functions/conversations';

const httpMock = app.http as unknown as jest.Mock;

function registeredRoutes(): string[] {
  return httpMock.mock.calls.map(
    ([, options]: [string, HttpFunctionOptions]) => options.route ?? '',
  );
}

/**
 * 旧通常チャット API の削除を固定する（P1-012 FR-004 / FR-005）。
 * ルート登録は import 時の副作用のため、app.http を捕捉して検証する。
 */
describe('removed normal-chat API surface', () => {
  it('registers neither PUT /conversations/{id}/model nor PUT /conversations/{id}/agent-mode', () => {
    const routes = registeredRoutes();

    expect(routes).not.toContain('conversations/{id}/model');
    expect(routes).not.toContain('conversations/{id}/agent-mode');
  });

  it('does not export the removed handlers', () => {
    const exported = conversations as unknown as Record<string, unknown>;

    expect(exported.modelHandler).toBeUndefined();
    expect(exported.agentModeHandler).toBeUndefined();
  });

  it('keeps the remaining conversation routes registered', () => {
    const routes = registeredRoutes();

    for (const route of [
      'conversations',
      'conversations/{id}',
      'conversations/{id}/title',
      'conversations/{id}/title/auto',
      'conversations/{id}/messages',
      'chat',
      'models',
      'agent/models',
    ]) {
      expect(routes).toContain(route);
    }
  });
});
