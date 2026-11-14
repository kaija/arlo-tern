import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript source, so tests do not need a build first.
const sourceCondition = '@arlo-tern/source';

export default defineConfig({
  resolve: { conditions: [sourceCondition] },
  ssr: { resolve: { conditions: [sourceCondition] } },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: { name: 'shared', include: ['packages/shared/src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'connector', include: ['services/connector/src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'core', include: ['services/core/src/**/*.test.ts'] },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'services/*/src/**/*.ts'],
      // Entry files only wire things together and start the process; logic lives in tested
      // modules. `testing/` directories hold support code for tests. `*.generated.ts` is
      // written by a tool and holds types only.
      exclude: [
        '**/*.test.ts',
        '**/testing/**',
        '**/*.generated.ts',
        'services/*/src/main.ts',
        'packages/shared/src/db/migrate-main.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
