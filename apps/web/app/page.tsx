'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  authUserSchema,
  exerciseSchema,
  templateSchema,
  workoutSchema,
  type AuthUser,
  type Exercise,
  type RecordEntity,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
  type WorkoutTemplate,
} from '@liftory/contracts';
import {
  openOfflineStore,
  createSyncEngine,
  type OfflineStore,
  type LocalRecord,
  type SyncState,
} from '@liftory/offline';

type Tab = 'training' | 'history' | 'exercises' | 'templates' | 'settings';
type ModalState =
  | { type: 'exercise'; record?: LocalRecord }
  | { type: 'pick' }
  | { type: 'template'; workout: Workout }
  | { type: 'plan'; record?: LocalRecord }
  | null;
const equipmentNames: Record<Exercise['equipment'], string> = {
  machine: 'Тренажер',
  barbell: 'Штанга',
  dumbbells: 'Гантелі',
  bodyweight: 'Власна вага',
  cable: 'Блок',
  other: 'Інше',
};
const navigation: { id: Tab; label: string; icon: string }[] = [
  { id: 'training', label: 'Тренування', icon: 'activity' },
  { id: 'history', label: 'Історія', icon: 'calendar' },
  { id: 'exercises', label: 'Вправи', icon: 'dumbbell' },
  { id: 'templates', label: 'Плани', icon: 'layers' },
  { id: 'settings', label: 'Профіль', icon: 'user' },
];
const initialSync: SyncState = { status: 'idle', pending: 0, conflicts: 0, lastSyncedAt: null };
const uid = () => crypto.randomUUID();
const formatDate = (value: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('uk-UA', options ?? { day: 'numeric', month: 'long' }).format(
    new Date(value),
  );
const cloneExercises = (exercises: WorkoutExercise[]): WorkoutExercise[] =>
  exercises.map((exercise) => ({
    ...exercise,
    id: uid(),
    sets: exercise.sets.map((set) => ({ ...set, id: uid(), completed: false })),
  }));

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    activity: (
      <>
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" />
      </>
    ),
    dumbbell: (
      <>
        <path d="m6 5 13 13M4 7l3-3m10 16 3-3M2 10l8-8m4 20 8-8M7 13l6-6m-2 10 6-6" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 10 5-10 5L2 8l10-5Zm-9 10 9 5 9-5M3 18l9 5 9-5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    plus: <path d="M12 4v16M4 12h16" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5" />
      </>
    ),
    cloud: (
      <>
        <path d="M7 18H6a5 5 0 1 1 1-10 6 6 0 0 1 11 1 4.5 4.5 0 0 1 0 9h-1" />
        <path d="m9 16 3-3 3 3m-3-3v8" />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    edit: (
      <>
        <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z" />
      </>
    ),
    up: <path d="m6 14 6-6 6 6" />,
    down: <path d="m6 10 6 6 6-6" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.activity}
    </svg>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        Liftory<span className="brand-dot">.</span>
        {!compact && <small>твій тренувальний журнал</small>}
      </span>
    </div>
  );
}

function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="Закрити">
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function LiftoryApp() {
  const [store, setStore] = useState<OfflineStore | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [development, setDevelopment] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [tab, setTab] = useState<Tab>('training');
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sync, setSync] = useState<SyncState>(initialSync);
  const [selectedWorkout, setSelectedWorkout] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const [shellReady, setShellReady] = useState(false);
  const engine = useRef<ReturnType<typeof createSyncEngine> | null>(null);
  const writeQueue = useRef(Promise.resolve());
  const starting = useRef(false);

  useEffect(() => {
    let mounted = true;
    let database: OfflineStore | undefined;
    async function load() {
      try {
        database = await openOfflineStore();
        if (!mounted) {
          database.close();
          return;
        }
        setStore(database);
        const remembered = await database.readRememberedUser();
        try {
          const response = await fetch('/api/session', {
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error('unavailable');
          const session = await response.json();
          if (!mounted) return;
          setGoogleConfigured(session.googleConfigured === true);
          setDevelopment(session.development === true);
          if (session.user) {
            const verified = authUserSchema.parse(session.user);
            await database.rememberUser(verified);
            if (mounted) setUser(verified);
          } else if (remembered) {
            setUser(remembered);
            setAuthRequired(true);
          }
        } catch {
          if (mounted && remembered) {
            setUser(remembered);
            setAuthRequired(true);
          }
        }
      } catch {
        if (mounted)
          setError(
            'Не вдалося відкрити сховище пристрою. Перевір доступ до сховища в браузері та перезавантаж сторінку. Незбережені записи не надсилатимуться.',
          );
      } finally {
        if (mounted) setBooting(false);
      }
    }
    void load();
    return () => {
      mounted = false;
      database?.close();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (store && user) setRecords(await store.list(user.id));
  }, [store, user]);

  useEffect(() => {
    if (!store || !user) return;
    let alive = true;
    const client = createSyncEngine({
      store,
      ownerId: user.id,
      onState: (state) => {
        if (!alive) return;
        setSync(state);
        if (state.status === 'auth_required') setAuthRequired(true);
        else if (state.status === 'idle' && state.lastSyncedAt) setAuthRequired(false);
        void store.list(user.id).then((list) => {
          if (alive) setRecords(list);
        });
      },
    });
    engine.current = client;
    void refresh();
    const stop = client.start();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('liftory-records');
    if (channel)
      channel.onmessage = () => {
        void refresh();
      };
    return () => {
      alive = false;
      stop();
      client.stop();
      engine.current = null;
      channel?.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [store, user, refresh]);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    void navigator.serviceWorker.ready.then(() => setShellReady(true));
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting) setUpdate(registration);
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', () => {
            if (registration.waiting && navigator.serviceWorker.controller) setUpdate(registration);
          });
        });
      })
      .catch(() => {
        setMessage('Offline-оболонку ще не завантажено. Відкрий застосунок онлайн через HTTPS.');
      });
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    if (!message) return;
    const handle = window.setTimeout(() => setMessage(''), 4500);
    return () => window.clearTimeout(handle);
  }, [message]);

  const exercises = records
    .filter((record) => record.kind === 'exercise')
    .map((record) => record.entity.data as Exercise);
  const workouts = records
    .filter((record) => record.kind === 'workout')
    .map((record) => record.entity.data as Workout)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const templates = records
    .filter((record) => record.kind === 'template')
    .map((record) => record.entity.data as WorkoutTemplate)
    .filter((template) => !template.archived);
  const completed = workouts.filter((workout) => workout.status === 'completed');
  const active =
    workouts.find((workout) => workout.id === selectedWorkout) ??
    workouts.find((workout) => workout.status === 'active');
  const current = tab === 'training' ? active : undefined;
  const activeCount = workouts.filter((workout) => workout.status === 'active').length;
  const pending = records.filter((record) => record.pending !== null).length;
  const conflicts = records.filter((record) => record.conflict !== null);
  const totalSets = completed.reduce(
    (count, workout) =>
      count +
      workout.exercises.reduce(
        (sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length,
        0,
      ),
    0,
  );
  const restSeconds = timerEnd ? Math.max(0, Math.ceil((timerEnd - now) / 1000)) : 0;
  const syncLabel = authRequired
    ? 'Потрібен вхід'
    : sync.status === 'error'
      ? 'Синхронізація призупинена'
      : sync.status === 'syncing'
        ? 'Синхронізація'
        : sync.status === 'offline'
          ? 'Збережено на пристрої'
          : conflicts.length
            ? 'Потрібна перевірка'
            : pending
              ? `На пристрої · ${pending}`
              : sync.lastSyncedAt
                ? 'Синхронізовано'
                : 'Дані на пристрої';

  function queueWrite(operation: () => Promise<void>): Promise<boolean> {
    const outcome = writeQueue.current.then(async () => {
      setError('');
      try {
        await operation();
      } catch (cause) {
        setError(
          cause instanceof Error && cause.name === 'StaleRevisionError'
            ? 'Запис змінився в іншій вкладці. Дані оновлено — повтори свою зміну.'
            : 'Не вдалося зберегти зміну. Перевір значення та вільне місце браузера. Зміна ще не збережена.',
        );
        try {
          await refresh();
        } catch {
          /* The original storage error remains visible. */
        }
        return false;
      }
      try {
        await refresh();
      } catch {
        setError('Зміна збережена, але список не вдалося оновити. Перезавантаж застосунок.');
      }
      setMessage('Збережено на пристрої');
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('liftory-records');
          channel.postMessage('changed');
          channel.close();
        }
      } catch {
        /* Storage is already committed; cross-tab notification is best effort. */
      }
      void engine.current?.sync();
      return true;
    });
    writeQueue.current = outcome.then(() => undefined);
    return outcome;
  }

  function saveEntity(entity: RecordEntity, expectedRevision?: number) {
    if (!store || !user) return Promise.resolve(false);
    return queueWrite(async () => {
      await store.save(user.id, entity, expectedRevision);
    });
  }

  function changeWorkout(id: string, change: (workout: Workout) => Workout) {
    if (!store || !user) return Promise.resolve(false);
    return queueWrite(async () => {
      const previous = await store.get(user.id, 'workout', id);
      if (!previous || previous.entity.kind !== 'workout') throw new Error('missing');
      const data = workoutSchema.parse(change(previous.entity.data));
      await store.save(user.id, { kind: 'workout', data }, previous.localRevision);
    });
  }

  async function startWorkout(source?: WorkoutTemplate | Workout) {
    if (starting.current || !store || !user) return;
    starting.current = true;
    try {
      const local = await store.list(user.id, 'workout');
      const existing = local.find(
        (record) => record.entity.kind === 'workout' && record.entity.data.status === 'active',
      );
      if (existing) {
        setSelectedWorkout(existing.id);
        setTab('training');
        setMessage('Спочатку заверши поточне тренування');
        return;
      }
      const data: Workout = {
        id: uid(),
        title: source ? ('name' in source ? source.name : source.title) : 'Вільне тренування',
        status: 'active',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        notes: '',
        exercises: source ? cloneExercises(source.exercises) : [],
      };
      if (await saveEntity({ kind: 'workout', data })) {
        setSelectedWorkout(data.id);
        setTab('training');
      }
    } catch {
      setError('Не вдалося відкрити тренування. Локальне сховище недоступне.');
    } finally {
      starting.current = false;
    }
  }

  async function signIn() {
    setError('');
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== 'string') throw new Error('login');
      window.location.assign(result.url);
    } catch {
      setError('Не вдалося почати вхід. Перевір з’єднання та налаштування Google.');
    }
  }

  async function signOut() {
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('logout');
      engine.current?.stop();
      await store?.forgetUser();
      setUser(null);
      setRecords([]);
      setAuthRequired(false);
      setTab('training');
    } catch {
      setError('Вийти можна після відновлення зв’язку із сервером. Локальні записи збережені.');
    }
  }

  async function addStarterExercises() {
    for (const [name, equipment, muscleGroup] of [
      ['Жим лежачи', 'barbell', 'Груди'],
      ['Присідання', 'barbell', 'Ноги'],
      ['Тяга верхнього блока', 'cable', 'Спина'],
    ] as const)
      await saveEntity({
        kind: 'exercise',
        data: { id: uid(), name, equipment, muscleGroup, notes: '', archived: false },
      });
  }

  function previousResult(exerciseId: string) {
    const previous = completed
      .filter((workout) => workout.id !== current?.id)
      .flatMap((workout) => workout.exercises)
      .find((exercise) => exercise.exerciseId === exerciseId);
    return previous?.sets
      .filter((set) => set.completed)
      .map((set) => `${set.weightKg === null ? 'власна вага' : `${set.weightKg} кг`} × ${set.reps}`)
      .join(' · ');
  }

  if (booting)
    return (
      <main className="boot-screen">
        <Brand />
        <p>Відкриваємо твій журнал…</p>
      </main>
    );

  if (!user)
    return (
      <main className="landing">
        <header className="landing-header">
          <Brand />
          <span className="eyebrow">ОДИН ПІДХІД ЗА РАЗ</span>
        </header>
        <section className="landing-grid">
          <div className="landing-copy">
            <span className="pill">
              <span className="status-dot" /> Твій простір для прогресу
            </span>
            <h1>
              Менше
              <br />
              згадувати.
              <br />
              <span>Більше робити.</span>
            </h1>
            <p>
              Вправи, підходи та маленькі перемоги.
              <br />
              Усе твоє тренування — в одному журналі.
            </p>
            <div className="login-card">
              <h2>Почнемо з твого підходу</h2>
              <p>Увійди, щоб зберігати тренування між пристроями.</p>
              <button
                className="button primary wide"
                onClick={() => void signIn()}
                disabled={!googleConfigured}
              >
                Увійти через Google <Icon name="arrow" />
              </button>
              {!googleConfigured && (
                <p className="helper">Вхід Google ще не активований власником застосунку.</p>
              )}
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="landing-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-sheet">
              <span className="eyebrow">СЬОГОДНІ · ТВОЯ РОБОТА</span>
              <h3>
                Сильнішим.
                <br />
                Крок за кроком.
              </h3>
              <div className="art-bars">
                {[35, 48, 42, 62, 60, 80, 96].map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="art-caption">
                <span>Зусилля складаються.</span>
                <span>↗</span>
              </div>
            </div>
            <div className="art-note">
              <Icon name="check" /> Кожен підхід має значення.
            </div>
          </div>
        </section>
        <footer className="landing-footer">
          <span>СТВОРЕНО ДЛЯ ТВОГО ТЕМПУ</span>
          <span>Журнал • Плани • Прогрес</span>
        </footer>
      </main>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Основна навігація">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? 'nav-item selected' : 'nav-item'}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => {
                setTab(item.id);
                setSearch('');
                if (item.id === 'training') setSelectedWorkout(null);
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'training' && activeCount > 0 && (
                <b className="nav-badge">{activeCount}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            <span className="tiny-mark">↗</span>
            <p>
              Твій темп.
              <br />
              <strong>Твій прогрес.</strong>
            </p>
          </div>
          <button className="profile-button" onClick={() => setTab('settings')}>
            <span className="avatar">{user.name.slice(0, 1).toUpperCase() || 'Т'}</span>
            <span>
              <strong>{user.name || 'Мій профіль'}</strong>
              <small>{development ? 'Локальний профіль' : 'Особистий журнал'}</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-label">ТВІЙ ТРЕНУВАЛЬНИЙ ПРОСТІР</span>
          <button
            className={`sync-indicator ${authRequired || conflicts.length || sync.status === 'error' ? 'attention' : ''}`}
            onClick={() => void engine.current?.sync()}
            aria-label="Синхронізувати"
          >
            <span className={`status-dot ${sync.status === 'syncing' ? 'pulse' : ''}`} />
            {syncLabel}
            <Icon name="sync" size={14} />
          </button>
        </header>
        <main className="workspace">
          {development && (
            <div className="notice subtle">
              <Icon name="user" size={16} />
              <span>Локальний режим розробки · цей профіль доступний лише на твоєму Mac.</span>
            </div>
          )}
          {authRequired && (
            <div className="notice">
              <Icon name="cloud" />
              <span>
                Можна продовжувати запис на цьому пристрої. Для синхронізації увійди тим самим
                акаунтом.
              </span>
              <button className="text-button" onClick={() => void signIn()}>
                Увійти
              </button>
            </div>
          )}
          {sync.status === 'error' && (
            <div className="notice error" role="alert">
              <span>
                {sync.error === 'storage'
                  ? 'Не вдалося прочитати сховище пристрою. Синхронізацію призупинено; успішне збереження нових змін не підтверджене.'
                  : 'Сервер не підтвердив синхронізацію. Локальні зміни залишаються на цьому пристрої.'}
              </span>
              <button className="text-button" onClick={() => void engine.current?.sync()}>
                Повторити
              </button>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label="Приховати помилку"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {conflicts.map((record) => (
            <div className="notice" key={`${record.kind}:${record.id}`}>
              <span>
                Запис «
                {'name' in record.entity.data ? record.entity.data.name : record.entity.data.title}»
                змінено на іншому пристрої. Обидві версії збережені.
              </span>
              <button
                className="text-button"
                onClick={() =>
                  void queueWrite(async () => {
                    await store!.resolveConflict(user.id, record.kind, record.id, 'server');
                  })
                }
              >
                Взяти серверну
              </button>
              {record.kind === 'workout' && (
                <button
                  className="text-button"
                  onClick={() =>
                    void queueWrite(async () => {
                      await store!.resolveConflict(user.id, record.kind, record.id, 'copy');
                    })
                  }
                >
                  Зберегти мою копію
                </button>
              )}
            </div>
          ))}

          {tab === 'training' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {formatDate(new Date().toISOString(), {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  <h1>
                    {current
                      ? current.status === 'completed'
                        ? 'Твоя робота.'
                        : 'Час для підходу.'
                      : `Привіт, ${user.name.split(' ')[0] || 'атлете'}.`}
                  </h1>
                  <p className="page-description">
                    {current
                      ? current.status === 'completed'
                        ? 'Результат збережений. За потреби виправ підходи нижче.'
                        : 'Записуй свій темп. Наступний підхід — за тобою.'
                      : 'Хороший день, щоб стати трохи сильнішим.'}
                  </p>
                </div>
                {!current && (
                  <button className="button primary" onClick={() => void startWorkout()}>
                    <Icon name="plus" />
                    Почати тренування
                  </button>
                )}
              </div>
              {!current ? (
                <>
                  <div className="stat-grid">
                    <Stat label="ТРЕНУВАНЬ" value={completed.length} detail="у твоєму журналі" />
                    <Stat label="ПІДХОДІВ" value={totalSets} detail="вже виконано" />
                    <Stat
                      label="ВЛАСНИХ ПЛАНІВ"
                      value={templates.length}
                      detail="готові до наступного разу"
                    />
                  </div>
                  <div className="home-grid">
                    <section className="hero-card">
                      <span className="eyebrow">ТВОЄ НАСТУПНЕ ТРЕНУВАННЯ</span>
                      <h2>
                        З’явитися.
                        <br />
                        Почати.
                        <br />
                        <em>Зробити своє.</em>
                      </h2>
                      <p>
                        Додай вправи по ходу або відкрий
                        <br className="desktop-only" /> свій готовий план.
                      </p>
                      <button className="button dark" onClick={() => void startWorkout()}>
                        Вільне тренування <Icon name="arrow" />
                      </button>
                      <span className="hero-number" aria-hidden="true">
                        01
                      </span>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Твої плани</h2>
                        <button className="text-button" onClick={() => setTab('templates')}>
                          Усі <Icon name="arrow" size={16} />
                        </button>
                      </div>
                      {templates.length ? (
                        templates.slice(0, 3).map((template, index) => (
                          <button
                            className="plan-row"
                            key={template.id}
                            onClick={() => void startWorkout(template)}
                          >
                            <span className="row-number">{String(index + 1).padStart(2, '0')}</span>
                            <span>
                              <strong>{template.name}</strong>
                              <small>{template.exercises.length} вправ</small>
                            </span>
                            <Icon name="arrow" />
                          </button>
                        ))
                      ) : (
                        <div className="empty small">
                          <Icon name="layers" size={28} />
                          <h3>Свій план — свій ритм</h3>
                          <p>
                            Збережи тренування як план,
                            <br />
                            щоб швидко повторювати його.
                          </p>
                          <button
                            className="text-button"
                            onClick={() => setModal({ type: 'plan' })}
                          >
                            Створити план <Icon name="arrow" size={16} />
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                  <section className="recent-section">
                    <div className="section-heading">
                      <h2>Останні тренування</h2>
                      <button className="text-button" onClick={() => setTab('history')}>
                        Історія <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    {completed.length ? (
                      completed.slice(0, 3).map((workout) => (
                        <HistoryRow
                          key={workout.id}
                          workout={workout}
                          open={() => {
                            setSelectedWorkout(workout.id);
                            setTab('training');
                          }}
                        />
                      ))
                    ) : (
                      <div className="empty-line">
                        Тут буде твоя історія. Почни з першого тренування.
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className="workout-toolbar">
                    <div>
                      <span className="eyebrow">
                        {current.status === 'active' ? 'ТРЕНУВАННЯ ТРИВАЄ' : 'ЗАВЕРШЕНЕ ТРЕНУВАННЯ'}
                      </span>
                      <DraftText
                        id={current.id + '-title'}
                        label="Назва тренування"
                        className="workout-title-input"
                        value={current.title}
                        maxLength={100}
                        update={(title) => {
                          if (title.trim())
                            void changeWorkout(current.id, (workout) => ({
                              ...workout,
                              title: title.trim(),
                            }));
                        }}
                      />
                      <span className="muted">
                        {formatDate(current.startedAt)} · {current.exercises.length} вправ ·{' '}
                        {current.exercises.reduce(
                          (sum, exercise) =>
                            sum + exercise.sets.filter((set) => set.completed).length,
                          0,
                        )}{' '}
                        підходів
                      </span>
                    </div>
                    <div className="toolbar-actions">
                      <button
                        className="button secondary"
                        onClick={() => setModal({ type: 'template', workout: current })}
                      >
                        <Icon name="layers" size={18} />
                        Зберегти план
                      </button>
                      {current.status === 'active' && (
                        <button
                          className="button dark"
                          onClick={() =>
                            void changeWorkout(current.id, (workout) => ({
                              ...workout,
                              status: 'completed',
                              finishedAt: new Date().toISOString(),
                            }))
                          }
                        >
                          Завершити <Icon name="check" size={18} />
                        </button>
                      )}
                    </div>
                  </section>
                  {timerEnd && (
                    <div className="rest-timer" role="timer" aria-label="Таймер відпочинку">
                      <Icon name="clock" />
                      <span>Відпочинок</span>
                      <strong>
                        {Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}
                      </strong>
                      <button
                        className="text-button"
                        onClick={() => setTimerEnd((end) => (end ?? Date.now()) + 30000)}
                      >
                        +30 с
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => setTimerEnd(null)}
                        aria-label="Закрити таймер"
                      >
                        <Icon name="close" size={17} />
                      </button>
                    </div>
                  )}
                  {current.exercises.length === 0 && (
                    <div className="empty workout-empty">
                      <span className="empty-icon">
                        <Icon name="dumbbell" size={32} />
                      </span>
                      <h2>Перший підхід починається з вправи</h2>
                      <p>Обери з каталогу або створи свою вправу.</p>
                    </div>
                  )}
                  <div className="workout-exercises">
                    {current.exercises.map((exercise, index) => (
                      <section className="exercise-card" key={exercise.id}>
                        <div className="exercise-card-heading">
                          <span className="exercise-index">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div>
                            <span className="eyebrow">{equipmentNames[exercise.equipment]}</span>
                            <h2>{exercise.name}</h2>
                          </div>
                          <div className="exercise-actions">
                            <button
                              className="icon-button"
                              aria-label={`Підняти ${exercise.name}`}
                              disabled={index === 0}
                              onClick={() =>
                                void changeWorkout(current.id, (workout) => {
                                  const list = [...workout.exercises];
                                  [list[index - 1], list[index]] = [list[index]!, list[index - 1]!];
                                  return { ...workout, exercises: list };
                                })
                              }
                            >
                              <Icon name="up" size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Опустити ${exercise.name}`}
                              disabled={index === current.exercises.length - 1}
                              onClick={() =>
                                void changeWorkout(current.id, (workout) => {
                                  const list = [...workout.exercises];
                                  [list[index + 1], list[index]] = [list[index]!, list[index + 1]!];
                                  return { ...workout, exercises: list };
                                })
                              }
                            >
                              <Icon name="down" size={17} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Прибрати ${exercise.name}`}
                              onClick={() =>
                                void changeWorkout(current.id, (workout) => ({
                                  ...workout,
                                  exercises: workout.exercises.filter(
                                    (item) => item.id !== exercise.id,
                                  ),
                                }))
                              }
                            >
                              <Icon name="close" size={17} />
                            </button>
                          </div>
                        </div>
                        {previousResult(exercise.exerciseId) && (
                          <p className="previous-result">
                            Минулого разу <strong>{previousResult(exercise.exerciseId)}</strong>
                          </p>
                        )}
                        <div className="set-table">
                          <div className="set-head">
                            <span>ПІДХІД</span>
                            <span>ВАГА, КГ</span>
                            <span>ПОВТОРИ</span>
                            <span>ГОТОВО</span>
                            <span />
                          </div>
                          {exercise.sets.map((set, setIndex) => (
                            <SetRow
                              key={set.id}
                              set={set}
                              exercise={exercise.name}
                              index={setIndex}
                              update={(patch) =>
                                void changeWorkout(current.id, (workout) => ({
                                  ...workout,
                                  exercises: workout.exercises.map((item) =>
                                    item.id === exercise.id
                                      ? {
                                          ...item,
                                          sets: item.sets.map((entry) =>
                                            entry.id === set.id ? { ...entry, ...patch } : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                              toggle={() => {
                                if (!set.completed && current.status === 'active')
                                  setTimerEnd(Date.now() + 90000);
                                void changeWorkout(current.id, (workout) => ({
                                  ...workout,
                                  exercises: workout.exercises.map((item) =>
                                    item.id === exercise.id
                                      ? {
                                          ...item,
                                          sets: item.sets.map((entry) =>
                                            entry.id === set.id
                                              ? { ...entry, completed: !entry.completed }
                                              : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }));
                              }}
                              remove={() =>
                                void changeWorkout(current.id, (workout) => ({
                                  ...workout,
                                  exercises: workout.exercises.map((item) =>
                                    item.id === exercise.id
                                      ? {
                                          ...item,
                                          sets: item.sets.filter((entry) => entry.id !== set.id),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          ))}
                        </div>
                        <button
                          className="add-set-button"
                          disabled={exercise.sets.length >= 50}
                          onClick={() =>
                            void changeWorkout(current.id, (workout) => ({
                              ...workout,
                              exercises: workout.exercises.map((item) =>
                                item.id === exercise.id
                                  ? {
                                      ...item,
                                      sets: [
                                        ...item.sets,
                                        {
                                          id: uid(),
                                          weightKg:
                                            item.sets.at(-1)?.weightKg ??
                                            (item.equipment === 'bodyweight' ? null : 0),
                                          reps: item.sets.at(-1)?.reps ?? 10,
                                          completed: false,
                                        },
                                      ],
                                    }
                                  : item,
                              ),
                            }))
                          }
                        >
                          <Icon name="plus" size={16} />
                          Додати підхід
                        </button>
                      </section>
                    ))}
                  </div>
                  <button
                    className="add-exercise-button"
                    disabled={current.exercises.length >= 50}
                    onClick={() => setModal({ type: 'pick' })}
                  >
                    <Icon name="plus" />
                    Додати вправу
                  </button>
                  <label className="field workout-notes">
                    Нотатка до тренування
                    <DraftText
                      id={current.id + '-notes'}
                      label="Нотатка до тренування"
                      value={current.notes}
                      maxLength={2000}
                      multiline
                      placeholder="Як самопочуття? Що варто запам’ятати?"
                      update={(notes) =>
                        void changeWorkout(current.id, (workout) => ({ ...workout, notes }))
                      }
                    />
                  </label>
                  <p className="storage-note">
                    <Icon name="cloud" size={16} />
                    Підходи зберігаються на пристрої. Синхронізація продовжиться, коли буде зв’язок.
                  </p>
                </>
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              <PageHeading
                eyebrow="КОЖЕН ПІДХІД РАХУЄТЬСЯ"
                title="Твоя історія."
                description="Те, що вже зроблено. І те, на чому будується прогрес."
              />
              <div className="stat-grid">
                <Stat label="ТРЕНУВАНЬ" value={completed.length} detail="завершено" />
                <Stat label="ПІДХОДІВ" value={totalSets} detail="виконано" />
                <Stat
                  label="ВПРАВ"
                  value={exercises.filter((exercise) => !exercise.archived).length}
                  detail="у твоєму каталозі"
                />
              </div>
              {workouts.length ? (
                <div className="panel history-list">
                  {workouts.map((workout) => (
                    <div className="history-item" key={workout.id}>
                      <HistoryRow
                        workout={workout}
                        open={() => {
                          setSelectedWorkout(workout.id);
                          setTab('training');
                        }}
                      />
                      <button
                        className="text-button repeat-button"
                        onClick={() => void startWorkout(workout)}
                      >
                        Повторити <Icon name="sync" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  icon="calendar"
                  title="Історія почнеться з першого тренування"
                  text="Записуй вправи й підходи — вони залишаться тут."
                  action={
                    <button className="button primary" onClick={() => void startWorkout()}>
                      Почати тренування <Icon name="arrow" />
                    </button>
                  }
                />
              )}
            </>
          )}

          {tab === 'exercises' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">ТВОЯ БАЗА РУХУ</p>
                  <h1>Вправи.</h1>
                  <p className="page-description">Від штанги до власної ваги. Збирай свій набір.</p>
                </div>
                <button className="button primary" onClick={() => setModal({ type: 'exercise' })}>
                  <Icon name="plus" />
                  Додати вправу
                </button>
              </div>
              <label className="search-field">
                <span className="sr-only">Пошук вправ</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Знайти вправу або групу м’язів…"
                />
              </label>
              <div className="catalog-grid">
                {exercises
                  .filter(
                    (exercise) =>
                      !exercise.archived &&
                      `${exercise.name} ${exercise.muscleGroup}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((exercise) => (
                    <article className="catalog-card" key={exercise.id}>
                      <div className="catalog-top">
                        <span className="equipment-tag">{equipmentNames[exercise.equipment]}</span>
                        <button
                          className="icon-button"
                          aria-label={`Редагувати ${exercise.name}`}
                          onClick={() =>
                            setModal({
                              type: 'exercise',
                              record: records.find(
                                (record) => record.kind === 'exercise' && record.id === exercise.id,
                              ),
                            })
                          }
                        >
                          <Icon name="edit" size={18} />
                        </button>
                      </div>
                      <div className="catalog-symbol">
                        <Icon name="dumbbell" size={29} />
                      </div>
                      <h2>{exercise.name}</h2>
                      <p>{exercise.muscleGroup || 'Групу м’язів не вказано'}</p>
                      {exercise.notes && <small>{exercise.notes}</small>}
                    </article>
                  ))}
              </div>
              {!exercises.some((exercise) => !exercise.archived) && (
                <Empty
                  icon="dumbbell"
                  title="Твій набір вправ"
                  text="Додай улюблену вправу або почни з невеликого базового набору."
                  action={
                    <button className="button secondary" onClick={() => void addStarterExercises()}>
                      Додати базові вправи <Icon name="plus" />
                    </button>
                  }
                />
              )}
            </>
          )}

          {tab === 'templates' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">МЕНШЕ ПІДГОТОВКИ, БІЛЬШЕ РУХУ</p>
                  <h1>Твої плани.</h1>
                  <p className="page-description">
                    Готовий порядок вправ і підходів для наступного разу.
                  </p>
                </div>
                <button className="button primary" onClick={() => setModal({ type: 'plan' })}>
                  <Icon name="plus" />
                  Створити план
                </button>
              </div>
              <div className="template-grid">
                {templates.map((template, index) => (
                  <article className="template-card" key={template.id}>
                    <div className="template-top">
                      <span className="eyebrow">ПЛАН {String(index + 1).padStart(2, '0')}</span>
                      <div className="template-actions">
                        <button
                          className="icon-button"
                          aria-label={`Редагувати план ${template.name}`}
                          onClick={() =>
                            setModal({
                              type: 'plan',
                              record: records.find(
                                (record) => record.kind === 'template' && record.id === template.id,
                              ),
                            })
                          }
                        >
                          <Icon name="edit" size={18} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Архівувати план ${template.name}`}
                          onClick={() =>
                            void saveEntity(
                              { kind: 'template', data: { ...template, archived: true } },
                              records.find(
                                (record) => record.kind === 'template' && record.id === template.id,
                              )?.localRevision,
                            )
                          }
                        >
                          <Icon name="trash" size={18} />
                        </button>
                      </div>
                    </div>
                    <h2>{template.name}</h2>
                    <p>
                      {template.exercises.length} вправ ·{' '}
                      {template.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)}{' '}
                      підходів
                    </p>
                    <div className="template-exercises">
                      {template.exercises.slice(0, 4).map((exercise) => (
                        <span key={exercise.id}>{exercise.name}</span>
                      ))}
                      {template.exercises.length > 4 && (
                        <span>+ ще {template.exercises.length - 4}</span>
                      )}
                    </div>
                    <button
                      className="button dark wide"
                      onClick={() => void startWorkout(template)}
                    >
                      Почати за планом <Icon name="arrow" />
                    </button>
                  </article>
                ))}
              </div>
              {!templates.length && (
                <Empty
                  icon="layers"
                  title="Тренування, яке хочеться повторити"
                  text="Збери вправи й заплановані підходи у свій шаблон. Також можна зберегти будь-яке тренування як план."
                  action={
                    <button className="button primary" onClick={() => setModal({ type: 'plan' })}>
                      Створити перший план <Icon name="plus" />
                    </button>
                  }
                />
              )}
            </>
          )}

          {tab === 'settings' && (
            <>
              <PageHeading
                eyebrow="ТВІЙ ОСОБИСТИЙ ПРОСТІР"
                title="Профіль."
                description="Обліковий запис, збереження й робота без мережі."
              />
              <section className="panel profile-panel">
                <span className="avatar large">{user.name.slice(0, 1).toUpperCase()}</span>
                <h2>{user.name}</h2>
                <p>{user.email}</p>
                <span className="equipment-tag">
                  {development ? 'Локальна розробка' : 'Google-акаунт'}
                </span>
              </section>
              <section className="panel settings-panel">
                <h2>Збереження та зв’язок</h2>
                <div className="setting-row">
                  <div>
                    <strong>Стан синхронізації</strong>
                    <p>
                      {pending ? `${pending} записів очікують надсилання` : 'Немає змін у черзі'}
                    </p>
                  </div>
                  <button className="button secondary" onClick={() => void engine.current?.sync()}>
                    <Icon name="sync" size={17} />
                    Синхронізувати
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Без інтернету</strong>
                    <p>
                      {shellReady
                        ? 'Offline-оболонка готова на цьому пристрої. '
                        : 'Offline-оболонка ще не готова. Потрібні HTTPS і перше завантаження онлайн. '}
                      Відкрий застосунок онлайн хоча б раз. Надалі можна записувати тренування, а
                      синхронізація відновиться у відкритому застосунку при появі зв’язку.
                    </p>
                  </div>
                  <Icon name="cloud" />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Зберігання на пристрої</strong>
                    <p>
                      Очищення даних браузера видалить локальні записи. Невідправлені зміни існують
                      лише на цьому пристрої.
                    </p>
                  </div>
                </div>
                {update && (
                  <div className="setting-row">
                    <div>
                      <strong>Доступна нова версія</strong>
                      <p>
                        {activeCount
                          ? 'Заверши тренування перед оновленням застосунку.'
                          : 'Оновлення готове до встановлення.'}
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={activeCount > 0}
                      onClick={() => {
                        update.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
                        navigator.serviceWorker.addEventListener(
                          'controllerchange',
                          () => window.location.reload(),
                          { once: true },
                        );
                      }}
                    >
                      Оновити
                    </button>
                  </div>
                )}
              </section>
              {!development && (
                <button className="button secondary logout-button" onClick={() => void signOut()}>
                  Вийти з акаунта
                </button>
              )}
              <p className="storage-note">
                Невідправлені записи залишаються прив’язаними до цього акаунта після виходу.
              </p>
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>ОДИН ПІДХІД ЗА РАЗ.</span>
          <span>Зроблено для твого темпу ↗</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Мобільна навігація">
        {navigation.map((item) => (
          <button
            key={item.id}
            aria-current={tab === item.id ? 'page' : undefined}
            className={tab === item.id ? 'selected' : ''}
            onClick={() => {
              setTab(item.id);
              if (item.id === 'training') setSelectedWorkout(null);
            }}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {message && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {message}
        </div>
      )}

      {modal?.type === 'exercise' && (
        <Dialog
          title={modal.record ? 'Редагувати вправу' : 'Нова вправа'}
          close={() => setModal(null)}
        >
          <ExerciseForm
            record={modal.record}
            save={async (data) => {
              const saved = await saveEntity(
                { kind: 'exercise', data },
                modal.record?.localRevision,
              );
              if (saved) setModal(null);
              return saved;
            }}
          />
        </Dialog>
      )}
      {modal?.type === 'pick' && current && (
        <Dialog title="Додати вправу" close={() => setModal(null)}>
          <label className="search-field">
            <span className="sr-only">Знайти вправу для тренування</span>
            <input
              autoFocus
              placeholder="Назва вправи…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="picker-list">
            {exercises
              .filter(
                (exercise) =>
                  !exercise.archived && exercise.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((exercise) => (
                <button
                  className="picker-row"
                  key={exercise.id}
                  onClick={() => {
                    void changeWorkout(current.id, (workout) => ({
                      ...workout,
                      exercises: [
                        ...workout.exercises,
                        {
                          id: uid(),
                          exerciseId: exercise.id,
                          name: exercise.name,
                          equipment: exercise.equipment,
                          sets: [
                            {
                              id: uid(),
                              weightKg: exercise.equipment === 'bodyweight' ? null : 0,
                              reps: 10,
                              completed: false,
                            },
                          ],
                        },
                      ],
                    }));
                    setModal(null);
                    setSearch('');
                  }}
                >
                  <span>
                    <strong>{exercise.name}</strong>
                    <small>
                      {equipmentNames[exercise.equipment]} ·{' '}
                      {exercise.muscleGroup || 'Власна вправа'}
                    </small>
                  </span>
                  <Icon name="plus" />
                </button>
              ))}
          </div>
          <button
            className="button secondary wide"
            onClick={() => {
              setSearch('');
              setModal({ type: 'exercise' });
            }}
          >
            <Icon name="plus" />
            Створити свою вправу
          </button>
        </Dialog>
      )}
      {modal?.type === 'plan' && (
        <Dialog
          title={modal.record ? 'Редагувати план' : 'Новий план'}
          close={() => setModal(null)}
        >
          <PlanEditor
            record={modal.record}
            exercises={exercises.filter((exercise) => !exercise.archived)}
            save={async (data) => {
              const saved = await saveEntity(
                { kind: 'template', data },
                modal.record?.localRevision,
              );
              if (saved) setModal(null);
              return saved;
            }}
          />
        </Dialog>
      )}
      {modal?.type === 'template' && (
        <Dialog title="Зберегти як план" close={() => setModal(null)}>
          <TemplateForm
            workout={modal.workout}
            save={async (data) => {
              const saved = await saveEntity({ kind: 'template', data });
              if (saved) setModal(null);
              return saved;
            }}
          />
        </Dialog>
      )}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="stat-card">
      <span className="eyebrow">{label}</span>
      <strong>{String(value).padStart(2, '0')}</strong>
      <span>{detail}</span>
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty large">
      <span className="empty-icon">
        <Icon name={icon} size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function HistoryRow({ workout, open }: { workout: Workout; open: () => void }) {
  const sets = workout.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  return (
    <button className="history-row" onClick={open}>
      <span className="history-date">
        <strong>{new Date(workout.startedAt).getDate()}</strong>
        <small>{formatDate(workout.startedAt, { month: 'short' })}</small>
      </span>
      <span className="history-info">
        <strong>{workout.title}</strong>
        <small>
          {workout.exercises.length} вправ · {sets} підходів{' '}
          {workout.status === 'active' ? '· триває' : ''}
        </small>
      </span>
      <span className="history-complete">
        <Icon name={workout.status === 'active' ? 'clock' : 'check'} size={17} />
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
}

function DraftText({
  id,
  label,
  value,
  update,
  maxLength,
  className,
  multiline = false,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  update: (value: string) => void;
  maxLength: number;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value, id]);
  const props = {
    'aria-label': label,
    className,
    maxLength,
    value: draft,
    placeholder,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = event.target.value;
      setDraft(next);
      update(next);
    },
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

function SetRow({
  set,
  exercise,
  index,
  update,
  toggle,
  remove,
}: {
  set: WorkoutSet;
  exercise: string;
  index: number;
  update: (patch: Partial<WorkoutSet>) => void;
  toggle: () => void;
  remove: () => void;
}) {
  const [weight, setWeight] = useState(set.weightKg === null ? '' : String(set.weightKg));
  const [reps, setReps] = useState(String(set.reps));
  const [error, setError] = useState('');
  const weightFocused = useRef(false);
  const repsFocused = useRef(false);
  const parsedWeight = weight.trim() === '' ? null : Number(weight.replace(',', '.'));
  const parsedReps = Number(reps);
  const validWeight =
    parsedWeight === null ||
    (Number.isFinite(parsedWeight) && parsedWeight >= 0 && parsedWeight <= 2000);
  const validReps = Number.isInteger(parsedReps) && parsedReps >= 1 && parsedReps <= 1000;
  useEffect(() => {
    if (!weightFocused.current) setWeight(set.weightKg === null ? '' : String(set.weightKg));
  }, [set.weightKg]);
  useEffect(() => {
    if (!repsFocused.current) setReps(String(set.reps));
  }, [set.reps]);
  return (
    <>
      <div className={`set-row ${set.completed ? 'done' : ''}`}>
        <span className="set-index">{String(index + 1).padStart(2, '0')}</span>
        <input
          aria-label={`${exercise}: вага підходу ${index + 1}`}
          inputMode="decimal"
          value={weight}
          placeholder="Власна"
          onFocus={() => {
            weightFocused.current = true;
          }}
          onChange={(event) => {
            const text = event.target.value;
            setWeight(text);
            const value = text.trim() === '' ? null : Number(text.replace(',', '.'));
            if (value === null || (Number.isFinite(value) && value >= 0 && value <= 2000)) {
              setError('');
              update({ weightKg: value });
            }
          }}
          onBlur={() => {
            weightFocused.current = false;
            if (!validWeight) setError('Вага: від 0 до 2000 кг');
          }}
        />
        <input
          aria-label={`${exercise}: повтори підходу ${index + 1}`}
          inputMode="numeric"
          value={reps}
          onFocus={() => {
            repsFocused.current = true;
          }}
          onChange={(event) => {
            const text = event.target.value;
            setReps(text);
            const value = Number(text);
            if (Number.isInteger(value) && value >= 1 && value <= 1000) {
              setError('');
              update({ reps: value });
            }
          }}
          onBlur={() => {
            repsFocused.current = false;
            if (!validReps) setError('Повтори: ціле число від 1 до 1000');
          }}
        />
        <button
          aria-label={`${exercise}: виконати підхід ${index + 1}`}
          aria-pressed={set.completed}
          className={`set-check ${set.completed ? 'checked' : ''}`}
          disabled={!validWeight || !validReps}
          onClick={toggle}
        >
          <Icon name="check" size={19} />
        </button>
        <button
          className="icon-button remove-set"
          aria-label={`${exercise}: видалити підхід ${index + 1}`}
          onClick={remove}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function ExerciseForm({
  record,
  save,
}: {
  record?: LocalRecord;
  save: (data: Exercise) => Promise<boolean>;
}) {
  const existing = record?.entity.kind === 'exercise' ? record.entity.data : null;
  const [id] = useState(() => existing?.id ?? uid());
  const [name, setName] = useState(existing?.name ?? '');
  const [equipment, setEquipment] = useState<Exercise['equipment']>(
    existing?.equipment ?? 'machine',
  );
  const [muscleGroup, setMuscleGroup] = useState(existing?.muscleGroup ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = exerciseSchema.safeParse({
      id,
      name,
      equipment,
      muscleGroup,
      notes,
      archived: existing?.archived ?? false,
    });
    if (!result.success) {
      setError('Вкажи назву вправи (до 100 символів). Перевір довжину інших полів.');
      return;
    }
    setSaving(true);
    try {
      if (!(await save(result.data)))
        setError('Зміна ще не збережена. Перевір доступ до сховища та повтори.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="form">
      <label className="field">
        Назва вправи
        <input
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Наприклад, жим ногами — Technogym"
        />
      </label>
      <div className="form-columns">
        <label className="field">
          Обладнання
          <select
            value={equipment}
            onChange={(event) => setEquipment(event.target.value as Exercise['equipment'])}
          >
            {Object.entries(equipmentNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Група м’язів
          <input
            maxLength={60}
            value={muscleGroup}
            onChange={(event) => setMuscleGroup(event.target.value)}
            placeholder="Наприклад, ноги"
          />
        </label>
      </div>
      <label className="field">
        Нотатка
        <textarea
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Налаштування сидіння, особливості техніки…"
        />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={saving}>
        {saving ? 'Збереження…' : 'Зберегти вправу'}
        <Icon name="check" size={18} />
      </button>
      {existing && (
        <button
          type="button"
          className="text-button danger wide"
          onClick={() => void save({ ...existing, archived: true })}
        >
          Архівувати вправу
        </button>
      )}
      <p className="helper">
        Вправа залишиться у минулих тренуваннях навіть після перейменування або архівації.
      </p>
    </form>
  );
}

function TemplateForm({
  workout,
  save,
}: {
  workout: Workout;
  save: (data: WorkoutTemplate) => Promise<boolean>;
}) {
  const [id] = useState(uid);
  const [name, setName] = useState(workout.title === 'Вільне тренування' ? '' : workout.title);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!workout.exercises.length) {
      setError('Спочатку додай хоча б одну вправу до тренування.');
      return;
    }
    const parsed = templateSchema.safeParse({
      id,
      name,
      exercises: cloneExercises(workout.exercises),
      archived: false,
    });
    if (!parsed.success) {
      setError('Вкажи назву плану від 1 до 100 символів.');
      return;
    }
    setSaving(true);
    try {
      if (!(await save(parsed.data)))
        setError('План ще не збережений. Перевір доступ до сховища та повтори.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <p className="muted">
        Збережемо порядок вправ, вагу та кількість повторів. Історія тренування залишиться окремо.
      </p>
      <label className="field">
        Назва плану
        <input
          required
          autoFocus
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Наприклад, Верх · день А"
        />
      </label>
      <div className="template-preview">
        {workout.exercises.map((exercise) => (
          <div key={exercise.id}>
            <span>{exercise.name}</span>
            <small>{exercise.sets.length} підходів</small>
          </div>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={saving}>
        {saving ? 'Збереження…' : 'Зберегти план'}
        <Icon name="layers" size={18} />
      </button>
    </form>
  );
}

function PlanEditor({
  record,
  exercises,
  save,
}: {
  record?: LocalRecord;
  exercises: Exercise[];
  save: (data: WorkoutTemplate) => Promise<boolean>;
}) {
  const existing = record?.entity.kind === 'template' ? record.entity.data : null;
  const [id] = useState(() => existing?.id ?? uid());
  const [name, setName] = useState(existing?.name ?? '');
  const [planned, setPlanned] = useState<WorkoutExercise[]>(() =>
    existing ? structuredClone(existing.exercises) : [],
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changeExercise = (id: string, change: (exercise: WorkoutExercise) => WorkoutExercise) =>
    setPlanned((items) =>
      items.map((exercise) => (exercise.id === id ? change(exercise) : exercise)),
    );
  function addExercise(exerciseId: string) {
    const exercise = exercises.find((entry) => entry.id === exerciseId);
    if (!exercise || planned.length >= 50) return;
    setPlanned((items) => [
      ...items,
      {
        id: uid(),
        exerciseId: exercise.id,
        name: exercise.name,
        equipment: exercise.equipment,
        sets: Array.from({ length: 3 }, () => ({
          id: uid(),
          weightKg: exercise.equipment === 'bodyweight' ? null : 0,
          reps: 10,
          completed: false,
        })),
      },
    ]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!planned.length) {
      setError('Додай хоча б одну вправу до плану.');
      return;
    }
    const result = templateSchema.safeParse({
      id,
      name,
      exercises: planned,
      archived: existing?.archived ?? false,
    });
    if (!result.success) {
      setError('Перевір назву плану, вагу (0–2000 кг) та цілі повтори (1–1000).');
      return;
    }
    setSaving(true);
    try {
      if (!(await save(result.data)))
        setError('План ще не збережений. Перевір доступ до сховища та повтори.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <label className="field">
        Назва плану
        <input
          required
          autoFocus
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Наприклад, Верх · день А"
        />
      </label>
      <label className="field">
        Додати вправу до плану
        <select
          value=""
          onChange={(event) => addExercise(event.target.value)}
          disabled={!exercises.length || planned.length >= 50}
        >
          <option value="">Обери вправу…</option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
      </label>
      {!exercises.length && (
        <p className="helper">
          Спочатку додай вправи на вкладці «Вправи». Потім повернися до створення плану.
        </p>
      )}
      <div className="plan-editor-exercises">
        {planned.map((exercise, index) => (
          <section className="plan-editor-exercise" key={exercise.id}>
            <div className="plan-editor-heading">
              <strong>
                {index + 1}. {exercise.name}
              </strong>
              <div className="template-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  aria-label={`Підняти у плані ${exercise.name}`}
                  onClick={() =>
                    setPlanned((items) => {
                      const result = [...items];
                      [result[index - 1], result[index]] = [result[index]!, result[index - 1]!];
                      return result;
                    })
                  }
                >
                  <Icon name="up" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === planned.length - 1}
                  aria-label={`Опустити у плані ${exercise.name}`}
                  onClick={() =>
                    setPlanned((items) => {
                      const result = [...items];
                      [result[index + 1], result[index]] = [result[index]!, result[index + 1]!];
                      return result;
                    })
                  }
                >
                  <Icon name="down" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Прибрати з плану ${exercise.name}`}
                  onClick={() =>
                    setPlanned((items) => items.filter((item) => item.id !== exercise.id))
                  }
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
            <div className="plan-set-heading">
              <span>Підхід</span>
              <span>Кг</span>
              <span>Повтори</span>
              <span />
            </div>
            {exercise.sets.map((set, setIndex) => (
              <div className="plan-set" key={set.id}>
                <span>{setIndex + 1}</span>
                <input
                  aria-label={`${exercise.name}: планова вага ${setIndex + 1}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="2000"
                  step="any"
                  value={set.weightKg ?? ''}
                  placeholder="Власна"
                  onChange={(event) => {
                    const value = event.target.value === '' ? null : Number(event.target.value);
                    changeExercise(exercise.id, (item) => ({
                      ...item,
                      sets: item.sets.map((entry) =>
                        entry.id === set.id ? { ...entry, weightKg: value } : entry,
                      ),
                    }));
                  }}
                />
                <input
                  aria-label={`${exercise.name}: планові повтори ${setIndex + 1}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="1000"
                  step="1"
                  required
                  value={set.reps || ''}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    changeExercise(exercise.id, (item) => ({
                      ...item,
                      sets: item.sets.map((entry) =>
                        entry.id === set.id ? { ...entry, reps: value } : entry,
                      ),
                    }));
                  }}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${exercise.name}: прибрати плановий підхід ${setIndex + 1}`}
                  onClick={() =>
                    changeExercise(exercise.id, (item) => ({
                      ...item,
                      sets: item.sets.filter((entry) => entry.id !== set.id),
                    }))
                  }
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={exercise.sets.length >= 50}
              onClick={() =>
                changeExercise(exercise.id, (item) => ({
                  ...item,
                  sets: [
                    ...item.sets,
                    {
                      id: uid(),
                      weightKg: item.sets.at(-1)?.weightKg ?? null,
                      reps: item.sets.at(-1)?.reps ?? 10,
                      completed: false,
                    },
                  ],
                }))
              }
            >
              <Icon name="plus" size={15} />
              Додати плановий підхід
            </button>
          </section>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={saving}>
        {saving ? 'Збереження…' : 'Зберегти план'}
        <Icon name="check" size={18} />
      </button>
      <p className="helper">
        План задає орієнтир. Фактичні результати кожного тренування зберігаються окремо.
      </p>
    </form>
  );
}
