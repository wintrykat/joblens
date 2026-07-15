import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts', 'src/types/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.dom.test.ts'],
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['./tests/setup.ts'],
          include: [
            'src/**/*.test.ts',
            'tests/**/*.test.ts',
          ],
          exclude: ['src/**/*.dom.test.ts', '**/*.test.tsx'],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['src/**/*.dom.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.tsx'],
        },
      },
    ],
  },
});
