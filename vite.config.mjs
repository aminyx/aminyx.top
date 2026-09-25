import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const r = (p) => resolve(import.meta.dirname, p);

export default defineConfig({
  build: {
    target: 'es2020',
    /* three — единственный тяжёлый чанк; грузится лениво после первой
       отрисовки и только если на странице есть 3D-сцена */
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
