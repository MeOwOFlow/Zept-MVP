import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: true,
    passWithNoTests: true,
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'tests/**/*.test-d.ts',
    ],
  },
});
