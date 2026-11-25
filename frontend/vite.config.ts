import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs keep the static build deployable under any subpath.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
