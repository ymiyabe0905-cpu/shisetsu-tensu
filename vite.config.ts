import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages にデプロイする場合のサブパス
// リポジトリ名: shisetsu-tensu
export default defineConfig({
  plugins: [react()],
  base: '/shisetsu-tensu/',
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    globals: false,
  },
});
