import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals:      true,
    environment:  'node',
    include:      ['src/test/**/*.test.ts'],
    setupFiles:   ['./src/test/setup.ts'],
    env: {
      DATABASE_PATH:       ':memory:',
      JWT_SECRET:          'test-jwt-secret-at-least-32-chars!!',
      JWT_REFRESH_SECRET:  'test-refresh-secret-atleast-32chars!',
      ADMIN_PASSWORD:      'Test@Password123!',
      NODE_ENV:            'test',
    },
  },
})
