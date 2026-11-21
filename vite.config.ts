import { defineConfig } from 'vite';

export default defineConfig({
  // относительные пути: одна и та же сборка работает на GitHub Pages (/<repo>/), Vercel и из любой папки
  base: './',
  // зависимости объявлены заранее: иначе dev-сервер оптимизирует их на лету и перезагружает страницу посреди работы
  optimizeDeps: { include: ['idb', 'jszip', 'mediabunny'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 4000 }, // essentia.js (WASM внутри) — ~2.5 МБ, грузится только в аудиоворкере
});
