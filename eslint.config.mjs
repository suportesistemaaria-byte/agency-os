import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/migrations/**',
      '**/next-env.d.ts',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Regras de arquitetura: domínios não importam o banco de outros domínios diretamente.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@aos/*/src/*'], message: 'Importe pelo index público do pacote.' }] },
      ],
    },
  },
  { files: ['**/scripts/**', '**/*.test.ts'], rules: { 'no-console': 'off' } },
);
