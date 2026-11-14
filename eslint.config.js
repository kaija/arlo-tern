import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // `*.generated.ts` is written by a tool (`pnpm api:generate`) and must stay as the tool wrote it.
  globalIgnores(['**/dist/', '**/coverage/', 'docs/', '**/*.generated.ts']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain JS config and script files run on Node and are not part of any tsconfig.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // Service configuration, database access and the connector interface are backend only:
    // the first names the backend's secrets, the second opens PostgreSQL connections, the
    // third is how the connector service reads personal accounts, and none is written for
    // the React Native runtime. The mobile app must not import them.
    files: ['apps/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@arlo-tern/shared/config',
              message: 'Service configuration is backend only; see "Configuration" in CLAUDE.md.',
            },
            {
              name: '@arlo-tern/shared/db',
              message: 'Database access is backend only; see "Database" in CLAUDE.md.',
            },
            {
              name: '@arlo-tern/shared/connector',
              message: 'The connector interface is backend only; see "Connector" in CLAUDE.md.',
            },
            {
              name: '@arlo-tern/shared/connector/testing',
              message: 'The connector interface is backend only; see "Connector" in CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  {
    // `testing/` directories hold support code for tests and are left out of the build.
    // Code that imports one compiles and then either ships the test support or, for the
    // fake connector, which has no built form, fails when the built service starts. Only
    // tests and other `testing/` code may import them.
    files: ['packages/*/src/**', 'services/*/src/**'],
    ignores: ['**/*.test.ts', '**/testing/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/testing', '**/testing/**'],
              message: 'Test support only; see the toolchain notes in CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  {
    // The app imports the root entry of the shared package, so that entry must not pull
    // the configuration, the database code or the connector interface in either. This block
    // replaces the one above for that file; the connector pattern covers its test support too.
    files: ['packages/shared/src/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./config', './config/*'],
              message: 'Service configuration is backend only; see "Configuration" in CLAUDE.md.',
            },
            {
              group: ['./db', './db/*'],
              message: 'Database access is backend only; see "Database" in CLAUDE.md.',
            },
            {
              group: ['./connector', './connector/*', './connector/**'],
              message: 'The connector interface is backend only; see "Connector" in CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
