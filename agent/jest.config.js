/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testTimeout: 60000,
  // jose (jwks-rsa経由) は ESM 専用のため transpile 対象に含める
  transform: { '^.+\\.[tj]sx?$': ['ts-jest', { isolatedModules: true }] },
  transformIgnorePatterns: ['/node_modules/(?!(jose)/)'],
};
