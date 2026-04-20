/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  resolver: '<rootDir>/jest-resolver.cjs',
  moduleNameMapper: {
    '^@xrift/code-security$': '<rootDir>/node_modules/@xrift/code-security/dist/index.js',
    '^@xrift/sdk$': '<rootDir>/node_modules/@xrift/sdk/dist/cjs/index.cjs',
    '^@xrift/sdk/node$': '<rootDir>/node_modules/@xrift/sdk/dist/cjs/node/index.cjs',
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
    'node_modules/@xrift/(code-security|sdk)/.+\\.(js|cjs)$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!@xrift/(code-security|sdk)/)',
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
