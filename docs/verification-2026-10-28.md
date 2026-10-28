# Перевірка Liftory — 2026-10-28

Dev https://liftory-dev.vercel.app працює з реальним API та PostgreSQL на Intel Pro. Air залишається основним Git-репозиторієм; важкі операції виконані на Pro. Власник дозволив перший commit/push та необхідні виправлення поточного запуску. Секрети та runtime state не включаються у вихідний код.

## Підтверджені результати

- `pnpm install` завершений на Pro, створений `pnpm-lock.yaml`. Build scripts дозволені явним `allowBuilds` pnpm 11; peer dependencies узгоджені.
- Format, ESLint та TypeScript усіх чотирьох пакетів успішні.
- 58 Vitest-тестів успішні з реальною окремою PostgreSQL `gym_test`, без пропущених DB-тестів. Наявна назва тестової БД збережена при перейменуванні. Покриття всіх API source files: 86% рядків; contracts/offline/API разом — 90,75%. CI перевіряє пороги 70%.
- 55 native Node-тестів успішні: Web config, service worker, безпечна test DB, backend lifecycle, provenance/autodeploy та власний тунель; три регресії перевіряють виправлення колізії release artifact між main/develop.
- Web і API збираються. Три browser-тести Chrome успішні: mobile та desktop навігація без горизонтального переповнення; offline workout → reload → reconnect → перевірка запису на сервері. Після тестів API/Web процеси й порти закриваються.
- Actionlint 1.7.7 перевірив обидва GitHub workflows на Pro; binary завантажений з офіційного release та звірений за SHA-256.
- Native AMD64 Docker API image зібраний на Pro. Окремий синтетичний Compose smoke перевірив PostgreSQL, міграцію, healthy API, точну verification version, приватні session headers та відмову неавторизованому запиту. Smoke-контейнери, мережі й синтетичний volume прибрані після перевірки.
- Vercel прийняв Web monorepo build із Node 24 / pnpm 11.22.0, workspace packages і custom service-worker build. Dev https://liftory-dev.vercel.app повертає 200; `/sw.js` повертає 200 та `Cache-Control: no-cache`.
- [GitHub CI 40782859466](https://github.com/mykhailokurochkin/liftory/actions/runs/40782859466) та [API release 40783342782](https://github.com/mykhailokurochkin/liftory/actions/runs/40783342782) успішні. Після виправлення колізії main/develop API доставлений на Pro за незмінним AMD64 digest. Зовнішній `/api/health` через Vercel повернув 200 і точний SHA `dd7343c1a200c9e9b06a89618160ac6042f63135`; API та PostgreSQL healthy.
- Через реальний Vercel rewrite підтверджені приватна session-відповідь із `no-store`, `googleConfigured: true`, HTTP 401 без авторизації та HTTP 403 для недозволених origins.
- Google OAuth credentials та allowlist власника налаштовані приватно. Ініціалізація Google-входу повертає 200 із правильним frontend callback і state cookie з `Secure`, `HttpOnly`, `SameSite=Lax`, без `Domain`. У свіжому Chrome видима активна кнопка входу відкрила `accounts.google.com`. Серверна перевірка лише кількостей підтвердила один Google account і дві активні сесії дозволеного власника: реальні callback, token exchange і створення account/session успішні. Секрети й персональні дані не виводилися; підтвердження інтерфейсу власником ще очікується.
- Створені окремі Vercel projects `liftory-dev` та `liftory`; production-адреса зарезервована як https://liftory-app.vercel.app. Production Web deployment ще не виконаний.
- Окремий Liftory userspace Tailscale daemon працює на Pro: `Running`, hostname `personal-liftory.tailf02238.ts.net`, ідентичність збережена. Dev Funnel увімкнений і перевірений через публічний HTTPS та Vercel; prod Funnel вимкнений. Приватний state home-server не використовується.

Перевірений dev image: `ghcr.io/mykhailokurochkin/liftory-api@sha256:39f4dbd604e1f1488b399e1477d04f845d9cf95092589685427d8ddfe452a36e`.

Перевірки після перейменування та виправлення доставки: frozen install, format/lint/typecheck, 58 Vitest, 55 Node-тестів, Web/API build, Actionlint і три browser-сценарії успішні. Окремий Compose smoke підтвердив readiness PostgreSQL/API, приватність session та відмову неавторизованим records/sync; його синтетичні контейнери, мережі й volume прибрані. HTML title, manifest та service worker перевірені на новому dev-домені. Старий dev alias збережений.

## Що виправлено під час запуску

Browser tests більше не використовують звичайну БД як fallback. Test API/Web працюють зібраними Node-процесами та завершуються разом із harness. Авторизація перевіряє Origin для небезпечних методів і не довіряє підробленим forwarded headers. API/auth не кешуються CDN чи service worker. Vercel build відхиляє відсутній, незахищений або некоректний upstream.

Dev delivery вимагає успішний push-CI поточного develop SHA, перевірений release artifact та незмінний AMD64 digest. Він поважає паузу, ручну зупинку/заміну контейнера, shared lock і retry budget; після невідомої операції не повторює mutation автоматично. Реальний GitHub/GHCR release доставлений вручну й перевірений. Dev updater увімкнений із healthy baseline `dd7343c1a200c9e9b06a89618160ac6042f63135`. Перший автоматичний GUI tick повернув `already_current`; enabled=true, attempts=0, unknown=false, lastError=null, а Vercel health знову підтвердив точний SHA. Автоматичне застосування нового SHA ще не перевірене. Колізія main/develop artifact усунута та покрита трьома native regression-тестами.

## Що залишається перевірити

1. Власник підтверджує профіль в інтерфейсі dev; перевіряються робота з даними, logout та відмова чужому акаунту. URL dev відкритий на Air; серверне створення Google account/session підтверджене, відповіді власника про UI ще немає.
2. Застосування нового SHA через уже ввімкнений dev updater. Install/status/uninstall/reinstall, healthy baseline та перший tick `already_current` перевірені; самостійне оновлення наступного релізу ще не спостерігали.
3. Safari/PWA на фізичному iPhone та окремий контрольований запуск production. Chrome mobile viewport не замінює iPhone; production Web не розгорнутий, prod Funnel вимкнений.

## Межі готовності

Dev Web та API доступні, hosted CI/release і точна версія реального API підтверджені. Реальний Google callback/token exchange та створення account/session перевірені на сервері; відображення профілю власником, logout, авторизована синхронізація та фізичний iPhone ще не підтверджені. Updater увімкнений; наступна scheduled delivery та production не перевірені. Redis/AI-черги та backups не налаштовані; резервні копії власник відклав.

Локальний development PostgreSQL зупинений зі збереженням volume; реальні dev API/PostgreSQL на Pro працюють окремо. Тимчасові GUI setup/build jobs прибрані; постійні Liftory jobs — окремий Tailscale daemon (`Running`) та enabled dev updater. Старі `gym` LaunchAgent labels відсутні. Air не отримував нових фонових процесів чи важких встановлень.
