import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'core-rs/pkg/**',
      'core-rs/target/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,ts}'],
    extends: [
      eslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-check': false,
          'ts-expect-error': true,
          'ts-ignore': true,
          'ts-nocheck': true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use a seeded engine Rng instead of Math.random.',
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'Engine modules must not depend on DOM globals.',
        },
        {
          name: 'document',
          message: 'Engine modules must not depend on DOM globals.',
        },
        {
          name: 'navigator',
          message: 'Engine modules must not depend on DOM globals.',
        },
        {
          name: 'location',
          message: 'Engine modules must not depend on DOM globals.',
        },
        {
          name: 'localStorage',
          message: 'Engine modules must not depend on DOM globals.',
        },
        {
          name: 'sessionStorage',
          message: 'Engine modules must not depend on DOM globals.',
        },
        {
          name: 'fetch',
          message: 'Engine modules must not depend on browser I/O.',
        },
        {
          name: 'XMLHttpRequest',
          message: 'Engine modules must not depend on browser I/O.',
        },
        {
          name: 'WebSocket',
          message: 'Engine modules must not depend on browser I/O.',
        },
        {
          name: 'requestAnimationFrame',
          message: 'Engine modules must not schedule real-time work.',
        },
        {
          name: 'cancelAnimationFrame',
          message: 'Engine modules must not schedule real-time work.',
        },
        {
          name: 'setTimeout',
          message: 'Engine modules must not schedule real-time work.',
        },
        {
          name: 'clearTimeout',
          message: 'Engine modules must not schedule real-time work.',
        },
        {
          name: 'setInterval',
          message: 'Engine modules must not schedule real-time work.',
        },
        {
          name: 'clearInterval',
          message: 'Engine modules must not schedule real-time work.',
        },
        {
          name: 'Date',
          message: 'Engine modules must use deterministic simulation ticks.',
        },
        {
          name: 'performance',
          message: 'Engine modules must use deterministic simulation ticks.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'vite',
              message: 'Engine modules must not import browser tooling.',
            },
            {
              name: 'vite/client',
              message: 'Engine modules must not import browser tooling.',
            },
          ],
          patterns: [
            {
              group: [
                '../*',
                '../../*',
                '*.css',
                '*.html',
                '*.less',
                '*.sass',
                '*.scss',
                '*?raw',
                '*?url',
              ],
              message: 'Engine imports must remain pure TypeScript dependencies.',
            },
          ],
        },
      ],
    },
  },
);

