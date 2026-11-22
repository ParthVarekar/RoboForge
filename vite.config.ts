import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 8060,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['three', 'cannon-es', 'zod', 'lucide-react'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
