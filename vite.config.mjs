import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const r = (p) => resolve(import.meta.dirname, p);

export default defineConfig({
  build: {
    target: 'es2020',
    // three грузится лениво, большой чанк ожидаем
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: r('index.html'),
        craft: r('craft/index.html'),
        privacy: r('privacy/index.html'),
        notfound: r('404.html'),
      },
    },
  },
});
