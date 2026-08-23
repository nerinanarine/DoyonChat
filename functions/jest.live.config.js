/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/live-tests'],
  testMatch: ['**/*.live.test.ts'],
  testTimeout: 60 * 60 * 1000,
  collectCoverage: false,
};
