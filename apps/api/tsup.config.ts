import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/migrate.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  splitting: false,
  clean: true,
  noExternal: ['@liftory/contracts', 'zod'],
  outExtension: () => ({ js: '.mjs' }),
});
