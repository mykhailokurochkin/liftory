# Розгортання: Vercel + Pro

Погоджено власником 2026-10-28: Next.js розміщується на Vercel; NestJS, PostgreSQL і майбутній Redis — на домашньому Intel Mac Pro. Liftory має власні Git, збірки та CI/CD. Dev https://liftory-dev.vercel.app працює з healthy API/PostgreSQL через власний Funnel. Google callback/token exchange і створення account/session власника підтверджені на сервері; профіль в інтерфейсі та logout ще очікують перевірки. Поточні докази — у [звіті перевірки](verification-2026-10-28.md).

## Маршрут запиту

```text
Браузер / PWA → Next.js на Vercel → HTTPS-тунель → NestJS на Pro
                                                      ↓
                                               PostgreSQL
```

Браузер використовує відносні `/api/*` на адресі Vercel. Next.js rewrite передає їх до API на Pro. У браузері зберігається один origin. На dev перевірені health із точною версією API, приватні session-відповіді без кешування, Google redirect і state cookie. Google account/session створені реально; UI-підтвердження профілю та авторизована синхронізація ще потребують перевірки.

Через тунель публікується лише API; він сам перевіряє авторизацію й власника запису. PostgreSQL та Redis залишаються у приватній Docker-мережі без публічних портів. Redis зараз не реалізований; він планується для черг та фонових AI-задач.

## Конфігурація

- На Vercel `API_INTERNAL_URL` — точний публічний HTTPS-origin API, без суфікса `/api`. Історична назва змінної не означає приватну адресу: Vercel має досягати її з інтернету. Поточний rewrite читає цю змінну під час збірки.
- На API `APP_ORIGIN` — стала HTTPS-адреса фронтенду Vercel, а не адреса тунелю.
- Google callback — `${APP_ORIGIN}/api/auth/callback/google`. Vercel передає його на API тим самим rewrite.
- Google Client Secret, session secret і доступ до PostgreSQL залишаються у приватній конфігурації API на Pro. Вони не потрапляють у браузер або `NEXT_PUBLIC_*`.
- Dev та prod мають окремі сталі Web-адреси, API, секрети й дані. Випадковий preview deployment не отримує автоматичного доступу до production API.
- Liftory має власний userspace daemon та окрему збережену Tailscale identity на Pro; наявний demo home-server не змінюється. Підтверджений hostname — `personal-liftory.tailf02238.ts.net`. Dev використовує HTTPS 443 → API 3481; маршрут увімкнений. Prod HTTPS 8443 → API 3482 залишається вимкненим. Сталі Web origins: https://liftory-dev.vercel.app та https://liftory-app.vercel.app; production Web ще не розгорнутий.

## Середовища й доставка

| Середовище    | Web                      | Backend                                    |
| ------------- | ------------------------ | ------------------------------------------ |
| local         | Next.js із hot reload    | Локальний NestJS і власна development БД   |
| dev / develop | Стала dev-адреса Vercel  | Окремі API та PostgreSQL на Pro            |
| prod / main   | Production-адреса Vercel | Окремі production API та PostgreSQL на Pro |

Git flow: `feature/* → develop → main`. CI має перевіряти контракти, тести, PWA й збірки до просування релізу. Для Pro потрібен API Docker image платформи `linux/amd64`, незмінний digest, міграція та readiness перед завершенням доставки. Web та API мають незалежні релізи, тому API-зміни повинні залишатися сумісними з попереднім клієнтом, зокрема кешованим offline.

Поточний home-server autodeploy обслуговує лише свій demo. Liftory має власні backend-only Dockerfile/Compose, CI, release workflow та dev controller. [CI 40782859466](https://github.com/mykhailokurochkin/liftory/actions/runs/40782859466) та [release 40783342782](https://github.com/mykhailokurochkin/liftory/actions/runs/40783342782) успішні. Реальний digest-pinned AMD64-образ доставлений вручну на Pro; зовнішній Vercel `/api/health` повернув SHA `dd7343c1a200c9e9b06a89618160ac6042f63135`. Dev updater встановлений і ввімкнений із цим healthy baseline; перший автоматичний GUI tick повернув `already_current` без unknown/error. Автоматичне застосування нового SHA ще не перевірене. Деталі — у [backend-delivery.md](backend-delivery.md).

## Стан і наступні кроки

Встановлення, lockfile, check/test/build, PostgreSQL integration, Docker smoke та browser offline-сценарії вже перевірені на Pro. Vercel dev build пройшов зі спільними workspace packages і custom service worker build. Прямий `next build` замість `pnpm run build` пакета Web пропускає цей крок.

Google OAuth credentials та allowlist власника налаштовані приватно. Через Vercel підтверджені `googleConfigured: true`, HTTP 401 без авторизації, HTTP 403 для недозволеного origin та правильний Google callback. State cookie має `Secure`, `HttpOnly`, `SameSite=Lax` і не має `Domain`. Свіжий Chrome відкриває `accounts.google.com` із активної кнопки входу.

Потрібно завершити:

1. Підтвердження профілю в інтерфейсі власником, logout, авторизовану синхронізацію та відмову чужому акаунту.
2. Доставку наступного scheduled release через уже ввімкнений dev updater.
3. Safari/PWA на фізичному iPhone та окремий контрольований запуск prod. Production readiness не підтверджена; production Web не розгорнутий, prod Funnel вимкнений.

Redis додається разом із його реальною функцією.

## Коли Pro недоступний

Vercel продовжує віддавати фронтенд. Користувач із попередньо збереженим профілем і даними може працювати локально після підготовки offline-оболонки. Перший вхід, завантаження серверних записів та синхронізація очікують API. IndexedDB не є резервною копією; backups власник відклав.
