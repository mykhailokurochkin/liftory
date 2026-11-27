import type { Exercise } from '@liftory/contracts';

export type Locale = 'en' | 'uk';
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'liftory-locale';

export interface Translations {
  docTitle: string;
  dateLocale: string;
  brandTagline: string;
  close: string;
  languageLabel: string;
  languageDescription: string;
  equipment: Record<Exercise['equipment'], string>;
  nav: {
    ariaMain: string;
    ariaMobile: string;
    training: string;
    history: string;
    exercises: string;
    templates: string;
    settings: string;
  };
  booting: string;
  landing: {
    eyebrow: string;
    pill: string;
    headlineLine1: string;
    headlineLine2: string;
    headlineAccent: string;
    subtitleLine1: string;
    subtitleLine2: string;
    loginTitle: string;
    loginSubtitle: string;
    googleButton: string;
    googleNotConfigured: string;
    artEyebrow: string;
    artHeadline1: string;
    artHeadline2: string;
    artCaption: string;
    artNote: string;
    footerLeft: string;
    footerRight: string;
  };
  sidebar: {
    noteLine1: string;
    noteLine2: string;
    defaultProfileName: string;
    localProfile: string;
    personalJournal: string;
    fallbackInitial: string;
  };
  topbar: {
    label: string;
    syncAria: string;
  };
  sync: {
    authRequired: string;
    paused: string;
    syncing: string;
    savedOffline: string;
    needsReview: string;
    onDeviceCount: (count: number) => string;
    synced: string;
    onDevice: string;
  };
  notices: {
    devMode: string;
    authOffline: string;
    signIn: string;
    syncStorageError: string;
    syncServerError: string;
    retry: string;
    hideError: string;
    conflictText: (name: string) => string;
    takeServer: string;
    keepCopy: string;
  };
  errors: {
    storageOpen: string;
    staleRevision: string;
    saveFailed: string;
    refreshFailed: string;
    openWorkoutFailed: string;
    signInFailed: string;
    signOutFailed: string;
    offlineShellNotLoaded: string;
  };
  messages: {
    savedOnDevice: string;
    finishCurrentFirst: string;
  };
  training: {
    defaultTitle: string;
    completedHeading: string;
    activeHeading: string;
    greeting: (name: string) => string;
    defaultAthlete: string;
    completedDesc: string;
    activeDesc: string;
    homeDesc: string;
    startWorkout: string;
    statWorkoutsLabel: string;
    statWorkoutsDetail: string;
    statSetsLabel: string;
    statSetsDetail: string;
    statPlansLabel: string;
    statPlansDetail: string;
    heroEyebrow: string;
    heroLine1: string;
    heroLine2: string;
    heroLine3: string;
    heroBodyLine1: string;
    heroBodyLine2: string;
    freeWorkout: string;
    yourPlans: string;
    all: string;
    exercisesCount: (n: number) => string;
    setsCount: (n: number) => string;
    planEmptyTitle: string;
    planEmptyLine1: string;
    planEmptyLine2: string;
    createPlan: string;
    recentWorkouts: string;
    history: string;
    recentEmpty: string;
    statusActive: string;
    statusCompleted: string;
    workoutTitleLabel: string;
    savePlan: string;
    finish: string;
    restTimerAria: string;
    restLabel: string;
    add30s: string;
    closeTimerAria: string;
    workoutEmptyTitle: string;
    workoutEmptyText: string;
    moveUpAria: (name: string) => string;
    moveDownAria: (name: string) => string;
    removeExerciseAria: (name: string) => string;
    lastTime: string;
    bodyweightShort: string;
    kgUnit: string;
    setCol: string;
    weightCol: string;
    repsCol: string;
    doneCol: string;
    addSet: string;
    addExercise: string;
    workoutNotesLabel: string;
    workoutNotesPlaceholder: string;
    storageNote: string;
  };
  history: {
    eyebrow: string;
    title: string;
    description: string;
    statWorkoutsLabel: string;
    statWorkoutsDetail: string;
    statSetsLabel: string;
    statSetsDetail: string;
    statExercisesLabel: string;
    statExercisesDetail: string;
    repeat: string;
    emptyTitle: string;
    emptyText: string;
    inProgressSuffix: string;
  };
  exercises: {
    eyebrow: string;
    title: string;
    description: string;
    addExercise: string;
    searchSr: string;
    searchPlaceholder: string;
    editAria: (name: string) => string;
    noMuscleGroup: string;
    emptyTitle: string;
    emptyText: string;
    addStarter: string;
    starterList: readonly (readonly [string, Exercise['equipment'], string])[];
  };
  templates: {
    eyebrow: string;
    title: string;
    description: string;
    createPlan: string;
    planBadge: (index: string) => string;
    editPlanAria: (name: string) => string;
    archivePlanAria: (name: string) => string;
    moreExercises: (n: number) => string;
    startFromPlan: string;
    emptyTitle: string;
    emptyText: string;
    createFirstPlan: string;
  };
  settings: {
    eyebrow: string;
    title: string;
    description: string;
    localDev: string;
    googleAccount: string;
    storageAndSync: string;
    syncStatus: string;
    pendingChanges: (n: number) => string;
    noPendingChanges: string;
    syncNow: string;
    offlineTitle: string;
    offlineReady: string;
    offlineNotReady: string;
    offlineDetail: string;
    deviceStorageTitle: string;
    deviceStorageDetail: string;
    updateAvailable: string;
    updateBlockedByActive: string;
    updateReady: string;
    updateAction: string;
    signOut: string;
    signOutNote: string;
  };
  footer: {
    left: string;
    right: string;
  };
  modals: {
    editExercise: string;
    newExercise: string;
    addExercise: string;
    findExerciseSr: string;
    exerciseNamePlaceholderShort: string;
    customExerciseFallback: string;
    createCustomExercise: string;
    editPlan: string;
    newPlan: string;
    saveAsPlan: string;
  };
  setRow: {
    weightAria: (exercise: string, n: number) => string;
    repsAria: (exercise: string, n: number) => string;
    completeAria: (exercise: string, n: number) => string;
    deleteAria: (exercise: string, n: number) => string;
    bodyweightPlaceholder: string;
    weightError: string;
    repsError: string;
  };
  exerciseForm: {
    nameError: string;
    saveError: string;
    nameLabel: string;
    namePlaceholder: string;
    equipmentLabel: string;
    muscleGroupLabel: string;
    muscleGroupPlaceholder: string;
    notesLabel: string;
    notesPlaceholder: string;
    saving: string;
    saveButton: string;
    archiveButton: string;
    helper: string;
  };
  templateForm: {
    emptyError: string;
    nameError: string;
    saveError: string;
    description: string;
    nameLabel: string;
    namePlaceholder: string;
    saving: string;
    saveButton: string;
  };
  planEditor: {
    emptyError: string;
    validationError: string;
    saveError: string;
    nameLabel: string;
    namePlaceholder: string;
    addExerciseLabel: string;
    chooseExercise: string;
    noExercisesHelper: string;
    moveUpAria: (name: string) => string;
    moveDownAria: (name: string) => string;
    removeAria: (name: string) => string;
    setCol: string;
    kgCol: string;
    repsCol: string;
    plannedWeightAria: (name: string, n: number) => string;
    plannedRepsAria: (name: string, n: number) => string;
    removePlannedSetAria: (name: string, n: number) => string;
    addPlannedSet: string;
    saving: string;
    saveButton: string;
    helper: string;
  };
}

export const translations: Record<Locale, Translations> = {
  en: {
    docTitle: 'Liftory — your workout journal',
    dateLocale: 'en-US',
    brandTagline: 'your workout journal',
    close: 'Close',
    languageLabel: 'Language',
    languageDescription: 'Switch interface language between English and Ukrainian.',
    equipment: {
      machine: 'Machine',
      barbell: 'Barbell',
      dumbbells: 'Dumbbells',
      bodyweight: 'Bodyweight',
      cable: 'Cable',
      other: 'Other',
    },
    nav: {
      ariaMain: 'Main navigation',
      ariaMobile: 'Mobile navigation',
      training: 'Workouts',
      history: 'History',
      exercises: 'Exercises',
      templates: 'Plans',
      settings: 'Profile',
    },
    booting: 'Opening your journal…',
    landing: {
      eyebrow: 'ONE SET AT A TIME',
      pill: 'Your space for steady progress',
      headlineLine1: 'Remember',
      headlineLine2: 'less.',
      headlineAccent: 'Lift more.',
      subtitleLine1: 'Exercises, sets, and small wins.',
      subtitleLine2: 'Your entire training — in one clean journal.',
      loginTitle: 'Start with your next set',
      loginSubtitle: 'Sign in to keep your workouts synced across devices.',
      googleButton: 'Sign in with Google',
      googleNotConfigured: 'Google sign-in has not been enabled by the app owner yet.',
      artEyebrow: 'TODAY · YOUR WORK',
      artHeadline1: 'Stronger.',
      artHeadline2: 'Step by step.',
      artCaption: 'Effort compounds.',
      artNote: 'Every single set counts.',
      footerLeft: 'BUILT FOR YOUR PACE',
      footerRight: 'Journal • Plans • Progress',
    },
    sidebar: {
      noteLine1: 'Your pace.',
      noteLine2: 'Your progress.',
      defaultProfileName: 'My profile',
      localProfile: 'Local profile',
      personalJournal: 'Personal journal',
      fallbackInitial: 'L',
    },
    topbar: {
      label: 'YOUR TRAINING SPACE',
      syncAria: 'Sync',
    },
    sync: {
      authRequired: 'Sign in required',
      paused: 'Sync paused',
      syncing: 'Syncing',
      savedOffline: 'Saved on device',
      needsReview: 'Needs review',
      onDeviceCount: (count) => `On device · ${count}`,
      synced: 'Synced',
      onDevice: 'Stored on device',
    },
    notices: {
      devMode: 'Local development mode · this profile is only available on your Mac.',
      authOffline:
        'You can keep logging on this device. Sign in with the same account to resume syncing.',
      signIn: 'Sign in',
      syncStorageError:
        'Could not read device storage. Sync is paused; saving new changes is not confirmed.',
      syncServerError: 'Server did not confirm sync. Local changes remain safely on this device.',
      retry: 'Retry',
      hideError: 'Dismiss error',
      conflictText: (name) =>
        `“${name}” was updated on another device. Both versions have been preserved.`,
      takeServer: 'Use server version',
      keepCopy: 'Keep my copy',
    },
    errors: {
      storageOpen:
        'Could not open device storage. Check browser storage permissions and reload. Unsaved entries will not be sent.',
      staleRevision: 'This record changed in another tab. Data refreshed — please retry your edit.',
      saveFailed:
        'Could not save change. Check your input and browser storage space. Change was not saved.',
      refreshFailed: 'Change saved, but the list could not refresh. Please reload the app.',
      openWorkoutFailed: 'Could not open workout. Local storage is unavailable.',
      signInFailed: 'Could not start sign-in. Check your connection and Google configuration.',
      signOutFailed: 'Sign-out requires a server connection. Your local entries remain saved.',
      offlineShellNotLoaded: 'Offline shell is not loaded yet. Open the app online over HTTPS.',
    },
    messages: {
      savedOnDevice: 'Saved on device',
      finishCurrentFirst: 'Finish your current workout first',
    },
    training: {
      defaultTitle: 'Free workout',
      completedHeading: 'Work done.',
      activeHeading: 'Time for a set.',
      greeting: (name) => `Hi, ${name}.`,
      defaultAthlete: 'athlete',
      completedDesc: 'Result saved. Adjust sets below if needed.',
      activeDesc: 'Log at your own pace. Next set is yours.',
      homeDesc: 'A good day to get a little stronger.',
      startWorkout: 'Start workout',
      statWorkoutsLabel: 'WORKOUTS',
      statWorkoutsDetail: 'in your journal',
      statSetsLabel: 'SETS',
      statSetsDetail: 'completed so far',
      statPlansLabel: 'CUSTOM PLANS',
      statPlansDetail: 'ready for next time',
      heroEyebrow: 'YOUR NEXT WORKOUT',
      heroLine1: 'Show up.',
      heroLine2: 'Begin.',
      heroLine3: 'Do the work.',
      heroBodyLine1: 'Add exercises as you go or open',
      heroBodyLine2: 'one of your saved plans.',
      freeWorkout: 'Free workout',
      yourPlans: 'Your plans',
      all: 'All',
      exercisesCount: (n) => `${n} ${n === 1 ? 'exercise' : 'exercises'}`,
      setsCount: (n) => `${n} ${n === 1 ? 'set' : 'sets'}`,
      planEmptyTitle: 'Your plan — your rhythm',
      planEmptyLine1: 'Save a workout as a plan',
      planEmptyLine2: 'to repeat it in one tap.',
      createPlan: 'Create plan',
      recentWorkouts: 'Recent workouts',
      history: 'History',
      recentEmpty: 'Your history will appear here. Start with your first workout.',
      statusActive: 'WORKOUT IN PROGRESS',
      statusCompleted: 'COMPLETED WORKOUT',
      workoutTitleLabel: 'Workout title',
      savePlan: 'Save plan',
      finish: 'Finish',
      restTimerAria: 'Rest timer',
      restLabel: 'Rest',
      add30s: '+30s',
      closeTimerAria: 'Close timer',
      workoutEmptyTitle: 'The first set starts with an exercise',
      workoutEmptyText: 'Pick from your catalog or create a custom exercise.',
      moveUpAria: (name) => `Move ${name} up`,
      moveDownAria: (name) => `Move ${name} down`,
      removeExerciseAria: (name) => `Remove ${name}`,
      lastTime: 'Last time',
      bodyweightShort: 'bodyweight',
      kgUnit: 'kg',
      setCol: 'SET',
      weightCol: 'WEIGHT, KG',
      repsCol: 'REPS',
      doneCol: 'DONE',
      addSet: 'Add set',
      addExercise: 'Add exercise',
      workoutNotesLabel: 'Workout notes',
      workoutNotesPlaceholder: 'How did it feel? Anything worth remembering?',
      storageNote: 'Sets are saved on this device. Sync will resume automatically when online.',
    },
    history: {
      eyebrow: 'EVERY SET COUNTS',
      title: 'Your history.',
      description: 'What you have already done — and what progress is built on.',
      statWorkoutsLabel: 'WORKOUTS',
      statWorkoutsDetail: 'completed',
      statSetsLabel: 'SETS',
      statSetsDetail: 'logged',
      statExercisesLabel: 'EXERCISES',
      statExercisesDetail: 'in your catalog',
      repeat: 'Repeat',
      emptyTitle: 'History starts with your first workout',
      emptyText: 'Log exercises and sets — they will stay right here.',
      inProgressSuffix: '· in progress',
    },
    exercises: {
      eyebrow: 'YOUR MOVEMENT LIBRARY',
      title: 'Exercises.',
      description: 'From barbells to bodyweight. Build your own catalog.',
      addExercise: 'Add exercise',
      searchSr: 'Search exercises',
      searchPlaceholder: 'Search exercise or muscle group…',
      editAria: (name) => `Edit ${name}`,
      noMuscleGroup: 'No muscle group specified',
      emptyTitle: 'Your exercise catalog',
      emptyText: 'Add your favorite exercise or start with a small starter pack.',
      addStarter: 'Add starter exercises',
      starterList: [
        ['Bench Press', 'barbell', 'Chest'],
        ['Back Squat', 'barbell', 'Legs'],
        ['Lat Pulldown', 'cable', 'Back'],
      ],
    },
    templates: {
      eyebrow: 'LESS SETUP, MORE LIFTING',
      title: 'Your plans.',
      description: 'Ready-to-go exercise order and target sets for next time.',
      createPlan: 'Create plan',
      planBadge: (index) => `PLAN ${index}`,
      editPlanAria: (name) => `Edit plan ${name}`,
      archivePlanAria: (name) => `Archive plan ${name}`,
      moreExercises: (n) => `+ ${n} more`,
      startFromPlan: 'Start from plan',
      emptyTitle: 'A workout worth repeating',
      emptyText:
        'Group exercises and target sets into a reusable template. You can also save any workout as a plan.',
      createFirstPlan: 'Create first plan',
    },
    settings: {
      eyebrow: 'YOUR PERSONAL SPACE',
      title: 'Profile.',
      description: 'Account, language, storage, and offline behavior.',
      localDev: 'Local development',
      googleAccount: 'Google account',
      storageAndSync: 'Storage & sync',
      syncStatus: 'Sync status',
      pendingChanges: (n) => `${n} ${n === 1 ? 'record' : 'records'} waiting to sync`,
      noPendingChanges: 'No pending changes',
      syncNow: 'Sync now',
      offlineTitle: 'Offline support',
      offlineReady: 'Offline shell is ready on this device. ',
      offlineNotReady: 'Offline shell is not ready yet. HTTPS and one online visit are required. ',
      offlineDetail:
        'Open the app online at least once. After that you can log workouts offline, and sync will resume once connected.',
      deviceStorageTitle: 'On-device storage',
      deviceStorageDetail:
        'Clearing browser site data removes local records. Unsynced changes exist only on this device.',
      updateAvailable: 'Update available',
      updateBlockedByActive: 'Finish your active workout before updating the app.',
      updateReady: 'An update is ready to install.',
      updateAction: 'Update',
      signOut: 'Sign out',
      signOutNote: 'Unsynced entries stay tied to this account after signing out.',
    },
    footer: {
      left: 'ONE SET AT A TIME.',
      right: 'Built for your pace ↗',
    },
    modals: {
      editExercise: 'Edit exercise',
      newExercise: 'New exercise',
      addExercise: 'Add exercise',
      findExerciseSr: 'Find exercise for workout',
      exerciseNamePlaceholderShort: 'Exercise name…',
      customExerciseFallback: 'Custom exercise',
      createCustomExercise: 'Create custom exercise',
      editPlan: 'Edit plan',
      newPlan: 'New plan',
      saveAsPlan: 'Save as plan',
    },
    setRow: {
      weightAria: (exercise, n) => `${exercise}: set ${n} weight`,
      repsAria: (exercise, n) => `${exercise}: set ${n} reps`,
      completeAria: (exercise, n) => `${exercise}: complete set ${n}`,
      deleteAria: (exercise, n) => `${exercise}: delete set ${n}`,
      bodyweightPlaceholder: 'BW',
      weightError: 'Weight: 0 to 2000 kg',
      repsError: 'Reps: whole number from 1 to 1000',
    },
    exerciseForm: {
      nameError: 'Enter an exercise name (up to 100 characters) and check other field lengths.',
      saveError: 'Change not saved yet. Check storage access and try again.',
      nameLabel: 'Exercise name',
      namePlaceholder: 'e.g. Leg Press — Technogym',
      equipmentLabel: 'Equipment',
      muscleGroupLabel: 'Muscle group',
      muscleGroupPlaceholder: 'e.g. Legs',
      notesLabel: 'Notes',
      notesPlaceholder: 'Seat height, form cues…',
      saving: 'Saving…',
      saveButton: 'Save exercise',
      archiveButton: 'Archive exercise',
      helper: 'Past workouts keep this exercise even if you rename or archive it.',
    },
    templateForm: {
      emptyError: 'Add at least one exercise to the workout first.',
      nameError: 'Enter a plan name between 1 and 100 characters.',
      saveError: 'Plan not saved yet. Check storage access and try again.',
      description:
        'Saves exercise order, weights, and reps. Your workout history remains separate.',
      nameLabel: 'Plan name',
      namePlaceholder: 'e.g. Upper · Day A',
      saving: 'Saving…',
      saveButton: 'Save plan',
    },
    planEditor: {
      emptyError: 'Add at least one exercise to the plan.',
      validationError: 'Check plan name, weight (0–2000 kg), and whole reps (1–1000).',
      saveError: 'Plan not saved yet. Check storage access and try again.',
      nameLabel: 'Plan name',
      namePlaceholder: 'e.g. Upper · Day A',
      addExerciseLabel: 'Add exercise to plan',
      chooseExercise: 'Choose exercise…',
      noExercisesHelper: 'Add exercises in the Exercises tab first, then return to create a plan.',
      moveUpAria: (name) => `Move ${name} up in plan`,
      moveDownAria: (name) => `Move ${name} down in plan`,
      removeAria: (name) => `Remove ${name} from plan`,
      setCol: 'Set',
      kgCol: 'kg',
      repsCol: 'Reps',
      plannedWeightAria: (name, n) => `${name}: planned weight ${n}`,
      plannedRepsAria: (name, n) => `${name}: planned reps ${n}`,
      removePlannedSetAria: (name, n) => `${name}: remove planned set ${n}`,
      addPlannedSet: 'Add target set',
      saving: 'Saving…',
      saveButton: 'Save plan',
      helper: 'Plans provide a blueprint. Actual workout results are always saved separately.',
    },
  },
  uk: {
    docTitle: 'Liftory — твій журнал тренувань',
    dateLocale: 'uk-UA',
    brandTagline: 'твій тренувальний журнал',
    close: 'Закрити',
    languageLabel: 'Мова інтерфейсу',
    languageDescription: 'Перемикання між англійською та українською мовою.',
    equipment: {
      machine: 'Тренажер',
      barbell: 'Штанга',
      dumbbells: 'Гантелі',
      bodyweight: 'Власна вага',
      cable: 'Блок',
      other: 'Інше',
    },
    nav: {
      ariaMain: 'Основна навігація',
      ariaMobile: 'Мобільна навігація',
      training: 'Тренування',
      history: 'Історія',
      exercises: 'Вправи',
      templates: 'Плани',
      settings: 'Профіль',
    },
    booting: 'Відкриваємо твій журнал…',
    landing: {
      eyebrow: 'ОДИН ПІДХІД ЗА РАЗ',
      pill: 'Твій простір для прогресу',
      headlineLine1: 'Менше',
      headlineLine2: 'згадувати.',
      headlineAccent: 'Більше робити.',
      subtitleLine1: 'Вправи, підходи та маленькі перемоги.',
      subtitleLine2: 'Усе твоє тренування — в одному журналі.',
      loginTitle: 'Почнемо з твого підходу',
      loginSubtitle: 'Увійди, щоб зберігати тренування між пристроями.',
      googleButton: 'Увійти через Google',
      googleNotConfigured: 'Вхід Google ще не активований власником застосунку.',
      artEyebrow: 'СЬОГОДНІ · ТВОЯ РОБОТА',
      artHeadline1: 'Сильнішим.',
      artHeadline2: 'Крок за кроком.',
      artCaption: 'Зусилля складаються.',
      artNote: 'Кожен підхід має значення.',
      footerLeft: 'СТВОРЕНО ДЛЯ ТВОГО ТЕМПУ',
      footerRight: 'Журнал • Плани • Прогрес',
    },
    sidebar: {
      noteLine1: 'Твій темп.',
      noteLine2: 'Твій прогрес.',
      defaultProfileName: 'Мій профіль',
      localProfile: 'Локальний профіль',
      personalJournal: 'Особистий журнал',
      fallbackInitial: 'Т',
    },
    topbar: {
      label: 'ТВІЙ ТРЕНУВАЛЬНИЙ ПРОСТІР',
      syncAria: 'Синхронізувати',
    },
    sync: {
      authRequired: 'Потрібен вхід',
      paused: 'Синхронізація призупинена',
      syncing: 'Синхронізація',
      savedOffline: 'Збережено на пристрої',
      needsReview: 'Потрібна перевірка',
      onDeviceCount: (count) => `На пристрої · ${count}`,
      synced: 'Синхронізовано',
      onDevice: 'Дані на пристрої',
    },
    notices: {
      devMode: 'Локальний режим розробки · цей профіль доступний лише на твоєму Mac.',
      authOffline:
        'Можна продовжувати запис на цьому пристрої. Для синхронізації увійди тим самим акаунтом.',
      signIn: 'Увійти',
      syncStorageError:
        'Не вдалося прочитати сховище пристрою. Синхронізацію призупинено; успішне збереження нових змін не підтверджене.',
      syncServerError:
        'Сервер не підтвердив синхронізацію. Локальні зміни залишаються на цьому пристрої.',
      retry: 'Повторити',
      hideError: 'Приховати помилку',
      conflictText: (name) =>
        `Запис «${name}» змінено на іншому пристрої. Обидві версії збережені.`,
      takeServer: 'Взяти серверну',
      keepCopy: 'Зберегти мою копію',
    },
    errors: {
      storageOpen:
        'Не вдалося відкрити сховище пристрою. Перевір доступ до сховища в браузері та перезавантаж сторінку. Незбережені записи не надсилатимуться.',
      staleRevision: 'Запис змінився в іншій вкладці. Дані оновлено — повтори свою зміну.',
      saveFailed:
        'Не вдалося зберегти зміну. Перевір значення та вільне місце браузера. Зміна ще не збережена.',
      refreshFailed: 'Зміна збережена, але список не вдалося оновити. Перезавантаж застосунок.',
      openWorkoutFailed: 'Не вдалося відкрити тренування. Локальне сховище недоступне.',
      signInFailed: 'Не вдалося почати вхід. Перевір з’єднання та налаштування Google.',
      signOutFailed:
        'Вийти можна після відновлення зв’язку із сервером. Локальні записи збережені.',
      offlineShellNotLoaded:
        'Offline-оболонку ще не завантажено. Відкрий застосунок онлайн через HTTPS.',
    },
    messages: {
      savedOnDevice: 'Збережено на пристрої',
      finishCurrentFirst: 'Спочатку заверши поточне тренування',
    },
    training: {
      defaultTitle: 'Вільне тренування',
      completedHeading: 'Твоя робота.',
      activeHeading: 'Час для підходу.',
      greeting: (name) => `Привіт, ${name}.`,
      defaultAthlete: 'атлете',
      completedDesc: 'Результат збережений. За потреби виправ підходи нижче.',
      activeDesc: 'Записуй свій темп. Наступний підхід — за тобою.',
      homeDesc: 'Хороший день, щоб стати трохи сильнішим.',
      startWorkout: 'Почати тренування',
      statWorkoutsLabel: 'ТРЕНУВАНЬ',
      statWorkoutsDetail: 'у твоєму журналі',
      statSetsLabel: 'ПІДХОДІВ',
      statSetsDetail: 'вже виконано',
      statPlansLabel: 'ВЛАСНИХ ПЛАНІВ',
      statPlansDetail: 'готові до наступного разу',
      heroEyebrow: 'ТВОЄ НАСТУПНЕ ТРЕНУВАННЯ',
      heroLine1: 'З’явитися.',
      heroLine2: 'Почати.',
      heroLine3: 'Зробити своє.',
      heroBodyLine1: 'Додай вправи по ходу або відкрий',
      heroBodyLine2: 'свій готовий план.',
      freeWorkout: 'Вільне тренування',
      yourPlans: 'Твої плани',
      all: 'Усі',
      exercisesCount: (n) => `${n} вправ`,
      setsCount: (n) => `${n} підходів`,
      planEmptyTitle: 'Свій план — свій ритм',
      planEmptyLine1: 'Збережи тренування як план,',
      planEmptyLine2: 'щоб швидко повторювати його.',
      createPlan: 'Створити план',
      recentWorkouts: 'Останні тренування',
      history: 'Історія',
      recentEmpty: 'Тут буде твоя історія. Почни з першого тренування.',
      statusActive: 'ТРЕНУВАННЯ ТРИВАЄ',
      statusCompleted: 'ЗАВЕРШЕНЕ ТРЕНУВАННЯ',
      workoutTitleLabel: 'Назва тренування',
      savePlan: 'Зберегти план',
      finish: 'Завершити',
      restTimerAria: 'Таймер відпочинку',
      restLabel: 'Відпочинок',
      add30s: '+30 с',
      closeTimerAria: 'Закрити таймер',
      workoutEmptyTitle: 'Перший підхід починається з вправи',
      workoutEmptyText: 'Обери з каталогу або створи свою вправу.',
      moveUpAria: (name) => `Підняти ${name}`,
      moveDownAria: (name) => `Опустити ${name}`,
      removeExerciseAria: (name) => `Прибрати ${name}`,
      lastTime: 'Минулого разу',
      bodyweightShort: 'власна вага',
      kgUnit: 'кг',
      setCol: 'ПІДХІД',
      weightCol: 'ВАГА, КГ',
      repsCol: 'ПОВТОРИ',
      doneCol: 'ГОТОВО',
      addSet: 'Додати підхід',
      addExercise: 'Додати вправу',
      workoutNotesLabel: 'Нотатка до тренування',
      workoutNotesPlaceholder: 'Як самопочуття? Що варто запам’ятати?',
      storageNote:
        'Підходи зберігаються на пристрої. Синхронізація продовжиться, коли буде зв’язок.',
    },
    history: {
      eyebrow: 'КОЖЕН ПІДХІД РАХУЄТЬСЯ',
      title: 'Твоя історія.',
      description: 'Те, що вже зроблено. І те, на чому будується прогрес.',
      statWorkoutsLabel: 'ТРЕНУВАНЬ',
      statWorkoutsDetail: 'завершено',
      statSetsLabel: 'ПІДХОДІВ',
      statSetsDetail: 'виконано',
      statExercisesLabel: 'ВПРАВ',
      statExercisesDetail: 'у твоєму каталозі',
      repeat: 'Повторити',
      emptyTitle: 'Історія почнеться з першого тренування',
      emptyText: 'Записуй вправи й підходи — вони залишаться тут.',
      inProgressSuffix: '· триває',
    },
    exercises: {
      eyebrow: 'ТВОЯ БАЗА РУХУ',
      title: 'Вправи.',
      description: 'Від штанги до власної ваги. Збирай свій набір.',
      addExercise: 'Додати вправу',
      searchSr: 'Пошук вправ',
      searchPlaceholder: 'Знайти вправу або групу м’язів…',
      editAria: (name) => `Редагувати ${name}`,
      noMuscleGroup: 'Групу м’язів не вказано',
      emptyTitle: 'Твій набір вправ',
      emptyText: 'Додай улюблену вправу або почни з невеликого базового набору.',
      addStarter: 'Додати базові вправи',
      starterList: [
        ['Жим лежачи', 'barbell', 'Груди'],
        ['Присідання', 'barbell', 'Ноги'],
        ['Тяга верхнього блока', 'cable', 'Спина'],
      ],
    },
    templates: {
      eyebrow: 'МЕНШЕ ПІДГОТОВКИ, БІЛЬШЕ РУХУ',
      title: 'Твої плани.',
      description: 'Готовий порядок вправ і підходів для наступного разу.',
      createPlan: 'Створити план',
      planBadge: (index) => `ПЛАН ${index}`,
      editPlanAria: (name) => `Редагувати план ${name}`,
      archivePlanAria: (name) => `Архівувати план ${name}`,
      moreExercises: (n) => `+ ще ${n}`,
      startFromPlan: 'Почати за планом',
      emptyTitle: 'Тренування, яке хочеться повторити',
      emptyText:
        'Збери вправи й заплановані підходи у свій шаблон. Також можна зберегти будь-яке тренування як план.',
      createFirstPlan: 'Створити перший план',
    },
    settings: {
      eyebrow: 'ТВІЙ ОСОБИСТИЙ ПРОСТІР',
      title: 'Профіль.',
      description: 'Обліковий запис, мова, збереження й робота без мережі.',
      localDev: 'Локальна розробка',
      googleAccount: 'Google-акаунт',
      storageAndSync: 'Збереження та зв’язок',
      syncStatus: 'Стан синхронізації',
      pendingChanges: (n) => `${n} записів очікують надсилання`,
      noPendingChanges: 'Немає змін у черзі',
      syncNow: 'Синхронізувати',
      offlineTitle: 'Без інтернету',
      offlineReady: 'Offline-оболонка готова на цьому пристрої. ',
      offlineNotReady:
        'Offline-оболонка ще не готова. Потрібні HTTPS і перше завантаження онлайн. ',
      offlineDetail:
        'Відкрий застосунок онлайн хоча б раз. Надалі можна записувати тренування, а синхронізація відновиться у відкритому застосунку при появі зв’язку.',
      deviceStorageTitle: 'Зберігання на пристрої',
      deviceStorageDetail:
        'Очищення даних браузера видалить локальні записи. Невідправлені зміни існують лише на цьому пристрої.',
      updateAvailable: 'Доступна нова версія',
      updateBlockedByActive: 'Заверши тренування перед оновленням застосунку.',
      updateReady: 'Оновлення готове до встановлення.',
      updateAction: 'Оновити',
      signOut: 'Вийти з акаунта',
      signOutNote: 'Невідправлені записи залишаються прив’язаними до цього акаунта після виходу.',
    },
    footer: {
      left: 'ОДИН ПІДХІД ЗА РАЗ.',
      right: 'Зроблено для твого темпу ↗',
    },
    modals: {
      editExercise: 'Редагувати вправу',
      newExercise: 'Нова вправа',
      addExercise: 'Додати вправу',
      findExerciseSr: 'Знайти вправу для тренування',
      exerciseNamePlaceholderShort: 'Назва вправи…',
      customExerciseFallback: 'Власна вправа',
      createCustomExercise: 'Створити свою вправу',
      editPlan: 'Редагувати план',
      newPlan: 'Новий план',
      saveAsPlan: 'Зберегти як план',
    },
    setRow: {
      weightAria: (exercise, n) => `${exercise}: вага підходу ${n}`,
      repsAria: (exercise, n) => `${exercise}: повтори підходу ${n}`,
      completeAria: (exercise, n) => `${exercise}: виконати підхід ${n}`,
      deleteAria: (exercise, n) => `${exercise}: видалити підхід ${n}`,
      bodyweightPlaceholder: 'Власна',
      weightError: 'Вага: від 0 до 2000 кг',
      repsError: 'Повтори: ціле число від 1 до 1000',
    },
    exerciseForm: {
      nameError: 'Вкажи назву вправи (до 100 символів). Перевір довжину інших полів.',
      saveError: 'Зміна ще не збережена. Перевір доступ до сховища та повтори.',
      nameLabel: 'Назва вправи',
      namePlaceholder: 'Наприклад, жим ногами — Technogym',
      equipmentLabel: 'Обладнання',
      muscleGroupLabel: 'Група м’язів',
      muscleGroupPlaceholder: 'Наприклад, ноги',
      notesLabel: 'Нотатка',
      notesPlaceholder: 'Налаштування сидіння, особливості техніки…',
      saving: 'Збереження…',
      saveButton: 'Зберегти вправу',
      archiveButton: 'Архівувати вправу',
      helper: 'Вправа залишиться у минулих тренуваннях навіть після перейменування або архівації.',
    },
    templateForm: {
      emptyError: 'Спочатку додай хоча б одну вправу до тренування.',
      nameError: 'Вкажи назву плану від 1 до 100 символів.',
      saveError: 'План ще не збережений. Перевір доступ до сховища та повтори.',
      description:
        'Збережемо порядок вправ, вагу та кількість повторів. Історія тренування залишиться окремо.',
      nameLabel: 'Назва плану',
      namePlaceholder: 'Наприклад, Верх · день А',
      saving: 'Збереження…',
      saveButton: 'Зберегти план',
    },
    planEditor: {
      emptyError: 'Додай хоча б одну вправу до плану.',
      validationError: 'Перевір назву плану, вагу (0–2000 кг) та цілі повтори (1–1000).',
      saveError: 'План ще не збережений. Перевір доступ до сховища та повтори.',
      nameLabel: 'Назва плану',
      namePlaceholder: 'Наприклад, Верх · день А',
      addExerciseLabel: 'Додати вправу до плану',
      chooseExercise: 'Обери вправу…',
      noExercisesHelper:
        'Спочатку додай вправи на вкладці «Вправи». Потім повернися до створення плану.',
      moveUpAria: (name) => `Підняти у плані ${name}`,
      moveDownAria: (name) => `Опустити у плані ${name}`,
      removeAria: (name) => `Прибрати з плану ${name}`,
      setCol: 'Підхід',
      kgCol: 'Кг',
      repsCol: 'Повтори',
      plannedWeightAria: (name, n) => `${name}: планова вага ${n}`,
      plannedRepsAria: (name, n) => `${name}: планові повтори ${n}`,
      removePlannedSetAria: (name, n) => `${name}: прибрати плановий підхід ${n}`,
      addPlannedSet: 'Додати плановий підхід',
      saving: 'Збереження…',
      saveButton: 'Зберегти план',
      helper: 'План задає орієнтир. Фактичні результати кожного тренування зберігаються окремо.',
    },
  },
};
