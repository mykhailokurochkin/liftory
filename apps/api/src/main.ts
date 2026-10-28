import 'reflect-metadata';
import { createApp } from './app.js';
import { readConfig } from './config.js';

try {
  const config = readConfig();
  const { app } = await createApp(config);
  await app.listen(config.port, config.host);
  console.log(
    JSON.stringify({
      event: 'api_started',
      version: config.version,
      port: config.port,
      development: config.development,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      event: 'api_start_failed',
      message: 'Check API configuration, database migrations and connectivity.',
    }),
  );
  process.exitCode = 1;
}
