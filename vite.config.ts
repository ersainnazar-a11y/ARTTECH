import { defineConfig } from 'vite';

export default defineConfig({
  // зависимости объявлены заранее: иначе dev-сервер оптимизирует их на лету и перезагружает страницу посреди работы
  optimizeDeps: { include: ['idb', 'jszip', 'mediabunny'] },
  worker: { format: 'es' },
});
