# Окремий HTTPS-тунель Liftory на Pro

Liftory використовує окремий userspace Tailscale daemon та нову ідентичність вузла. Це зберігає незалежність від чинного тунелю demo home-server: його daemon, socket, ownership record, сертифікати й маршрути не змінюються і не копіюються.

Інструмент перевикористовує вже встановлені офіційні Homebrew binaries `tailscale` та `tailscaled` за перевіреними абсолютними шляхами. Він не встановлює формулу, не запускає `brew services`, не змінює DNS, VPN-інтерфейс чи sleep settings Mac.

## Встановлення та вхід

На Pro у папці Liftory з Node.js 24+:

```sh
node scripts/tunnel.mjs status
node scripts/tunnel.mjs install
node scripts/tunnel.mjs login
```

`install` створює лише власний user LaunchAgent `io.personal.liftory-tunnel`. Свіжий daemon ще не залогінений і не публікує новий API. `login` повертає короткочасний `authURL` на офіційному `login.tailscale.com`; власник відкриває його, обирає свій tailnet і підтверджує додавання окремого вузла. Пароль чи auth key передавати агенту не потрібно. Якщо потрібне схвалення нового пристрою, команда поверне відповідне посилання.

Цей вхід потрібен навіть якщо demo home-server вже авторизований: Liftory не використовує його приватний state. Після підтвердження повтори `status`; очікуваний `backendState` — `Running`. Увімкнення Funnel також може потребувати підтвердження власника за повернутим `approvalURL`.

Повторний `install` може відновити збережені background-маршрути цього Liftory daemon. Він не виконує logout і не очищує ідентичність.

## Маршрути API

| Середовище | Публічний origin                               | Ціль на Pro             |
| ---------- | ---------------------------------------------- | ----------------------- |
| dev        | `https://<liftory-node>.<tailnet>.ts.net`      | `http://127.0.0.1:3481` |
| prod       | `https://<liftory-node>.<tailnet>.ts.net:8443` | `http://127.0.0.1:3482` |

Ім’я береться з авторизованого Liftory daemon; воно не задається вручну й може містити суфікс, якщо назву вже зайнято. Відвідувачам застосунку Tailscale-акаунт не потрібен.

```sh
node scripts/tunnel.mjs enable-dev
node scripts/tunnel.mjs status
node scripts/tunnel.mjs disable-dev
```

Для production існують окремі `enable-prod` / `disable-prod`. Кожна команда змінює лише свій HTTPS-порт і перевіряє збереження сусіднього маршруту. Вона не використовує глобальний `reset`.

Перед публікацією перевіряються власний Compose project `personal-liftory-dev` або `personal-liftory-prod`, service `api`, точні `working_dir` / `config_files`, healthy запущений контейнер, єдиний binding `127.0.0.1:3481` або `3482` до API на порту 3301 і HTTP `/api/health`. Приватні PostgreSQL, Redis, SSH та Docker API не можуть бути довільними цілями CLI. Перевірка тунелю не замінює перевірку точного release digest та версії у backend delivery.

Не додавай вручну інші порти, paths, TCP forwarding, foreground handlers чи Services до цього daemon: менеджер відмовиться приймати або перезаписувати невідому конфігурацію. На помилці ownership record зберігає попередній та бажаний власні маршрути для подальшої перевірки.

## Vercel та зовнішня перевірка

На відповідному Web deployment Vercel вкажи `API_INTERNAL_URL` рівним повернутому `publicURL`, без `/api`. Браузер звертається до `/api/*` на Vercel, а rewrite передає запити до Liftory Funnel. `APP_ORIGIN` API та Google callback залишаються адресами фронтенду Vercel.

Успішне `enable-*` підтверджує тільки локальну конфігурацію та readiness. `publicReachabilityVerified: false` означає, що зовнішній DNS/TLS і точну версію `/api/health` ще потрібно перевірити окремо. Після цього перевіряються реальні OAuth redirects і Secure/HttpOnly cookie через Vercel. Спільне hostname двох портів Funnel не забезпечує ізоляцію browser cookies; користувацькі сесії мають належати окремим origin фронтендів Vercel та різним backend secrets.

## Стан і зупинка

- Власний state, socket і ownership record: `~/.local/share/liftory/tunnel/`, каталог 0700.
- Ідентичність та сертифікати: вкладений `state/`; секрети не друкуються й не зберігаються в Git.
- LaunchAgent: `~/Library/LaunchAgents/io.personal.liftory-tunnel.plist`, файл 0600.
- Операції серіалізує `operation.lock`. Після аварії перевір відсутність активної операції перед ручним видаленням lock.

`status` повертає лише вибрані поля, без peers, облікових записів, login URL та приватного стану. За неперевіреної конфігурації він не стверджує, що публічний доступ вимкнений. Symlink, hard link, чужий LaunchAgent та відкриті приватні файли відхиляються. Виняток для поновленого публічного `.crt` з режимом 0644 діє лише у приватному `state/certs/`; приватні ключі лишаються 0600. Socket з режимом 0666 допускається лише за приватним батьківським каталогом 0700.

```sh
node scripts/tunnel.mjs disable-dev
node scripts/tunnel.mjs disable-prod
node scripts/tunnel.mjs uninstall
```

`uninstall` вимагає вимкнути обидва маршрути, зупиняє тільки Liftory LaunchAgent і зберігає приватну ідентичність. Він не змінює daemon home-server. Нові binaries після оновлення Homebrew потребують перевірки ownership record; менеджер не приймає непомітну підміну executable.

User LaunchAgent запускається після входу власника до macOS. Доступність до FileVault unlock, під час сну або без мережі/Docker не гарантується. Налаштування хоста й резервні копії цим інструментом не змінюються.

## Тимчасовий резерв при збої DNS Funnel

Запити браузера до /api обробляє серверний Node route на Vercel, який звертається до фіксованого API_INTERNAL_URL. Звичайний DNS завжди має пріоритет. Якщо саме його hostname не визначається (ENOTFOUND або EAI_AGAIN), необов’язкова серверна змінна API_DNS_FALLBACK_IPS дозволяє використати до чотирьох явно перевірених IP-адрес через кому. Резерв підтримується лише для HTTPS hostname у ts.net; вміст запиту не може обрати інший сервер.

Це тимчасова операційна міра для інциденту публікації DNS, а не постійна адресація Tailscale. Перед налаштуванням кожну адресу слід перевірити через curl --resolve для точного API hostname зі звичайною перевіркою TLS та очікуваною версією /api/health. Host, SNI і перевірка сертифіката залишаються незмінними; реальні адреси зберігаються лише в конфігурації Vercel. Не вимикайте перевірку TLS.

Оновлюйте змінну лише в production target проєкту liftory-dev, який обслуговує dev-сайт, і перевипускайте перевірений frontend. Окремий prod-проєкт не змінюється. Перевірте публічні health/session та Google sign-in initialization, включно з cookie і callback. Після стабільного відновлення DNS резерв можна видалити з конфігурації наступним деплоєм; IP ingress можуть змінюватися. За збою TLS або HTTP повторного запиту немає, тому мутації не дублюються.

Проксі не кешує API/auth, передає кілька Set-Cookie окремо й має обмеження 4 MiB на тіло запиту та 25 секунд на виконання. Він не є WebSocket proxy. Історичне пояснення інциденту: https://github.com/tailscale/tailscale/issues/21502 та https://github.com/tailscale/tailscale/issues/21698.
