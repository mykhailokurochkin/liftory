# Перевірка Liftory — 2026-10-28

Власник відновив встановлення залежностей для запуску й деплою. Важкі операції виконані на Intel Pro; Air залишається основним Git-репозиторієм. Секрети та runtime state не включаються у вихідний код.

## Підтверджені результати

- `pnpm install` завершений на Pro, створений `pnpm-lock.yaml`. Build scripts дозволені явним `allowBuilds` pnpm 11; peer dependencies узгоджені.
- Format, ESLint та TypeScript усіх чотирьох пакетів успішні.
- 58 Vitest-тестів успішні з реальною окремою PostgreSQL `gym_test`, без пропущених DB-тестів. Наявна назва тестової БД збережена при перейменуванні. Покриття всіх API source files: 86% рядків; contracts/offline/API разом — 90,75%. CI перевіряє пороги 70%.
- 52 native Node-тести успішні: Web config, service worker, безпечна test DB, backend lifecycle, provenance/autodeploy та власний тунель.
- Web і API збираються. Три browser-тести Chrome успішні: mobile та desktop навігація без горизонтального переповнення; offline workout → reload → reconnect → перевірка запису на сервері. Після тестів API/Web процеси й порти закриваються.
- Actionlint 1.7.7 перевірив обидва GitHub workflows на Pro; binary завантажений з офіційного release та звірений за SHA-256.
- Native AMD64 Docker API image зібраний на Pro. Окремий синтетичний Compose smoke перевірив PostgreSQL, міграцію, healthy API, точну verification version, приватні session headers та відмову неавторизованому запиту. Smoke-контейнери, мережі й синтетичний volume прибрані після перевірки.
- Vercel прийняв Web monorepo build із Node 24 / pnpm 11.22.0, workspace packages і custom service-worker build. Dev https://liftory-dev.vercel.app повертає 200; `/sw.js` повертає 200 та `Cache-Control: no-cache`.
- Створені окремі Vercel projects `liftory-dev` та `liftory`; production-адреса зарезервована як https://liftory-app.vercel.app. Production Web deployment ще не виконаний.
- Окремий Liftory userspace Tailscale daemon встановлений на Pro. Після підтвердження власником та перейменування він має стан `Running`, hostname `personal-liftory.tailf02238.ts.net`, нуль health warnings і перевірену конфігурацію. Публічні маршрути dev/prod вимкнені. Ідентичність збережена; приватний state home-server не використовується.

Після перейменування повторно перевірені frozen install, format/lint/typecheck, 58 Vitest і 52 Node-тести, Web/API build, Actionlint, усі три browser-сценарії та новий Docker image `personal-liftory-api:verification`. Окремий Compose smoke підтвердив version `liftory-uncommitted-verification`, readiness PostgreSQL/API, `no-store` для session та HTTP 401 для неавторизованих records/sync. Його синтетичні контейнери, мережі й volume прибрані. Dev Vercel redeploy готовий: HTML title, manifest та service worker перевірені на новому домені. Старий dev alias збережений.

## Що виправлено під час запуску

Browser tests більше не використовують звичайну БД як fallback. Test API/Web працюють зібраними Node-процесами та завершуються разом із harness. Авторизація перевіряє Origin для небезпечних методів і не довіряє підробленим forwarded headers. API/auth не кешуються CDN чи service worker. Vercel build відхиляє відсутній, незахищений або некоректний upstream.

Dev delivery вимагає успішний push-CI поточного develop SHA, перевірений release artifact та незмінний AMD64 digest. Він поважає паузу, ручну зупинку/заміну контейнера, shared lock і retry budget; після невідомої операції не повторює mutation автоматично. Це підтверджено native-тестами, не живим GitHub delivery.

## Незавершені зовнішні кроки

1. Після готовності backend увімкнути його окремий dev Funnel і перевірити зовнішні DNS/TLS та точну API version. Вхід у Tailscale вже підтверджений, upstream dev/prod Vercel узгоджені з фактичним hostname. Якщо Tailscale запросить окремий дозвіл Funnel, його підтверджує власник.
2. Власник створює Google OAuth Web client для сталих dev/prod origins та callbacks. JSON встановлюється приватно на Pro; його не потрібно передавати в чат або Git.
3. Після дозволу власника робляться перший Liftory commit/push та main/develop. Потрібні справжні GitHub CI, release і доступ до GHCR для Liftory.
4. Публікується реальний backend dev, перевіряються зовнішні HTTPS, Vercel rewrite, Google login/logout і cookie-сесія. Тільки після перевіреної ручної доставки встановлюється й вмикається dev updater. Його install/status/uninstall/reinstall перевірені на Pro у paused режимі; установка зараз збережена з enabled=false. Справжня доставка образу через GitHub/GHCR ще не виконана.
5. Перевіряються Safari/PWA на фізичному iPhone; після цього окремо запускається prod. Chrome mobile viewport не є перевіркою iPhone.

## Межі готовності

Dev Web deployment сам по собі не підтверджує доступність backend. OAuth URL/cookie initialization з fixture credentials перевірені, справжній Google login — ні. Верифікаційний Docker image має version `liftory-uncommitted-verification`, що не є Git SHA. CI/CD workflows підготовлені, але ще не запускались у GitHub. Redis/AI-черги та backups не налаштовані; резервні копії власник відклав.

Після перевірок локальний development PostgreSQL зупинений зі збереженням volume. Тимчасові GUI setup/build jobs прибрані; постійні Liftory jobs — окремий Tailscale daemon (`Running`) та paused dev updater без baseline. Старі `gym` LaunchAgent labels відсутні. Air не отримував нових фонових процесів чи важких встановлень.
