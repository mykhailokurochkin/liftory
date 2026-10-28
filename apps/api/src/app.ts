import 'reflect-metadata';
import {
  Controller,
  Get,
  Inject,
  Module,
  Post,
  Req,
  Res,
  type ArgumentsHost,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, type Request, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { sql } from 'drizzle-orm';
import type { ApiConfig } from './config.js';
import { createDatabase, type Database } from './database.js';
import { createAuth, localUser, type Authentication } from './auth.js';
import { user } from './schema.js';
import { RecordError, RecordStore } from './records.js';
import { RateLimit } from './rate-limit.js';

const runtimeToken = Symbol('liftory-runtime');
interface Runtime {
  config: ApiConfig;
  database: Database;
  authentication: Authentication;
  records: RecordStore;
  writes: RateLimit;
}
@Controller('api')
class ApiController {
  constructor(@Inject(runtimeToken) private readonly runtime: Runtime) {}
  @Get('health')
  async health(@Res() response: Response) {
    try {
      const applied = await this.runtime.database.db.execute(
        sql`SELECT 1 FROM gym_migration WHERE name = '0001-initial'`,
      );
      if (applied.length !== 1) throw new Error('Schema is not ready.');
      return response.json({ status: 'ok', version: this.runtime.config.version });
    } catch {
      return response.status(503).json({ status: 'unavailable' });
    }
  }
  @Get('session')
  async session(@Req() request: Request, @Res() response: Response) {
    const user = await this.runtime.authentication.getUser(request.headers);
    return response.json({
      user,
      googleConfigured: Boolean(this.runtime.config.googleClientId),
      development: this.runtime.config.development,
    });
  }
  @Get('records')
  async list(@Req() request: Request, @Res() response: Response) {
    const user = await this.runtime.authentication.getUser(request.headers);
    if (!user) return response.status(401).json({ code: 'authentication_required' });
    if (request.headers['x-liftory-owner'] !== user.id)
      return response.status(403).json({ code: 'owner_mismatch' });
    return response.json({ records: await this.runtime.records.list(user.id) });
  }
  @Post('sync')
  async sync(@Req() request: Request, @Res() response: Response) {
    if (request.headers.origin !== this.runtime.config.origin)
      return response.status(403).json({ code: 'origin_not_allowed' });
    const user = await this.runtime.authentication.getUser(request.headers);
    if (!user) return response.status(401).json({ code: 'authentication_required' });
    if (!this.runtime.writes.allow(user.id))
      return response.status(429).json({ code: 'rate_limited' });
    try {
      return response.json(await this.runtime.records.synchronize(user.id, request.body));
    } catch (error) {
      if (error instanceof RecordError)
        return response.status(error.status).json({
          code: error.code,
          ...(error.record !== undefined ? { record: error.record } : {}),
          ...(error.fields ? { fields: error.fields } : {}),
        });
      throw error;
    }
  }
}
@Module({})
class ApiModule {}

export async function createApp(config: ApiConfig) {
  const database = createDatabase(config.databaseURL);
  if (config.development)
    await database.db
      .insert(user)
      .values({ ...localUser, emailVerified: true })
      .onConflictDoNothing();
  const authentication = createAuth(config, database);
  const runtime: Runtime = {
    config,
    database,
    authentication,
    records: new RecordStore(database),
    writes: new RateLimit(240),
  };
  const app = await NestFactory.create(
    {
      module: ApiModule,
      controllers: [ApiController],
      providers: [
        { provide: runtimeToken, useValue: runtime },
        {
          provide: 'database-shutdown',
          useValue: { onApplicationShutdown: () => database.client.end() },
        },
      ],
    },
    { bodyParser: false, logger: false },
  );
  app.getHttpAdapter().getInstance().set('trust proxy', false);
  app.use((request: Request, response: Response, next: () => void) => {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('CDN-Cache-Control', 'no-store');
    response.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Request-ID', crypto.randomUUID());
    next();
  });
  const authBudget = new RateLimit(300);
  app.use('/api/auth', (request: Request, response: Response, next: () => void) => {
    if (!authBudget.allow('all')) return response.status(429).json({ code: 'rate_limited' });
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin !== config.origin
    )
      return response.status(403).json({ code: 'origin_not_allowed' });
    next();
  });
  app.getHttpAdapter().getInstance().all('/api/auth/{*path}', toNodeHandler(authentication.auth));
  app.use(json({ limit: '1mb', strict: true }));
  app.useGlobalFilters({
    catch(error: unknown, host: ArgumentsHost) {
      const response = host.switchToHttp().getResponse<Response>();
      if (response.headersSent) return;
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof error.status === 'number' &&
        [400, 404, 413].includes(error.status)
          ? error.status
          : 500;
      response.status(status).json({
        code:
          status === 413
            ? 'payload_too_large'
            : status === 400
              ? 'invalid_json'
              : status === 404
                ? 'not_found'
                : 'request_failed',
      });
    },
  });
  app.enableShutdownHooks();
  const close = async () => {
    await app.close();
    await database.client.end();
  };
  return { app, database, close };
}
