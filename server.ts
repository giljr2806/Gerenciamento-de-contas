import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Segredos locais: .env.local tem prioridade sobre .env
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function start() {
  // import dinâmico: o app só lê process.env depois do dotenv acima
  const { createApp } = await import('./server/app');
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Local: escuta só em localhost (não expõe o app na rede)
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Buddha Spa DHO rodando em http://localhost:${PORT}`);
  });
}

start();
