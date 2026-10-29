# Backend на Pro

Web збирається й розміщується на Vercel. Dockerfile цього репозиторію збирає лише NestJS API. Runtime Compose містить API, одноразову міграцію та PostgreSQL; Web-контейнера й Redis зараз немає.

## Межі середовищ

| Середовище | Compose project       | API на Pro     | БД / користувач |
| ---------- | --------------------- | -------------- | --------------- |
| dev        | personal-liftory-dev  | 127.0.0.1:3481 | liftory_dev     |
| prod       | personal-liftory-prod | 127.0.0.1:3482 | liftory_prod    |

Compose створює окремі мережі й database volume для кожного project. PostgreSQL не публікує порт. API має додаткову egress-мережу для Google OAuth. Через HTTPS-тунель відкривається лише відповідний loopback-порт API; наявний demo home-server не змінюється.

## Приватна конфігурація

На Pro кожне середовище має окремий файл `~/.config/liftory/dev.env` або `prod.env` із mode `0600`. Він залишається поза Git. Заповнюється реальними значеннями; нижче лише перелік полів:

```dotenv
LIFTORY_ENV=dev
LIFTORY_API_PORT=3481
LIFTORY_API_IMAGE=ghcr.io/mykhailokurochkin/liftory-api@sha256:REPLACE_WITH_VERIFIED_DIGEST
LIFTORY_API_COMMIT=REPLACE_WITH_VERIFIED_40_CHARACTER_COMMIT
LIFTORY_DB_NAME=liftory_dev
LIFTORY_DB_USER=liftory_dev
LIFTORY_DB_PASSWORD=REPLACE_WITH_RANDOM_PRIVATE_PASSWORD
LIFTORY_DATABASE_URL=postgresql://liftory_dev:REPLACE_WITH_RANDOM_PRIVATE_PASSWORD@db:5432/liftory_dev
LIFTORY_PUBLIC_ORIGIN=https://REPLACE_WITH_STABLE_VERCEL_FRONTEND
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_PRIVATE_SESSION_SECRET
GOOGLE_CLIENT_ID=REPLACE_WITH_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=REPLACE_WITH_PRIVATE_GOOGLE_CLIENT_SECRET
REGISTRATION_MODE=allowlist
ALLOWED_EMAILS=owner@example.invalid
```

`REGISTRATION_MODE` за замовчуванням дорівнює `allowlist`: у розгорнутому backend потрібен непорожній `ALLOWED_EMAILS`. Для відкритої реєстрації вкажи `REGISTRATION_MODE=public`; тоді список може бути порожнім, і доступ мають усі Google-акаунти з підтвердженим email. Саме очищення списку не відкриває доступ. Політика застосовується і до нових користувачів, і до наявних сесій; дані залишаються окремими для кожного власника. Аудиторія Google налаштовується окремо — див. [Google OAuth](google-oauth.md).

`LIFTORY_PUBLIC_ORIGIN` — точний origin Vercel без кінцевого `/`. Google callback використовує саме цю адресу. Для prod змінюються всі дані середовища, порт і секрети. Скрипт перевіряє відповідність URL БД, імен, портів, origin та image digest; секрети не друкує.

## Ручна доставка

З каталогу Liftory на Pro, використовуючи керовані Node та Docker CLI:

```sh
node scripts/backend.mjs validate --env dev
node scripts/backend.mjs up --env dev
node scripts/backend.mjs status --env dev
node scripts/backend.mjs logs --env dev
node scripts/backend.mjs stop --env dev
```

`up` бере lock приватного config, перевіряє Intel Docker daemon, завантажує незмінний image, очікує успішну міграцію й healthy API, потім перевіряє точний commit у health та відсутність development identity. `stop` зупиняє лише відповідний project і зберігає БД. Автоматичного видалення lock, volume чи rollback міграції немає. Після аварійного завершення lock перевіряється оператором; скрипт не приймає невідомий стан за успіх.

## CI та release

CI на native AMD64 runner перевіряє Web і API, unit/integration/browser сценарії та окремий production API image з реальною PostgreSQL. Smoke використовує лише синтетичні credentials і власний Compose project.

Workflow `Release backend` запускається після успішного push-CI для `develop` або `main` у цьому репозиторії. Він збирає саме перевірений SHA на AMD64, публікує `ghcr.io/mykhailokurochkin/liftory-api` та додає artifact `liftory-backend-<SHA>` із `backend-release.json`: repository, branch, commit, platform, image digest і verified CI run ID. Fork/PR CI не публікує образів.

Це кандидат доставки, а не підтвердження встановлення на Pro. Home-server demo autodeploy не обслуговує Liftory. Доступ Pro до приватного package та незалежне просування Web на Vercel перевіряються окремо. Release workflow, реальний Google OAuth і публічні маршрути не вважаються перевіреними лише через наявність YAML.

## Автоматична доставка dev

Для Liftory підготовлений окремий controller `scripts/delivery.mjs` і GUI LaunchAgent `io.personal.liftory.delivery-dev`. Він не змінює demo home-server, не копіює credentials між машинами й не доставляє production автоматично. GitHub CLI та GHCR на Pro повинні вже мати власну дозволену авторизацію; установка job не створює її.

Спочатку вручну доставляємо й перевіряємо healthy dev backend із реальною приватною конфігурацією. Потім у desktop-сесії Pro, з керованим Node:

```sh
node scripts/deploy-host.mjs install
node scripts/delivery.mjs enable
node scripts/delivery.mjs status
node scripts/delivery.mjs tick
```

Установка створює приватний state і job із перевіркою раз на 60 секунд. Для нового state доставка вимкнена до `enable`. Повторна установка зберігає наявний стан. `enable` приймає лише запущений healthy API з image та health-версією поточної приватної конфігурації й записує його як погоджений baseline.

Controller бере поточний SHA `develop`, шукає однойменний artifact у завершених успішних runs саме `release.yml` цього репозиторію та перевіряє candidate. Він приймає лише власний repository, `develop`, `linux/amd64`, незмінний GHCR digest і підтверджений успішний push-CI для того самого SHA. Сам release run може мати SHA default-гілки через семантику `workflow_run`; джерело релізу звіряється через `verifiedRunId` та CI metadata. Перед зміною ще раз перевіряється голова `develop`.

Тимчасовий ZIP з artifact завантажується у нову приватну папку; приймається лише один `backend-release.json` обмеженого розміру, без розпакування сторонніх шляхів. Тимчасова папка видаляється після читання. Controller не виконує artifact як код.

Після перевірок controller під тим самим lifecycle lock, що ручні `backend up/stop`, атомарно змінює лише `LIFTORY_API_IMAGE` і `LIFTORY_API_COMMIT`, запускає спільну реалізацію `up` і перевіряє healthy image та точну версію. Успіх записується у приватний state. Інші секрети й дані середовища залишаються без змін.

## Пауза, ручні зміни й помилки

```sh
node scripts/delivery.mjs pause
node scripts/backend.mjs stop --env dev
node scripts/deploy-host.mjs status
node scripts/deploy-host.mjs uninstall
```

`pause` забороняє наступну мутацію; операція, що вже почала доставку, може завершитися. Перед зупинкою сервісу спочатку ставимо паузу. Навіть без неї controller не піднімає вручну зупинений або видалений API: він перевіряє running/healthy, container ID, image та hash конфігурації відносно baseline. Ручна заміна контейнера чи конфігурації також зупиняє автоматичні зміни до нового явного `enable` після перевірки оператора.

Безпечні помилки до початку зміни мають backoff і максимум три спроби для поточного SHA. Невідома або перервана операція після фіксації наміру доставки зберігається як `unknown`; автоматичного повторення, очищення lock чи відкочування міграції немає. Оператор перевіряє Docker, конфігурацію й БД, вручну завершує потрібний `backend up`, потім виконує `enable` для нового підтвердженого baseline. Не видаляємо locks лише за їхнім віком.

State лежить у `~/.local/share/liftory/delivery-dev` з приватними правами. Background stdout/stderr направлені в `/dev/null`, тому періодичний job не створює безмежних журналів. `state.json` містить останній результат та лічильники, а `last-error.json` атомарно зберігає лише останній загальний код помилки й час без приватних деталей. Ручні CLI-команди друкують короткий статус. `uninstall` спочатку ставить паузу й відмовляється переривати активну операцію; конфігурація, state та database volumes зберігаються. Сам controller і Compose не оновлюються завантаженим image: їхні зміни доставляються окремо після перевірки вихідного коду.

Наявність цих скриптів не підтверджує установку job, живий GitHub release, реальний GHCR pull чи успішну автоматичну доставку. Ці результати фіксуємо окремо після перевірок на Pro.
