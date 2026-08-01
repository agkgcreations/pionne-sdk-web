import { defineConfig } from 'tsup';
import { version } from './package.json';

export default defineConfig({
  entry: ['src/index.ts'],
  // The SDK version travels with every event. Hard-coding it in the source let it drift:
  // published 0.3.8 was still announcing itself as 0.1.0, so every browser event was filed
  // under a version that had not shipped for months. Injected from package.json, it cannot
  // disagree with the published package again.
  define: { __SDK_VERSION__: JSON.stringify(version) },
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
