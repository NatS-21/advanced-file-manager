import './env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { registerSearchRoute } from './routes/search';
import { registerAssetRoutes } from './routes/assets';
import { registerAuthRoutes } from './routes/auth';
import { registerDriveRoutes } from './routes/drive';
import { registerFileRoutes } from './routes/files';
import { registerAnalyticsRoutes } from './routes/analytics';
import { registerCollectionRoutes } from './routes/collections';
import { registerSavedSearchRoutes } from './routes/savedSearches';
import { authPlugin } from './auth/plugin';
import { registerHealthRoutes } from './routes/health';

export async function buildServer() {
  const app = Fastify({ logger: true });

  const corsOrigin = process.env.CORS_ORIGIN;
  const isProd = process.env.NODE_ENV === 'production';
  if (corsOrigin && corsOrigin.trim() !== '') {
    const allowed = corsOrigin
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await app.register(cors, {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowed.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
    });
  } else if (!isProd) {
    await app.register(cors, { origin: true, credentials: true });
  }
  await app.register(helmet, { global: true });
  await app.register(rateLimit, { global: false, max: 120, timeWindow: '1 minute' });
  await app.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 200,
      files: 20,
    },
  });
  await app.register(authPlugin);
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerDriveRoutes(app);
  await registerFileRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerCollectionRoutes(app);
  await registerSavedSearchRoutes(app);
  await registerSearchRoute(app);
  await registerAssetRoutes(app);
  return app;
}

if (require.main === module) {
  buildServer().then((app) => {
    const port = Number(process.env.PORT || 3000);
    app.listen({ port, host: '0.0.0.0' }).catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
  });
}




