import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['references/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
