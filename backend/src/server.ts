import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { routes } from './routes.js';
import { errorHandler } from './lib/errors.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.senha', 'res.headers.set-cookie'] }));
app.use('/api', routes);
if (env.NODE_ENV === 'production') {
  const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.sendFile('index.html', { root: publicDir });
  });
}
app.use(errorHandler);
app.listen(env.PORT, () => console.log(`API pronta na porta ${env.PORT}`));
