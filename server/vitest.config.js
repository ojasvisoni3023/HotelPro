import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setupEnv.js'],
    // Test files share one in-memory MongoDB; run them one at a time for deterministic state.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
      CLIENT_URL: 'http://localhost:5173',
      PAYMENT_PROVIDER: 'mock',
      RAZORPAY_KEY_ID: 'rzp_test_dummykey',
      RAZORPAY_KEY_SECRET: 'test_key_secret',
      RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
      HOTEL_TIMEZONE: 'Asia/Kolkata',
      // Placeholder; replaced per run by setupEnv.js with the in-memory server URI.
      MONGODB_URI: 'mongodb://127.0.0.1:27017/placeholder',
    },
  },
});
