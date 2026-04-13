import type { Config } from 'jest';

const sharedMapper: Record<string, string> = {
  '^@noa/quill-engine/(.*)$': '<rootDir>/../../packages/quill-engine/src/$1',
  '^@/lib/code-studio/pipeline/(.*)$': '<rootDir>/../../packages/quill-engine/src/pipeline/$1',
  '^firebase/firestore$': '<rootDir>/renderer/test-utils/mocks/firebase-firestore.js',
  '^firebase/auth$': '<rootDir>/renderer/test-utils/mocks/firebase-auth.js',
  '^@/engine/hfcp$': '<rootDir>/renderer/test-utils/mocks/engine-hfcp.js',
  '^@/engine/types$': '<rootDir>/renderer/test-utils/mocks/engine-types.js',
  '^@/(.*)$': '<rootDir>/renderer/$1',
  '^@vercel/analytics$': '<rootDir>/renderer/test-utils/vercel-analytics.ts',
  '^@vercel/analytics/next$': '<rootDir>/renderer/test-utils/vercel-analytics.ts',
  '^@/lib/code-studio/ai/worker-loader$': '<rootDir>/renderer/test-utils/mocks/worker-loader.js',
  '\\.(css|less|sass|scss)$': '<rootDir>/renderer/test-utils/css-mock.js',
};

const config: Config = {
  projects: [
    // jsdom environment for lib/engine/service tests (.test.ts)
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'jest-environment-jsdom',
      roots: ['<rootDir>/renderer'],
      moduleNameMapper: {
        ...sharedMapper,
      },
      testMatch: ['**/__tests__/**/*.test.ts'],
      setupFiles: ['<rootDir>/jest.setup.js'],
      testEnvironmentOptions: {
        url: 'http://localhost/',
      },
    },
    // jsdom environment for component tests (.test.tsx)
    {
      displayName: 'components',
      preset: 'ts-jest',
      testEnvironment: 'jest-environment-jsdom',
      roots: ['<rootDir>/renderer'],
      moduleNameMapper: {
        ...sharedMapper,
      },
      testMatch: ['**/__tests__/**/*.test.tsx'],
      setupFiles: ['<rootDir>/jest.setup.components.js'],
      testEnvironmentOptions: {
        url: 'http://localhost/',
      },
    },
  ],
  collectCoverageFrom: [
    'renderer/engine/**/*.ts',
    'renderer/lib/**/*.ts',
    'renderer/lib/**/*.tsx',
    'renderer/hooks/**/*.ts',
    'renderer/hooks/**/*.tsx',
    'renderer/services/**/*.ts',
    '!renderer/**/__tests__/**',
    '!renderer/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 12,
      functions: 18,
      lines: 22,
      statements: 22,
    },
  },
};

export default config;
