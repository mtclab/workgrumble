import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/helldesk-balance/*.test.ts', 'src/crawler/dashes.test.ts'],
  },
});
