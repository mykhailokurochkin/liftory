# Розгортання: Vercel + Pro

Погоджено власником 2026-10-28: Next.js розміщується на Vercel; NestJS, PostgreSQL і майбутній Redis — на домашньому Intel Mac Pro. Liftory має власні Git, збірки та CI/CD. Dev Web опублікований на https://liftory-dev.vercel.app; публічний API та повний авторизований запуск ще не готові. Поточні докази — у [звіті перевірки](verification-2026-10-28.md).

## Маршрут запиту

```text
Браузер / PWA → Next.js на Vercel → HTTPS-тунель → NestJS на Pro
                                                      ↓
                                               PostgreSQL
```

Браузер використовує відносні `/api/*` на адресі Vercel. Next.js rewrite передає їх до API на Pro. У браузері зберігається один origin. Перед використанням потрібна реальна перевірка cookies, redirect та поведінки кешу.

Через тунель публікується лише API; він сам перевіряє авторизацію й власника запису. PostgreSQL та Redis залишаються у приватній Docker-мережі без публічних портів. Redis зараз не реалізований; він планується для черг та фонових AI-задач.

## Конфігурація

- На Vercel `API_INTERNAL_URL` — точний публічний HTTPS-origin API, без суфікса `/api`. Історична назва змінної не означає приватну адресу: Vercel має досягати її з інтернету. Поточний rewrite читає цю змінну під час збірки.
- На API `APP_ORIGIN` — стала HTTPS-адреса фронтенду Vercel, а не адреса тунелю.
- Google callback — `${APP_ORIGIN}/api/auth/callback/google`. Vercel передає його на API тим самим rewrite.
- Google Client Secret, session secret і доступ до PostgreSQL залишаються у приватній конфігурації API на Pro. Вони не потрапляють у браузер або `NEXT_PUBLIC_*`.
- Dev та prod мають окремі сталі Web-адреси, API, секрети й дані. Випадковий preview deployment не отримує автоматичного доступу до production API.
- Liftory має власний userspace daemon та нову Tailscale identity на Pro; наявний demo home-server не змінюється. Dev використовує HTTPS 443 → API 3481, prod — HTTPS 8443 → API 3482. Фактичний DNS hostname звіряємо після особистого Tailscale login. Сталі Web origins: https://liftory-dev.vercel.app та https://liftory-app.vercel.app.

## Середовища й доставка

| Середовище    | Web                      | Backend                                    |
| ------------- | ------------------------ | ------------------------------------------ |
| local         | Next.js із hot reload    | Локальний NestJS і власна development БД   |
| dev / develop | Стала dev-адреса Vercel  | Окремі API та PostgreSQL на Pro            |
| prod / main   | Production-адреса Vercel | Окремі production API та PostgreSQL на Pro |

Git flow: `feature/* → develop → main`. CI має перевіряти контракти, тести, PWA й збірки до просування релізу. Для Pro потрібен API Docker image платформи `linux/amd64`, незмінний digest, міграція та readiness перед завершенням доставки. Web та API мають незалежні релізи, тому API-зміни повинні залишатися сумісними з попереднім клієнтом, зокрема кешованим offline.

Поточний home-server autodeploy обслуговує лише свій demo. Liftory має власні backend-only Dockerfile/Compose, CI, release workflow та dev controller. Native-тести controller успішні; живі GitHub release, ручна доставка та ввімкнення updater ще попереду. Деталі — у [backend-delivery.md](backend-delivery.md).

## Стан і наступні кроки

Встановлення, lockfile, check/test/build, PostgreSQL integration, Docker smoke та browser offline-сценарії вже перевірені на Pro. Vercel dev build пройшов зі спільними workspace packages і custom service worker build. Прямий `next build` замість `pnpm run build` пакета Web пропускає цей крок.

Потрібно завершити:

1. Перевірку публічного dev Funnel після готовності API. Tailscale login уже підтверджений; `personal-liftory.tailf02238.ts.net` має стан `Running`, а Vercel upstream відповідає цьому hostname. Публічні маршрути поки вимкнені.
2. Google OAuth client із dev/prod Web callbacks та приватні backend конфігурації на Pro. Redis додається разом із його реальною функцією.
3. Після дозволу власника — перший commit/push, гілки та справжні GitHub CI/release. Створення workflow не підтверджує проходження hosted jobs.
4. Ручну backend dev доставку, HTTPS/Funnel, Google login/logout, cookie forwarding через Vercel та відмову чужому акаунту. Власний dev updater уже встановлений у paused режимі; його явне enable потребує перевіреного backend baseline.
5. Перевірку Safari/PWA на фізичному iPhone та окремий контрольований запуск prod.

## Коли Pro недоступний

Vercel продовжує віддавати фронтенд. Користувач із попередньо збереженим профілем і даними може працювати локально після підготовки offline-оболонки. Перший вхід, завантаження серверних записів та синхронізація очікують API. IndexedDB не є резервною копією; backups власник відклав.
