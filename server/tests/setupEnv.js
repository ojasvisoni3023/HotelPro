import { inject } from 'vitest';

// Must run before src/config is imported by a test file.
const base = inject('mongoUri');
process.env.MONGODB_URI = `${base.replace(/\/$/, '')}/hotelpro_test`;
