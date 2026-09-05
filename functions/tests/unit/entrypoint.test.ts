import fs from 'node:fs';
import path from 'node:path';

/**
 * index.ts のルート登録漏れを防ぐ回帰テスト。
 * agent.ts はハンドラ単体テストでは検出できないため、
 * エントリポイントが全 function モジュールを import していることをソース検査する。
 */
describe('function entrypoint wiring', () => {
  it('imports every function module', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'index.ts'), 'utf8');
    const dir = path.join(__dirname, '..', '..', 'src', 'functions');
    const modules = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.ts') && file !== 'request.ts')
      .map((file) => `./functions/${file.replace(/\.ts$/, '')}`);
    for (const module of modules) {
      expect(indexSource).toContain(`import '${module}'`);
    }
  });
});
