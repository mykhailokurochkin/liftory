# Liftory

Web/API пройшли встановлення, збірки й автоматичні перевірки на Pro. Фронтенд опублікований на https://liftory-app.vercel.app; Google login та публічний API ще потребують зовнішньої конфігурації. Актуальні докази й обмеження — у [звіті перевірки](docs/verification-2026-10-28.md). Початковий стан збережений в [історичному статусі](docs/status-2026-10-27.md).

Особистий щоденник силових тренувань для iPhone та Mac: вправи, підходи, власні плани, історія та offline-збереження з подальшою синхронізацією.

Самостійний репозиторій поруч із home-server. Стек: Next.js, NestJS, TypeScript, PostgreSQL/Drizzle, Better Auth, IndexedDB, Zod, pnpm та Turborepo.

Погоджене розміщення: Next.js на Vercel, API та PostgreSQL на Pro через окремий Liftory HTTPS-тунель. Майбутній Redis також працюватиме на Pro; зараз його не підключено. Публічний frontend dev уже є; production та повна авторизована робота ще не запущені.

## Local

Потрібні Node.js 24+, pnpm 11.22.0 та запущений Docker Desktop. Наявні глобальні версії не змінюються.

```sh
cd ~/projects/personal-development/liftory
pnpm install --frozen-lockfile
pnpm run setup:env
pnpm run db:up
pnpm dev
```

Відкрий `http://localhost:3300`. Web/API перезапускаються після змін без коміту. `.env` створюється з випадковими локальними паролями, режимом `0600` і залишається поза Git. Команда не перезаписує наявний файл.

Початковий local використовує явно позначений development profile. Він працює лише через loopback та заборонений у production. Для справжнього входу потрібен [Google OAuth client](docs/google-oauth.md). API — на 3301, PostgreSQL — тільки `127.0.0.1:55432`, Compose project — `personal-liftory-local`. `pnpm run db:down` зупиняє власну БД та зберігає її том.

## Перевірки

```sh
pnpm run check
pnpm test
pnpm run build
pnpm run test:e2e
```

Тести PostgreSQL потребують `TEST_DATABASE_URL` до окремої тестової БД. Не спрямовуй їх на реальні користувацькі дані. На Mac Playwright використовує встановлений Google Chrome; на CI встановлюється Chromium. Mobile viewport у Chromium не замінює перевірку Safari на фізичному iPhone.

Git flow — `feature/* → develop → main`. CI виконується на GitHub-hosted runner, не запускає PR-код на домашньому Mac та не отримує його SSH-ключ. Гілки liftory і home-server незалежні.

## Документація

- [Архітектура та модель даних](docs/architecture.md)
- [Offline, outbox та обмеження iPhone](docs/offline.md)
- [Налаштування Google OAuth](docs/google-oauth.md)
- [Vercel, Pro та доставка релізів](docs/deployment.md)
- [Backend та контрольована доставка dev](docs/backend-delivery.md)
- [Окремий тунель Liftory](docs/tunnel.md)
- [Перейменування та сумісність наявних даних](docs/rename-liftory.md)

Статус живих перевірок і поточні обмеження фіксуються окремо після запуску. Реальний Google login та публічний dev потребують зовнішньої конфігурації власника. Резервні копії відкладені.
