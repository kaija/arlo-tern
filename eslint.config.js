import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/', 'docs/']),
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
    // Service configuration is backend only: it names the backend's secrets and is not
    // written for the React Native runtime. The mobile app must not import it.
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
          ],
        },
      ],
    },
  },
  {
    // The app imports the root entry of the shared package, so that entry must not pull
    // the configuration in either.
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
          ],
        },
      ],
    },
  },
  prettier,
);
