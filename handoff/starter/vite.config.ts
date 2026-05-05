import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // strictPort: вместо «trying another one» при collision — fail fast.
    // Защита от zombie-vite (Q-frontend-N): два dev-процесса на разных
    // портах = stale CSS bundle в HMR кэше браузера = регрессия Phase B.
    strictPort: true,
  },
});
