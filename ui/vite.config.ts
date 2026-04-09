import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({ include: ['buffer'] }),
  ],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/regions': 'http://localhost:3000',
      '/slot': 'http://localhost:3000',
      '/verify': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: [
      '@aztec/bb.js',
      '@noir-lang/noir_js',
      '@noir-lang/backend_barretenberg',
    ],
  },
  build: {
    target: 'esnext',
  },
});
