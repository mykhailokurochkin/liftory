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
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  translations,
  type Locale,
  type Translations,
} from '../lib/i18n';

type Tab = 'training' | 'history' | 'exercises' | 'templates' | 'settings';
type ModalState =
  | { type: 'exercise'; record?: LocalRecord }
  | { type: 'pick' }
  | { type: 'template'; workout: Workout }
  | { type: 'plan'; record?: LocalRecord }
  | null;

const initialSync: SyncState = { status: 'idle', pending: 0, conflicts: 0, lastSyncedAt: null };
const uid = () => crypto.randomUUID();
const formatDate = (value: string, dateLocale: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(dateLocale, options ?? { day: 'numeric', month: 'long' }).format(
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

function LanguageSwitch({
  locale,
  onChange,
  label,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
  label: string;
}) {
  return (
    <div className="lang-switch" role="group" aria-label={label}>
      <button
        type="button"
        className={locale === 'en' ? 'active' : ''}
        aria-pressed={locale === 'en'}
        onClick={() => onChange('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={locale === 'uk' ? 'active' : ''}
        aria-pressed={locale === 'uk'}
        onClick={() => onChange('uk')}
      >
        UA
      </button>
    </div>
  );
}

function Brand({ tagline, compact = false }: { tagline: string; compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        Liftory<span className="brand-dot">.</span>
        {!compact && <small>{tagline}</small>}
      </span>
    </div>
  );
}

function Dialog({
  title,
  closeLabel,
  children,
  close,
}: {
  title: string;
  closeLabel: string;
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
        <button className="icon-button" onClick={close} aria-label={closeLabel}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function LiftoryApp() {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
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

  const t = translations[locale];
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'en' || saved === 'uk') {
        setLocaleState(saved);
      }
    } catch {
      /* Ignore storage errors */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t.docTitle;
  }, [locale, t.docTitle]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* Ignore storage errors */
    }
  }, []);

  const navigation: { id: Tab; label: string; icon: string }[] = [
    { id: 'training', label: t.nav.training, icon: 'activity' },
    { id: 'history', label: t.nav.history, icon: 'calendar' },
    { id: 'exercises', label: t.nav.exercises, icon: 'dumbbell' },
    { id: 'templates', label: t.nav.templates, icon: 'layers' },
    { id: 'settings', label: t.nav.settings, icon: 'user' },
  ];

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
        if (mounted) setError(tRef.current.errors.storageOpen);
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
        setMessage(tRef.current.errors.offlineShellNotLoaded);
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
    ? t.sync.authRequired
    : sync.status === 'error'
      ? t.sync.paused
      : sync.status === 'syncing'
        ? t.sync.syncing
        : sync.status === 'offline'
          ? t.sync.savedOffline
          : conflicts.length
            ? t.sync.needsReview
            : pending
              ? t.sync.onDeviceCount(pending)
              : sync.lastSyncedAt
                ? t.sync.synced
                : t.sync.onDevice;

  function queueWrite(operation: () => Promise<void>): Promise<boolean> {
    const outcome = writeQueue.current.then(async () => {
      setError('');
      try {
        await operation();
      } catch (cause) {
        setError(
          cause instanceof Error && cause.name === 'StaleRevisionError'
            ? tRef.current.errors.staleRevision
            : tRef.current.errors.saveFailed,
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
        setError(tRef.current.errors.refreshFailed);
      }
      setMessage(tRef.current.messages.savedOnDevice);
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
        setMessage(t.messages.finishCurrentFirst);
        return;
      }
      const data: Workout = {
        id: uid(),
        title: source ? ('name' in source ? source.name : source.title) : t.training.defaultTitle,
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
      setError(t.errors.openWorkoutFailed);
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
      setError(t.errors.signInFailed);
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
      setError(t.errors.signOutFailed);
    }
  }

  async function addStarterExercises() {
    for (const [name, equipment, muscleGroup] of t.exercises.starterList)
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
      .map(
        (set) =>
          `${set.weightKg === null ? t.training.bodyweightShort : `${set.weightKg} ${t.training.kgUnit}`} × ${set.reps}`,
      )
      .join(' · ');
  }

  if (booting)
    return (
      <main className="boot-screen">
        <Brand tagline={t.brandTagline} />
        <p>{t.booting}</p>
      </main>
    );

  if (!user)
    return (
      <main className="landing">
        <header className="landing-header">
          <Brand tagline={t.brandTagline} />
          <div className="landing-header-right">
            <span className="eyebrow">{t.landing.eyebrow}</span>
            <LanguageSwitch locale={locale} onChange={setLocale} label={t.languageLabel} />
          </div>
        </header>
        <section className="landing-grid">
          <div className="landing-copy">
            <span className="pill">
              <span className="status-dot" /> {t.landing.pill}
            </span>
            <h1>
              {t.landing.headlineLine1}
              <br />
              {t.landing.headlineLine2}
              <br />
              <span>{t.landing.headlineAccent}</span>
            </h1>
            <p>
              {t.landing.subtitleLine1}
              <br />
              {t.landing.subtitleLine2}
            </p>
            <div className="login-card">
              <h2>{t.landing.loginTitle}</h2>
              <p>{t.landing.loginSubtitle}</p>
              <button
                className="button primary wide"
                onClick={() => void signIn()}
                disabled={!googleConfigured}
              >
                {t.landing.googleButton} <Icon name="arrow" />
              </button>
              {!googleConfigured && <p className="helper">{t.landing.googleNotConfigured}</p>}
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
              <span className="eyebrow">{t.landing.artEyebrow}</span>
              <h3>
                {t.landing.artHeadline1}
                <br />
                {t.landing.artHeadline2}
              </h3>
              <div className="art-bars">
                {[35, 48, 42, 62, 60, 80, 96].map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="art-caption">
                <span>{t.landing.artCaption}</span>
                <span>↗</span>
              </div>
            </div>
            <div className="art-note">
              <Icon name="check" /> {t.landing.artNote}
            </div>
          </div>
        </section>
        <footer className="landing-footer">
          <span>{t.landing.footerLeft}</span>
          <span>{t.landing.footerRight}</span>
        </footer>
      </main>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand tagline={t.brandTagline} />
        <nav aria-label={t.nav.ariaMain}>
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
              {t.sidebar.noteLine1}
              <br />
              <strong>{t.sidebar.noteLine2}</strong>
            </p>
          </div>
          <button className="profile-button" onClick={() => setTab('settings')}>
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase() || t.sidebar.fallbackInitial}
            </span>
            <span>
              <strong>{user.name || t.sidebar.defaultProfileName}</strong>
              <small>{development ? t.sidebar.localProfile : t.sidebar.personalJournal}</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-label">{t.topbar.label}</span>
          <div className="topbar-actions">
            <LanguageSwitch locale={locale} onChange={setLocale} label={t.languageLabel} />
            <button
              className={`sync-indicator ${authRequired || conflicts.length || sync.status === 'error' ? 'attention' : ''}`}
              onClick={() => void engine.current?.sync()}
              aria-label={t.topbar.syncAria}
            >
              <span className={`status-dot ${sync.status === 'syncing' ? 'pulse' : ''}`} />
              {syncLabel}
              <Icon name="sync" size={14} />
            </button>
          </div>
        </header>
        <main className="workspace">
          {development && (
            <div className="notice subtle">
              <Icon name="user" size={16} />
              <span>{t.notices.devMode}</span>
            </div>
          )}
          {authRequired && (
            <div className="notice">
              <Icon name="cloud" />
              <span>{t.notices.authOffline}</span>
              <button className="text-button" onClick={() => void signIn()}>
                {t.notices.signIn}
              </button>
            </div>
          )}
          {sync.status === 'error' && (
            <div className="notice error" role="alert">
              <span>
                {sync.error === 'storage' ? t.notices.syncStorageError : t.notices.syncServerError}
              </span>
              <button className="text-button" onClick={() => void engine.current?.sync()}>
                {t.notices.retry}
              </button>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label={t.notices.hideError}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {conflicts.map((record) => (
            <div className="notice" key={`${record.kind}:${record.id}`}>
              <span>
                {t.notices.conflictText(
                  'name' in record.entity.data ? record.entity.data.name : record.entity.data.title,
                )}
              </span>
              <button
                className="text-button"
                onClick={() =>
                  void queueWrite(async () => {
                    await store!.resolveConflict(user.id, record.kind, record.id, 'server');
                  })
                }
              >
                {t.notices.takeServer}
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
                  {t.notices.keepCopy}
                </button>
              )}
            </div>
          ))}

          {tab === 'training' && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {formatDate(new Date().toISOString(), t.dateLocale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  <h1>
                    {current
                      ? current.status === 'completed'
                        ? t.training.completedHeading
                        : t.training.activeHeading
                      : t.training.greeting(user.name.split(' ')[0] || t.training.defaultAthlete)}
                  </h1>
                  <p className="page-description">
                    {current
                      ? current.status === 'completed'
                        ? t.training.completedDesc
                        : t.training.activeDesc
                      : t.training.homeDesc}
                  </p>
                </div>
                {!current && (
                  <button className="button primary" onClick={() => void startWorkout()}>
                    <Icon name="plus" />
                    {t.training.startWorkout}
                  </button>
                )}
              </div>
              {!current ? (
                <>
                  <div className="stat-grid">
                    <Stat
                      label={t.training.statWorkoutsLabel}
                      value={completed.length}
                      detail={t.training.statWorkoutsDetail}
                    />
                    <Stat
                      label={t.training.statSetsLabel}
                      value={totalSets}
                      detail={t.training.statSetsDetail}
                    />
                    <Stat
                      label={t.training.statPlansLabel}
                      value={templates.length}
                      detail={t.training.statPlansDetail}
                    />
                  </div>
                  <div className="home-grid">
                    <section className="hero-card">
                      <span className="eyebrow">{t.training.heroEyebrow}</span>
                      <h2>
                        {t.training.heroLine1}
                        <br />
                        {t.training.heroLine2}
                        <br />
                        <em>{t.training.heroLine3}</em>
                      </h2>
                      <p>
                        {t.training.heroBodyLine1}
                        <br className="desktop-only" /> {t.training.heroBodyLine2}
                      </p>
                      <button className="button dark" onClick={() => void startWorkout()}>
                        {t.training.freeWorkout} <Icon name="arrow" />
                      </button>
                      <span className="hero-number" aria-hidden="true">
                        01
                      </span>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>{t.training.yourPlans}</h2>
                        <button className="text-button" onClick={() => setTab('templates')}>
                          {t.training.all} <Icon name="arrow" size={16} />
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
                              <small>{t.training.exercisesCount(template.exercises.length)}</small>
                            </span>
                            <Icon name="arrow" />
                          </button>
                        ))
                      ) : (
                        <div className="empty small">
                          <Icon name="layers" size={28} />
                          <h3>{t.training.planEmptyTitle}</h3>
                          <p>
                            {t.training.planEmptyLine1}
                            <br />
                            {t.training.planEmptyLine2}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => setModal({ type: 'plan' })}
                          >
                            {t.training.createPlan} <Icon name="arrow" size={16} />
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                  <section className="recent-section">
                    <div className="section-heading">
                      <h2>{t.training.recentWorkouts}</h2>
                      <button className="text-button" onClick={() => setTab('history')}>
                        {t.training.history} <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    {completed.length ? (
                      completed.slice(0, 3).map((workout) => (
                        <HistoryRow
                          key={workout.id}
                          workout={workout}
                          t={t}
                          open={() => {
                            setSelectedWorkout(workout.id);
                            setTab('training');
                          }}
                        />
                      ))
                    ) : (
                      <div className="empty-line">{t.training.recentEmpty}</div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className="workout-toolbar">
                    <div>
                      <span className="eyebrow">
                        {current.status === 'active'
                          ? t.training.statusActive
                          : t.training.statusCompleted}
                      </span>
                      <DraftText
                        id={current.id + '-title'}
                        label={t.training.workoutTitleLabel}
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
                        {formatDate(current.startedAt, t.dateLocale)} ·{' '}
                        {t.training.exercisesCount(current.exercises.length)} ·{' '}
                        {t.training.setsCount(
                          current.exercises.reduce(
                            (sum, exercise) =>
                              sum + exercise.sets.filter((set) => set.completed).length,
                            0,
                          ),
                        )}
                      </span>
                    </div>
                    <div className="toolbar-actions">
                      <button
                        className="button secondary"
                        onClick={() => setModal({ type: 'template', workout: current })}
                      >
                        <Icon name="layers" size={18} />
                        {t.training.savePlan}
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
                          {t.training.finish} <Icon name="check" size={18} />
                        </button>
                      )}
                    </div>
                  </section>
                  {timerEnd && (
                    <div className="rest-timer" role="timer" aria-label={t.training.restTimerAria}>
                      <Icon name="clock" />
                      <span>{t.training.restLabel}</span>
                      <strong>
                        {Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}
                      </strong>
                      <button
                        className="text-button"
                        onClick={() => setTimerEnd((end) => (end ?? Date.now()) + 30000)}
                      >
                        {t.training.add30s}
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => setTimerEnd(null)}
                        aria-label={t.training.closeTimerAria}
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
                      <h2>{t.training.workoutEmptyTitle}</h2>
                      <p>{t.training.workoutEmptyText}</p>
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
                            <span className="eyebrow">{t.equipment[exercise.equipment]}</span>
                            <h2>{exercise.name}</h2>
                          </div>
                          <div className="exercise-actions">
                            <button
                              className="icon-button"
                              aria-label={t.training.moveUpAria(exercise.name)}
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
                              aria-label={t.training.moveDownAria(exercise.name)}
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
                              aria-label={t.training.removeExerciseAria(exercise.name)}
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
                            {t.training.lastTime}{' '}
                            <strong>{previousResult(exercise.exerciseId)}</strong>
                          </p>
                        )}
                        <div className="set-table">
                          <div className="set-head">
                            <span>{t.training.setCol}</span>
                            <span>{t.training.weightCol}</span>
                            <span>{t.training.repsCol}</span>
                            <span>{t.training.doneCol}</span>
                            <span />
                          </div>
                          {exercise.sets.map((set, setIndex) => (
                            <SetRow
                              key={set.id}
                              set={set}
                              exercise={exercise.name}
                              index={setIndex}
                              t={t}
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
                          {t.training.addSet}
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
                    {t.training.addExercise}
                  </button>
                  <label className="field workout-notes">
                    {t.training.workoutNotesLabel}
                    <DraftText
                      id={current.id + '-notes'}
                      label={t.training.workoutNotesLabel}
                      value={current.notes}
                      maxLength={2000}
                      multiline
                      placeholder={t.training.workoutNotesPlaceholder}
                      update={(notes) =>
                        void changeWorkout(current.id, (workout) => ({ ...workout, notes }))
                      }
                    />
                  </label>
                  <p className="storage-note">
                    <Icon name="cloud" size={16} />
                    {t.training.storageNote}
                  </p>
                </>
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              <PageHeading
                eyebrow={t.history.eyebrow}
                title={t.history.title}
                description={t.history.description}
              />
              <div className="stat-grid">
                <Stat
                  label={t.history.statWorkoutsLabel}
                  value={completed.length}
                  detail={t.history.statWorkoutsDetail}
                />
                <Stat
                  label={t.history.statSetsLabel}
                  value={totalSets}
                  detail={t.history.statSetsDetail}
                />
                <Stat
                  label={t.history.statExercisesLabel}
                  value={exercises.filter((exercise) => !exercise.archived).length}
                  detail={t.history.statExercisesDetail}
                />
              </div>
              {workouts.length ? (
                <div className="panel history-list">
                  {workouts.map((workout) => (
                    <div className="history-item" key={workout.id}>
                      <HistoryRow
                        workout={workout}
                        t={t}
                        open={() => {
                          setSelectedWorkout(workout.id);
                          setTab('training');
                        }}
                      />
                      <button
                        className="text-button repeat-button"
                        onClick={() => void startWorkout(workout)}
                      >
                        {t.history.repeat} <Icon name="sync" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  icon="calendar"
                  title={t.history.emptyTitle}
                  text={t.history.emptyText}
                  action={
                    <button className="button primary" onClick={() => void startWorkout()}>
                      {t.training.startWorkout} <Icon name="arrow" />
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
                  <p className="eyebrow">{t.exercises.eyebrow}</p>
                  <h1>{t.exercises.title}</h1>
                  <p className="page-description">{t.exercises.description}</p>
                </div>
                <button className="button primary" onClick={() => setModal({ type: 'exercise' })}>
                  <Icon name="plus" />
                  {t.exercises.addExercise}
                </button>
              </div>
              <label className="search-field">
                <span className="sr-only">{t.exercises.searchSr}</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.exercises.searchPlaceholder}
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
                        <span className="equipment-tag">{t.equipment[exercise.equipment]}</span>
                        <button
                          className="icon-button"
                          aria-label={t.exercises.editAria(exercise.name)}
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
                      <p>{exercise.muscleGroup || t.exercises.noMuscleGroup}</p>
                      {exercise.notes && <small>{exercise.notes}</small>}
                    </article>
                  ))}
              </div>
              {!exercises.some((exercise) => !exercise.archived) && (
                <Empty
                  icon="dumbbell"
                  title={t.exercises.emptyTitle}
                  text={t.exercises.emptyText}
                  action={
                    <button className="button secondary" onClick={() => void addStarterExercises()}>
                      {t.exercises.addStarter} <Icon name="plus" />
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
                  <p className="eyebrow">{t.templates.eyebrow}</p>
                  <h1>{t.templates.title}</h1>
                  <p className="page-description">{t.templates.description}</p>
                </div>
                <button className="button primary" onClick={() => setModal({ type: 'plan' })}>
                  <Icon name="plus" />
                  {t.templates.createPlan}
                </button>
              </div>
              <div className="template-grid">
                {templates.map((template, index) => (
                  <article className="template-card" key={template.id}>
                    <div className="template-top">
                      <span className="eyebrow">
                        {t.templates.planBadge(String(index + 1).padStart(2, '0'))}
                      </span>
                      <div className="template-actions">
                        <button
                          className="icon-button"
                          aria-label={t.templates.editPlanAria(template.name)}
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
                          aria-label={t.templates.archivePlanAria(template.name)}
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
                      {t.training.exercisesCount(template.exercises.length)} ·{' '}
                      {t.training.setsCount(
                        template.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
                      )}
                    </p>
                    <div className="template-exercises">
                      {template.exercises.slice(0, 4).map((exercise) => (
                        <span key={exercise.id}>{exercise.name}</span>
                      ))}
                      {template.exercises.length > 4 && (
                        <span>{t.templates.moreExercises(template.exercises.length - 4)}</span>
                      )}
                    </div>
                    <button
                      className="button dark wide"
                      onClick={() => void startWorkout(template)}
                    >
                      {t.templates.startFromPlan} <Icon name="arrow" />
                    </button>
                  </article>
                ))}
              </div>
              {!templates.length && (
                <Empty
                  icon="layers"
                  title={t.templates.emptyTitle}
                  text={t.templates.emptyText}
                  action={
                    <button className="button primary" onClick={() => setModal({ type: 'plan' })}>
                      {t.templates.createFirstPlan} <Icon name="plus" />
                    </button>
                  }
                />
              )}
            </>
          )}

          {tab === 'settings' && (
            <>
              <PageHeading
                eyebrow={t.settings.eyebrow}
                title={t.settings.title}
                description={t.settings.description}
              />
              <section className="panel profile-panel">
                <span className="avatar large">{user.name.slice(0, 1).toUpperCase()}</span>
                <h2>{user.name}</h2>
                <p>{user.email}</p>
                <span className="equipment-tag">
                  {development ? t.settings.localDev : t.settings.googleAccount}
                </span>
              </section>
              <section className="panel settings-panel">
                <h2>{t.settings.storageAndSync}</h2>
                <div className="setting-row">
                  <div>
                    <strong>{t.languageLabel}</strong>
                    <p>{t.languageDescription}</p>
                  </div>
                  <LanguageSwitch locale={locale} onChange={setLocale} label={t.languageLabel} />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>{t.settings.syncStatus}</strong>
                    <p>
                      {pending ? t.settings.pendingChanges(pending) : t.settings.noPendingChanges}
                    </p>
                  </div>
                  <button className="button secondary" onClick={() => void engine.current?.sync()}>
                    <Icon name="sync" size={17} />
                    {t.settings.syncNow}
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>{t.settings.offlineTitle}</strong>
                    <p>
                      {shellReady ? t.settings.offlineReady : t.settings.offlineNotReady}
                      {t.settings.offlineDetail}
                    </p>
                  </div>
                  <Icon name="cloud" />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>{t.settings.deviceStorageTitle}</strong>
                    <p>{t.settings.deviceStorageDetail}</p>
                  </div>
                </div>
                {update && (
                  <div className="setting-row">
                    <div>
                      <strong>{t.settings.updateAvailable}</strong>
                      <p>
                        {activeCount ? t.settings.updateBlockedByActive : t.settings.updateReady}
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
                      {t.settings.updateAction}
                    </button>
                  </div>
                )}
              </section>
              {!development && (
                <button className="button secondary logout-button" onClick={() => void signOut()}>
                  {t.settings.signOut}
                </button>
              )}
              <p className="storage-note">{t.settings.signOutNote}</p>
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>{t.footer.left}</span>
          <span>{t.footer.right}</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label={t.nav.ariaMobile}>
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
          title={modal.record ? t.modals.editExercise : t.modals.newExercise}
          closeLabel={t.close}
          close={() => setModal(null)}
        >
          <ExerciseForm
            record={modal.record}
            t={t}
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
        <Dialog title={t.modals.addExercise} closeLabel={t.close} close={() => setModal(null)}>
          <label className="search-field">
            <span className="sr-only">{t.modals.findExerciseSr}</span>
            <input
              autoFocus
              placeholder={t.modals.exerciseNamePlaceholderShort}
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
                      {t.equipment[exercise.equipment]} ·{' '}
                      {exercise.muscleGroup || t.modals.customExerciseFallback}
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
            {t.modals.createCustomExercise}
          </button>
        </Dialog>
      )}
      {modal?.type === 'plan' && (
        <Dialog
          title={modal.record ? t.modals.editPlan : t.modals.newPlan}
          closeLabel={t.close}
          close={() => setModal(null)}
        >
          <PlanEditor
            record={modal.record}
            exercises={exercises.filter((exercise) => !exercise.archived)}
            t={t}
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
        <Dialog title={t.modals.saveAsPlan} closeLabel={t.close} close={() => setModal(null)}>
          <TemplateForm
            workout={modal.workout}
            t={t}
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
function HistoryRow({ workout, t, open }: { workout: Workout; t: Translations; open: () => void }) {
  const sets = workout.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  return (
    <button className="history-row" onClick={open}>
      <span className="history-date">
        <strong>{new Date(workout.startedAt).getDate()}</strong>
        <small>{formatDate(workout.startedAt, t.dateLocale, { month: 'short' })}</small>
      </span>
      <span className="history-info">
        <strong>{workout.title}</strong>
        <small>
          {t.training.exercisesCount(workout.exercises.length)} · {t.training.setsCount(sets)}{' '}
          {workout.status === 'active' ? t.history.inProgressSuffix : ''}
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
  t,
  update,
  toggle,
  remove,
}: {
  set: WorkoutSet;
  exercise: string;
  index: number;
  t: Translations;
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
          aria-label={t.setRow.weightAria(exercise, index + 1)}
          inputMode="decimal"
          value={weight}
          placeholder={t.setRow.bodyweightPlaceholder}
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
            if (!validWeight) setError(t.setRow.weightError);
          }}
        />
        <input
          aria-label={t.setRow.repsAria(exercise, index + 1)}
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
            if (!validReps) setError(t.setRow.repsError);
          }}
        />
        <button
          aria-label={t.setRow.completeAria(exercise, index + 1)}
          aria-pressed={set.completed}
          className={`set-check ${set.completed ? 'checked' : ''}`}
          disabled={!validWeight || !validReps}
          onClick={toggle}
        >
          <Icon name="check" size={19} />
        </button>
        <button
          className="icon-button remove-set"
          aria-label={t.setRow.deleteAria(exercise, index + 1)}
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
  t,
  save,
}: {
  record?: LocalRecord;
  t: Translations;
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
      setError(t.exerciseForm.nameError);
      return;
    }
    setSaving(true);
    try {
      if (!(await save(result.data))) setError(t.exerciseForm.saveError);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="form">
      <label className="field">
        {t.exerciseForm.nameLabel}
        <input
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.exerciseForm.namePlaceholder}
        />
      </label>
      <div className="form-columns">
        <label className="field">
          {t.exerciseForm.equipmentLabel}
          <select
            value={equipment}
            onChange={(event) => setEquipment(event.target.value as Exercise['equipment'])}
          >
            {Object.entries(t.equipment).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t.exerciseForm.muscleGroupLabel}
          <input
            maxLength={60}
            value={muscleGroup}
            onChange={(event) => setMuscleGroup(event.target.value)}
            placeholder={t.exerciseForm.muscleGroupPlaceholder}
          />
        </label>
      </div>
      <label className="field">
        {t.exerciseForm.notesLabel}
        <textarea
          maxLength={1000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t.exerciseForm.notesPlaceholder}
        />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={saving}>
        {saving ? t.exerciseForm.saving : t.exerciseForm.saveButton}
        <Icon name="check" size={18} />
      </button>
      {existing && (
        <button
          type="button"
          className="text-button danger wide"
          onClick={() => void save({ ...existing, archived: true })}
        >
          {t.exerciseForm.archiveButton}
        </button>
      )}
      <p className="helper">{t.exerciseForm.helper}</p>
    </form>
  );
}

function TemplateForm({
  workout,
  t,
  save,
}: {
  workout: Workout;
  t: Translations;
  save: (data: WorkoutTemplate) => Promise<boolean>;
}) {
  const [id] = useState(uid);
  const isDefaultTitle =
    workout.title === translations.en.training.defaultTitle ||
    workout.title === translations.uk.training.defaultTitle;
  const [name, setName] = useState(isDefaultTitle ? '' : workout.title);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!workout.exercises.length) {
      setError(t.templateForm.emptyError);
      return;
    }
    const parsed = templateSchema.safeParse({
      id,
      name,
      exercises: cloneExercises(workout.exercises),
      archived: false,
    });
    if (!parsed.success) {
      setError(t.templateForm.nameError);
      return;
    }
    setSaving(true);
    try {
      if (!(await save(parsed.data))) setError(t.templateForm.saveError);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <p className="muted">{t.templateForm.description}</p>
      <label className="field">
        {t.templateForm.nameLabel}
        <input
          required
          autoFocus
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.templateForm.namePlaceholder}
        />
      </label>
      <div className="template-preview">
        {workout.exercises.map((exercise) => (
          <div key={exercise.id}>
            <span>{exercise.name}</span>
            <small>{t.training.setsCount(exercise.sets.length)}</small>
          </div>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary wide" disabled={saving}>
        {saving ? t.templateForm.saving : t.templateForm.saveButton}
        <Icon name="layers" size={18} />
      </button>
    </form>
  );
}

function PlanEditor({
  record,
  exercises,
  t,
  save,
}: {
  record?: LocalRecord;
  exercises: Exercise[];
  t: Translations;
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
      setError(t.planEditor.emptyError);
      return;
    }
    const result = templateSchema.safeParse({
      id,
      name,
      exercises: planned,
      archived: existing?.archived ?? false,
    });
    if (!result.success) {
      setError(t.planEditor.validationError);
      return;
    }
    setSaving(true);
    try {
      if (!(await save(result.data))) setError(t.planEditor.saveError);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <label className="field">
        {t.planEditor.nameLabel}
        <input
          required
          autoFocus
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.planEditor.namePlaceholder}
        />
      </label>
      <label className="field">
        {t.planEditor.addExerciseLabel}
        <select
          value=""
          onChange={(event) => addExercise(event.target.value)}
          disabled={!exercises.length || planned.length >= 50}
        >
          <option value="">{t.planEditor.chooseExercise}</option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
      </label>
      {!exercises.length && <p className="helper">{t.planEditor.noExercisesHelper}</p>}
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
                  aria-label={t.planEditor.moveUpAria(exercise.name)}
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
                  aria-label={t.planEditor.moveDownAria(exercise.name)}
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
                  aria-label={t.planEditor.removeAria(exercise.name)}
                  onClick={() =>
                    setPlanned((items) => items.filter((item) => item.id !== exercise.id))
                  }
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
            <div className="plan-set-heading">
              <span>{t.planEditor.setCol}</span>
              <span>{t.planEditor.kgCol}</span>
              <span>{t.planEditor.repsCol}</span>
              <span />
            </div>
            {exercise.sets.map((set, setIndex) => (
              <div className="plan-set" key={set.id}>
                <span>{setIndex + 1}</span>
                <input
                  aria-label={t.planEditor.plannedWeightAria(exercise.name, setIndex + 1)}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="2000"
                  step="any"
                  value={set.weightKg ?? ''}
                  placeholder={t.setRow.bodyweightPlaceholder}
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
                  aria-label={t.planEditor.plannedRepsAria(exercise.name, setIndex + 1)}
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
                  aria-label={t.planEditor.removePlannedSetAria(exercise.name, setIndex + 1)}
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
              {t.planEditor.addPlannedSet}
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
        {saving ? t.planEditor.saving : t.planEditor.saveButton}
        <Icon name="check" size={18} />
      </button>
      <p className="helper">{t.planEditor.helper}</p>
    </form>
  );
}
