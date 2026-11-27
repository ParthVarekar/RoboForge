import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { designAi } from './server/designAi';

export default defineConfig({
  // designAi: the Design tab's AI link (dev server only; keeps the OpenRouter key server-side)
  plugins: [react(), designAi()],
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
