import globals from 'globals';
import { configs, plugins } from 'eslint-config-airbnb-extended';

const nodeFiles = [
  'build-news.js', 'build/make-images.js', 'build/lib/**/*.js', 'infra/**/*.js', 'test/**/*.js',
  'browser/**/*.js',
  'eslint.config.mjs',
];
const browserFiles = ['js/**/*.js'];

export default [
  {
    ignores: [
      '**/*',
      '!build-news.js',
      '!build/',
      '!build/make-images.js',
      '!build/lib/',
      '!build/lib/**',
      '!eslint.config.mjs',
      '!infra/',
      '!infra/**',
      '!js/',
      '!js/static-backend.js',
      '!js/project-switch.js',
      '!js/forms.js',
      '!test/',
      '!test/**',
      '!browser/',
      '!browser/**',
      '!worker/',
      '!worker/**',
    ],
  },
  plugins.stylistic,
  plugins.importX,
  plugins.node,
  ...configs.base.recommended,
  ...configs.node.recommended.map((config) => ({ ...config, files: nodeFiles })),
  {
    files: nodeFiles,
    languageOptions: { globals: globals.node },
    rules: {
      'n/no-sync': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { sourceType: 'module' },
    rules: { 'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }] },
  },
  {
    files: [
      'build-news.js', 'build/make-images.js', 'build/lib/**/*.js', 'infra/**/*.js', 'test/**/*.js',
      'browser/**/*.js',
    ],
    languageOptions: {
      sourceType: 'commonjs', ecmaVersion: 2022, parserOptions: { ecmaVersion: 2022 },
    },
  },
  {
    files: ['build/make-images.js'],
    rules: { 'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }] },
  },
  {
    files: ['browser/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
      // page.evaluate bodies run in the browser, not in Node
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
  {
    files: browserFiles,
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: {
      'no-underscore-dangle': 'off',
      strict: ['error', 'function'],
    },
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: {
      'import-x/extensions': ['error', 'always', { ignorePackages: true }],
      'no-console': 'off',
    },
  },
  {
    files: ['test/**/*.js', 'worker/**/*.js'],
    languageOptions: { ecmaVersion: 2022, parserOptions: { ecmaVersion: 2022 } },
  },
  {
    files: ['test/worker-*.test.js'],
    rules: {
      'import-x/extensions': ['error', 'always', { ignorePackages: true }],
      'import-x/no-useless-path-segments': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
];
