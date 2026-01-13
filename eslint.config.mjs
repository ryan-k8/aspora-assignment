import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['dist/**', 'eslint.config.mjs'],
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      // your rules here
    },
    settings: {
      'import/resolver': {
        typescript: true, // this loads <rootdir>/tsconfig.json to ESLint
      },
    },
  },
  prettierRecommended,
);
