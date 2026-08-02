import { healthHandler } from '../../src/functions/health';

describe('health function', () => {
  it('returns an ok status and ISO timestamp', () => {
    const response = healthHandler({} as never, {} as never);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(
      expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String),
      }),
    );
    expect(new Date((response.jsonBody as { timestamp: string }).timestamp).toISOString()).toBe(
      (response.jsonBody as { timestamp: string }).timestamp,
    );
  });
});
