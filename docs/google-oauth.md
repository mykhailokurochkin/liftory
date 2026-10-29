# Google OAuth і доступ користувачів

Код інтеграції не замінює створення власного OAuth client у Google Cloud. Не передавай Client Secret, паролі або токени в чат, issue чи Git.

1. У Google Cloud створи окремий проєкт для liftory або обери свій особистий проєкт.
2. Відкрий Google Auth Platform, налаштуй назву застосунку й support email. Для входу користувачів поза власною Google Workspace організацією обери **External**; особливості Testing описані нижче.
3. Створи OAuth client типу **Web application**.
4. Для local додай JavaScript origin `http://localhost:3300` та redirect URI `http://localhost:3300/api/auth/callback/google`.
5. Збережи Client ID та Client Secret у приватному `.env` на Mac: `GOOGLE_CLIENT_ID` і `GOOGLE_CLIENT_SECRET`. Обери `REGISTRATION_MODE` за правилами нижче та вимкни `LIFTORY_DEV_AUTH`.
6. Перезапусти тільки liftory та перевір вхід, вихід, повторний вхід і відповідність обраному режиму доступу. Для public перевір також вхід другим акаунтом та ізоляцію його записів.

Для dev та prod налаштовуємо сталі HTTPS-адреси фронтенду на Vercel й окремі API-маршрути на Pro. До OAuth client додається **точний origin фронтенду Vercel** і `${ORIGIN}/api/auth/callback/google`; серверний `APP_ORIGIN` має збігатися з цим origin. Vercel проксіює `/api/*`, включно з OAuth callback, на відповідний API через тунель. Поточний demo home-server залишається окремим сервісом. Публічний liftory не запускається з development identity.

Запитуємо лише базовий профіль та email. Сесії обробляє Better Auth; OAuth secrets та session secret залишаються на API. У production потрібні HTTPS, випадковий `BETTER_AUTH_SECRET`, Google client і коректна політика реєстрації. Development identity призначена тільки для loopback local і заборонена production-конфігурацією.

## Політика реєстрації Liftory

- `REGISTRATION_MODE=allowlist` — режим за замовчуванням; доступ мають лише адреси з `ALLOWED_EMAILS`, розділені комами. У розгорнутому backend список має бути непорожнім.
- `REGISTRATION_MODE=public` — доступ має будь-який Google-користувач із підтвердженим email; `ALLOWED_EMAILS` може бути порожнім і не обмежує доступ.

Порожній список сам по собі не відкриває реєстрацію: для цього потрібно явно вказати `public`. Обидва режими перевіряють підтверджений email під час створення користувача й доступу через наявну сесію. Записи тренувань залишаються прив'язаними до власника. Після зміни приватної конфігурації backend потрібно перезапустити.

## Аудиторія Google

Google **External** допускає зовнішні акаунти; **Internal** обмежує вхід учасниками відповідної Google Workspace організації незалежно від політики Liftory.

За [офіційними правилами Google](https://support.google.com/cloud/answer/15549945?hl=en) для запитів лише `openid`, `email` і `profile` діє виняток із обмежень **Testing**: користувача не потрібно додавати до Test users, попередження Testing не показується, а дозвіл не спливає через сім днів. Liftory запитує саме ці базові scopes. Якщо додати інші scopes, виняток перестане діяти; тоді потрібно переглянути публікацію та вимоги перевірки Google. Політики окремих Workspace-акаунтів також можуть обмежувати вхід.

Google Test users і `ALLOWED_EMAILS` Liftory — незалежні налаштування. Відкриття реєстрації не надає доступу до пошти чи інших Google-даних.

Погоджене розміщення Web — Vercel; API й OAuth secrets — Pro. Перед публічним використанням перевіряємо реальний Google redirect, встановлення HttpOnly/Secure cookie через Vercel rewrite, повторний вхід, вихід та ізоляцію dev/prod. Наявність rewrite у коді не підтверджує ці живі перевірки. Див. [план розгортання](deployment.md).

## Адреси створених Vercel projects

| Середовище | Authorized JavaScript origin     | Authorized redirect URI                                   |
| ---------- | -------------------------------- | --------------------------------------------------------- |
| local      | `http://localhost:3300`          | `http://localhost:3300/api/auth/callback/google`          |
| dev        | `https://liftory-dev.vercel.app` | `https://liftory-dev.vercel.app/api/auth/callback/google` |
| prod       | `https://liftory-app.vercel.app` | `https://liftory-app.vercel.app/api/auth/callback/google` |

У Google Cloud Console відкрий [Google Auth Platform / Clients](https://console.cloud.google.com/auth/clients). Власник створює Web application client із цими origins та callbacks і перевіряє аудиторію External для відкритого входу. Завантажений client JSON зберігається приватно на Air. Агенту достатньо передати шлях до файлу та обраний режим доступу; для allowlist також потрібні дозволені адреси: секрет встановлюється на Pro через перевірений SSH, не через чат чи Git. Google consent та справжній вхід потребують участі власника.

Google показує повний Client Secret і дозволяє завантажити його лише під час створення. Якщо вікно вже закрите й секрет не збережений, відкрий свій client → **Client secrets → Add secret**. JSON необов’язковий: потрібні Client ID та новий Client Secret, збережені приватно, наприклад у `~/.config/liftory/google-oauth.json` з mode 0600. Для передачі через буфер Air власник копіює лише новий секрет і повідомляє, що він готовий до приватного збереження; значення не виводиться у відповіді чи журнали. Секрет, надісланий у чат, замінюється; старий вимикається й видаляється після перевірки, що він більше ніде не використовується. Див. [керування OAuth credentials у Google](https://support.google.com/cloud/answer/15549257#client-secret-hashing).
