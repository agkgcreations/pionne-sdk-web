import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' };
  },
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2020',
  platform: 'browser',
  treeshake: true,
  // No externals — the SDK is self-contained for the browser.
});
