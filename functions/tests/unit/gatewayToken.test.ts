import {
  AccessToken,
  GetTokenOptions,
  TokenCredential,
} from '@azure/identity';
import {
  GatewayTokenProvider,
  loadGatewayTokenConfig,
} from '../../src/services/gatewayToken';

/** expiresOnTimestamp は秒。テストの now は ms。一致させるためのヘルパ。 */
const EXPIRY_SECONDS = 1_800_000_000; // 2027年頃
const EXPIRY_MS = EXPIRY_SECONDS * 1000;

function accessToken(token: string, expiresOnTimestamp: number = EXPIRY_SECONDS): AccessToken {
  return { token, expiresOnTimestamp };
}

class FakeCredential implements TokenCredential {
  public scopes: string[] = [];
  constructor(private readonly result: () => AccessToken | null) {}

  async getToken(
    scopes: string | string[],
    _options?: GetTokenOptions,
  ): Promise<AccessToken | null> {
    this.scopes.push(Array.isArray(scopes) ? scopes.join(',') : scopes);
    return this.result();
  }
}

describe('loadGatewayTokenConfig', () => {
  it('reads the audience from AGENT_GATEWAY_AUDIENCE', () => {
    expect(loadGatewayTokenConfig({})).toEqual({ audience: '' });
    expect(loadGatewayTokenConfig({ AGENT_GATEWAY_AUDIENCE: 'api://gw' })).toEqual({
      audience: 'api://gw',
    });
  });
});

describe('GatewayTokenProvider (F-1: Managed Identity token)', () => {
  it('returns null and is disabled when no audience is configured (dev loopback)', async () => {
    const provider = new GatewayTokenProvider('', null);
    expect(provider.isDisabled()).toBe(true);
    expect(await provider.get()).toBeNull();
  });

  it('requests the audience-scoped token and returns it', async () => {
    const credential = new FakeCredential(() => accessToken('jwt-1'));
    const provider = new GatewayTokenProvider('api://agent-gateway', credential);

    expect(provider.isDisabled()).toBe(false);
    expect(await provider.get()).toBe('jwt-1');
    expect(credential.scopes).toEqual(['api://agent-gateway/.default']);
  });

  it('caches the token and reuses it while still valid', async () => {
    const credential = new FakeCredential(() => accessToken('jwt-1'));
    const provider = new GatewayTokenProvider('api://agent-gateway', credential, () => EXPIRY_MS - 600_000);

    expect(await provider.get()).toBe('jwt-1');
    expect(await provider.get()).toBe('jwt-1'); // 2回目はキャッシュ（再取得しない）
    expect(credential.scopes).toHaveLength(1);
  });

  it('does not refresh while more than 5 minutes remain before expiry', async () => {
    const credential = new FakeCredential(() => accessToken('jwt-1'));
    let now = EXPIRY_MS - 600_000; // 残り 600s > 300s（REFRESH 5min）
    const provider = new GatewayTokenProvider('api://agent-gateway', credential, () => now);

    await provider.get();
    now = EXPIRY_MS - 301_000; // 残り 301s > 300s → キャッシュのまま
    expect(await provider.get()).toBe('jwt-1');
    expect(credential.scopes).toHaveLength(1);
  });

  it('refreshes when less than 5 minutes remain before expiry', async () => {
    const credential = new FakeCredential(() => accessToken('jwt-1'));
    let now = EXPIRY_MS - 600_000; // 残り 600s
    const provider = new GatewayTokenProvider('api://agent-gateway', credential, () => now);

    await provider.get();
    now = EXPIRY_MS - 100_000; // 残り 100s < 300s → 再取得
    expect(await provider.get()).toBe('jwt-1');
    expect(credential.scopes).toHaveLength(2);
  });

  it('throws when the credential returns no token', async () => {
    const credential = new FakeCredential(() => null);
    const provider = new GatewayTokenProvider('api://agent-gateway', credential);
    await expect(provider.get()).rejects.toThrow('Failed to acquire gateway token');
  });
});