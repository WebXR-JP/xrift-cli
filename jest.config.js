/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@xrift/code-security$': '<rootDir>/node_modules/@xrift/code-security/dist/index.js',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        diagnostics: {
          ignoreCodes: [151002],
        },
      },
    ],
    'node_modules/@xrift/code-security/.+\\.js$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!@xrift/code-security/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.ts',
    '<rootDir>/src/**/*.{test,spec}.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/types/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
