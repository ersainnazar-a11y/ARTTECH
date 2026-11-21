import { defineConfig } from 'vite';

export default defineConfig({
  // Адрес сайта на GitHub Pages: https://ersainnazar-a11y.github.io/ARTTECH/ → base '/ARTTECH/'.
  // BASE_PATH задаётся в workflow деплоя; локально и на Vercel — относительные пути './'.
  base: process.env.BASE_PATH ?? './',
  // зависимости объявлены заранее: иначе dev-сервер оптимизирует их на лету и перезагружает страницу посреди работы
  optimizeDeps: { include: ['idb', 'jszip', 'mediabunny'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 4000 }, // essentia.js (WASM внутри) — ~2.5 МБ, грузится только в аудиоворкере
});
