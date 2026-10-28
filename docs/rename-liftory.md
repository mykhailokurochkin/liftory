# Перейменування на Liftory — 2026-10-28

Назва продукту — **Liftory**, папка й GitHub-репозиторій — `liftory`. Workspace packages використовують `@liftory/*`, службові змінні — `LIFTORY_*`, Docker projects/images та власні LaunchAgents також мають нову назву.

Папка на Air та Pro: `~/projects/personal-development/liftory`. GitHub: https://github.com/mykhailokurochkin/liftory. Dev-фронтенд повторно розгорнутий на https://liftory-dev.vercel.app. Для майбутнього prod зарезервована https://liftory-app.vercel.app; `liftory.vercel.app` зайнятий іншим власником.

Застосунок не переписує ідентифікатори наявних даних заради зміни бренду:

- SQL `0001-initial.sql` збережений без змін: його checksum уже записаний у БД. Таблиці `gym_migration`, `gym_record`, `gym_receipt` та advisory lock залишаються ідентифікаторами сумісності. Це не назва продукту для користувача.
- IndexedDB `gym-offline-v1` збережений, щоб існуючі drafts/outbox не стали порожнім сховищем після оновлення.
- Наявний PostgreSQL volume та його private DB/user values збережені. На Pro `LIFTORY_LOCAL_DATABASE_VOLUME` посилається на попередній volume, `LIFTORY_LOCAL_DATABASE_EXTERNAL=true` забороняє Compose замінювати його. Нові local-інсталяції отримують власний `personal-liftory-local_database`.
- Старі frontend aliases збережені на час переходу: browser storage належить origin, тому новий домен не може автоматично читати несинхронізовані дані старого. Для перенесення записів між доменами потрібна серверна синхронізація.

Перед переміщенням власні updater/tunnel jobs зняті старими менеджерами. Після перенесення приватних каталогів та перевіреної зміни ownership label вони встановлюються з новими шляхами й іменами. Ідентичність Tailscale зберігається; hostname змінюється штатним CLI. Вміст `tailscaled.state`, ключі й секрети не переписуються й не виводяться.

Фактичний hostname — `personal-liftory.tailf02238.ts.net`, стан `Running`, dev/prod routes вимкнені. Vercel upstream використовує HTTPS 443 для dev та 8443 для prod. `io.personal.liftory-tunnel` та `io.personal.liftory.delivery-dev` встановлені; updater залишається paused без першого baseline. Старі labels зняті. Власні тимчасові smoke-ресурси прибрані.

Це перейменування не додає комітів і не підтверджує готовність справжнього Google OAuth або публічного backend. Callback URI потрібно вказувати для нових frontend origins, наведених у [Google OAuth](google-oauth.md).
