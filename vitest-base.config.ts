/**
 * Vitest base config — auto-discovered by @angular/build:unit-test
 * via findVitestBaseConfig (configuration.js:24-31) which only matches
 * `vitest-base.config.{ts,mts,cts,js,mjs,cjs}`. Prior `vitest.config.ts`
 * filename was silently ignored (executor.js sets `config: false`
 * when no match found, telling Vitest to skip auto-discovery).
 *
 * Builder default `isolate: false` (plugins.js:128) shares the module
 * graph across spec files — `vi.mock` factories race for the cache
 * slot, breaking per-spec firebase mocks. User config overrides this
 * via mergeConfig (plugins.js:156).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'html', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage/chora-web',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.stories.ts',
        'src/**/*.integration.spec.ts',
        'src/integration-tests/**',
        'src/main.ts',
        'src/environments/**',
        'src/**/*.d.ts',
        'src/testing/**',
      ],
    },
  },
});
