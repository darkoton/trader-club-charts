import type { Locale } from "../../i18n";
import { useI18n } from "../../i18n";

export interface ValidationMessages {
  required: string;
  emailInvalid: string;
  passwordMin: (n: number) => string;
  passwordPattern: string;
  passwordMismatch: string;
  loginError: string;
  loginInvalidCredentials: string;
  registerError: string;
  registerEmailAlreadyRegistered: string;
  confirmError: string;
  confirmIdNotFound: string;
  confirmDepositRequired: string;
  confirmStillPendingDeposit: string;
  confirmPocketIdCopied: string;
  accountConfirmed: string;
  twoFactorRequired: string;
  twoFactorInvalid: string;
  twoFactorCodeRequired: string;
  resetLinkInvalid: string;
  resetError: string;
  passwordChanged: string;
  sendError: string;
  copyFailed: string;
}

interface PublicDictionary {
  meta: {
    dateLocale: string;
    ogLocale: string;
    schemaLanguage: string;
  };
  header: {
    navHome: string;
    navBlog: string;
    closeMenu: string;
    openMenu: string;
    languagePicker: string;
    account: string;
    login: string;
    register: string;
    localeOptions: Record<Locale, { short: string; full: string }>;
  };
  footer: {
    products: string;
    terminal: string;
    robot: string;
    strategies: string;
    signals: string;
    resources: string;
    blog: string;
    socials: string;
    about: string;
    disclaimer: string;
    rightsReserved: string;
    terms: string;
    privacy: string;
  };
  cta: {
    titleLead: string;
    titleAccent: string;
    subtitle: string;
    button: string;
  };
  auth: {
    emailLabel: string;
    emailPlaceholder: string;
    googleButton: string;
    googleRegisterButton: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    confirmPasswordLabel: string;
    confirmPasswordPlaceholder: string;
    forgotPassword: string;
    noAccount: string;
    alreadyHaveAccount: string;
    login: {
      seoTitle: string;
      seoDescription: string;
      title: string;
      subtitle: string;
      submit: string;
    };
    register: {
      seoTitle: string;
      seoDescription: string;
      title: string;
      subtitle: string;
      emailHint: string;
      submit: string;
      loginLink: string;
    };
    twoFactor: {
      seoTitle: string;
      seoDescription: string;
      title: string;
      subtitle: string;
      codeLabel: string;
      codePlaceholder: string;
      confirm: string;
      cancel: string;
    };
    reset: {
      seoTitle: string;
      seoDescription: string;
      title: string;
      subtitle: string;
      submit: string;
      cancel: string;
      sentTitle: string;
      sentSubtitle: (email: string) => string;
      sentHint: string;
      backToLogin: string;
    };
    accessPending: {
      seoTitle: string;
      seoDescription: string;
      description: string;
      checkStatus: string;
      needHelp: string;
      yourPocketId: string;
      copy: string;
      accessFlow: string;
      stepRegisterTitle: string;
      stepRegisterDescription: string;
      stepConfirmedTitle: string;
      stepConfirmedDescription: string;
      stepDepositTitle: string;
      stepDepositDescription: string;
      deposit: string;
      changeId: string;
      logout: string;
    };
  };
  home: {
    seoTitle: string;
    seoDescription: string;
    heroTitleAccent: string;
    heroTitleSuffix: string;
    heroDescription: string;
    heroButton: string;
    heroImageAlt: string;
    featuresHeadingAccent: string;
    featuresHeadingMiddle: string;
    featuresHeadingBottom: string;
    features: Array<{ title: string; desc: string }>;
    signalCardTitle: string;
    demoCardTitle: string;
    journalHeader: string;
    buy: string;
    sell: string;
    partnersTitleLead: string;
    partnersTitleAccent: string;
    partnersTitleSuffix: string;
    partnersDescription: string;
    partnersButton: string;
    partnersMacbookAlt: string;
    partnersPhoneAlt: string;
    devicesTitleLead: string;
    devicesTitleAccent: string;
    devicesTitleSuffix: string;
    devicesMobileLabel: string;
    devicesWebLabel: string;
    devicesPhoneAlt: string;
    devicesLaptopAlt: string;
    securityTitleTop: string;
    securityTitleAccent: string;
    securityDescription: string;
    securityCards: Array<{ title: string; desc: string }>;
    faqTitleLead: string;
    faqTitleAccent: string;
    faqItems: Array<{ q: string; a: string }>;
  };
  blog: {
    seoTitle: (page: number) => string;
    seoDescription: (total: number) => string;
    structuredPageSuffix: (page: number, totalPages: number) => string;
    heroTitle: string;
    heroDescription: string;
    searchPlaceholder: string;
    searchAria: string;
    emptySearchTitle: string;
    emptyListTitle: string;
    emptySearchDescription: (query: string) => string;
    emptyListDescription: string;
    paginationAria: string;
    prevPage: string;
    nextPage: string;
    tocTitle: string;
    tocAria: string;
    articleImageAlt: (title: string) => string;
    articleNotFoundSeoTitle: string;
    articleNotFoundSeoDescription: string;
    articleNotFoundTitleLead: string;
    articleNotFoundTitleAccent: string;
    articleNotFoundDescription: string;
    articleBackToBlog: string;
    articleGoHome: string;
    breadcrumbHome: string;
    breadcrumbBlog: string;
    listStructuredName: string;
  };
  notFound: {
    seoTitle: string;
    seoDescription: string;
    titleLead: string;
    titleAccent: string;
    description: string;
    homeButton: string;
    blogButton: string;
  };
  legal: {
    factsTitle: string;
    asideTitle: string;
  };
  validation: ValidationMessages;
}

const PUBLIC_COPY: Record<Locale, PublicDictionary> = {
  ru: {
    meta: { dateLocale: "ru-RU", ogLocale: "ru_RU", schemaLanguage: "ru-RU" },
    header: {
      navHome: "Главная",
      navBlog: "Блог",
      closeMenu: "Закрыть меню",
      openMenu: "Открыть меню",
      languagePicker: "Выбор языка",
      account: "Аккаунт",
      login: "Войти",
      register: "Регистрация",
      localeOptions: {
        ru: { short: "Ру", full: "Русский" },
        uk: { short: "Укр", full: "Украинский" },
        en: { short: "Англ", full: "Английский" },
      },
    },
    footer: {
      products: "Продукты",
      terminal: "Торговый терминал",
      robot: "Авто-робот",
      strategies: "Торговые стратегии",
      signals: "Сигналы 24/7",
      resources: "Ресурсы",
      blog: "Блог",
      socials: "Соцсети",
      about: "Бесплатные инструменты для торговли бинарными опционами на Pocket Option — графики, сигналы и калькуляторы.",
      disclaimer:
        "Торговля бинарными опционами связана с высоким уровнем риска и может привести к потере вложенных средств. Данный сайт не является инвестиционной рекомендацией.",
      rightsReserved: "Все права защищены.",
      terms: "Terms & Conditions",
      privacy: "Privacy Policy",
    },
    cta: {
      titleLead: "Всё для",
      titleAccent: "Pocket Option",
      subtitle: "Бесплатно. Навсегда.",
      button: "Подключиться бесплатно",
    },
    auth: {
      emailLabel: "Электронная почта",
      emailPlaceholder: "Электронная почта",
      googleButton: "Продолжить через Google",
      googleRegisterButton: "Регистрация через Google",
      passwordLabel: "Пароль",
      passwordPlaceholder: "Пароль",
      confirmPasswordLabel: "Повтор пароля",
      confirmPasswordPlaceholder: "Повтор пароля",
      forgotPassword: "Забыли пароль?",
      noAccount: "Нет аккаунта?",
      alreadyHaveAccount: "Уже есть аккаунт?",
      login: {
        seoTitle: "Вход",
        seoDescription: "Войдите в аккаунт PO Terminal.",
        title: "Вход",
        subtitle: "Используйте данные вашего аккаунта PocketOption для входа",
        submit: "Войти",
      },
      register: {
        seoTitle: "Регистрация",
        seoDescription: "Создайте аккаунт PO Terminal для доступа к инструментам и сервисам Pocket Option.",
        title: "Регистрация",
        subtitle: "Для полного доступа создадим аккаунт у брокера PocketOption",
        emailHint: "Нужен новый почтовый адрес",
        submit: "Регистрация",
        loginLink: "Войти",
      },
      twoFactor: {
        seoTitle: "Двухфакторная аутентификация",
        seoDescription: "Введите код подтверждения, чтобы завершить вход.",
        title: "Подтверждение",
        subtitle: "PocketOption запросил код двухфакторной аутентификации. Введите его, чтобы завершить вход.",
        codeLabel: "Код подтверждения",
        codePlaceholder: "123456",
        confirm: "Подтвердить",
        cancel: "Отмена",
      },
      reset: {
        seoTitle: "Забыли пароль?",
        seoDescription: "Восстановите пароль от аккаунта PO Terminal.",
        title: "Забыли пароль?",
        subtitle: "Введите почту, и мы отправим на неё ссылку для сброса пароля.",
        submit: "Отправить ссылку",
        cancel: "Отмена",
        sentTitle: "Проверьте почту",
        sentSubtitle: (email) => `Мы отправили ссылку для сброса пароля на ${email}. Перейдите по ней, чтобы установить новый пароль.`,
        sentHint: "Не получили письмо? Проверьте папку «Спам» или попробуйте ещё раз через несколько минут.",
        backToLogin: "Вернуться ко входу",
      },
      accessPending: {
        seoTitle: "Доступ временно закрыт",
        seoDescription: "Завершите первый депозит на Pocket Option, чтобы открыть доступ к терминалу.",
        description: "Завершите первый депозит на Pocket Option. После пополнения доступ к терминалу откроется автоматически.",
        checkStatus: "Проверить статус",
        needHelp: "Нужна помощь",
        yourPocketId: "Ваш ID Pocket Option",
        copy: "Скопировать",
        accessFlow: "Получение доступа",
        stepRegisterTitle: "Регистрация на Pocket Option",
        stepRegisterDescription: "Аккаунт найден и привязан к вашему профилю.",
        stepConfirmedTitle: "Pocket ID подтверждён",
        stepConfirmedDescription: "Ваш ID сохранён. Статус доступа будет проверяться автоматически.",
        stepDepositTitle: "Первый депозит",
        stepDepositDescription: "Минимальное пополнение у брокера — от 5$. После депозита доступ откроется автоматически.",
        deposit: "Пополнить",
        changeId: "Изменить ID",
        logout: "Выйти из аккаунта",
      },
    },
    home: {
      seoTitle: "Главная",
      seoDescription: "PO Terminal — бесплатные инструменты для торговли бинарными опционами на Pocket Option. Графики, сигналы 24/7, торговые стратегии, авто-роботы и калькуляторы.",
      heroTitleAccent: "Всё для трейдинга",
      heroTitleSuffix: "в одном терминале",
      heroDescription: "Сигналы, графики, автоматизация и контроль сделок — без переключений и лишних инструментов.",
      heroButton: "Открыть терминал",
      heroImageAlt: "Интерфейс торгового терминала PO Terminal с графиками и индикаторами",
      featuresHeadingAccent: "PO Terminal",
      featuresHeadingMiddle: "Делает Твой",
      featuresHeadingBottom: "Трейдинг Умнее",
      features: [
        { title: "Мульти Язычность", desc: "Интерфейс доступен на нескольких языках для комфортной работы." },
        { title: "Торговые Стратегии", desc: "Используйте готовые стратегии или создавайте собственные под любой рынок." },
        { title: "Дневник Трейдера", desc: "Анализируйте ошибки и усиливайте прибыльные решения." },
        { title: "Торговые Сигналы 24/7", desc: "Сигналы, основанные на анализе рынка в реальном времени." },
        { title: "Доступен Демо-счёт", desc: "Тестируйте платформу без риска, используя виртуальные средства." },
        { title: "Автоматические Роботы", desc: "Роботы выполняют сделки по заданным алгоритмам 24/7." },
      ],
      signalCardTitle: "BTC Buy Signal",
      demoCardTitle: "Demo Account",
      journalHeader: "Profit",
      buy: "BUY",
      sell: "SELL",
      partnersTitleLead: "Являемся",
      partnersTitleAccent: "Прямыми",
      partnersTitleSuffix: "Партнёрами",
      partnersDescription: "Графики созданы с использованием мощной платформы TradingView — ведущей в мире платформы для построения графиков и активного сообщества, которым пользуются более 50 миллионов трейдеров. Наша интеграция с торговыми платформами позволяет получить доступ к лучшим инструментам построения графиков и технического анализа, таким как Stock Screener и Economic Calendar.",
      partnersButton: "Начать торговлю",
      partnersMacbookAlt: "PO Terminal открыт на MacBook — торговые графики и аналитика",
      partnersPhoneAlt: "Мобильная версия PO Terminal на iPhone — торговля в любом месте",
      devicesTitleLead: "На",
      devicesTitleAccent: "Любом",
      devicesTitleSuffix: "Устройстве",
      devicesMobileLabel: "Мобильном",
      devicesWebLabel: "Веб",
      devicesPhoneAlt: "PO Terminal на iPhone — мобильная версия торгового терминала",
      devicesLaptopAlt: "PO Terminal на MacBook — веб-версия",
      securityTitleTop: "Ваша Безопасность - Наш",
      securityTitleAccent: "Приоритет",
      securityDescription: "Мы обеспечиваем высокий уровень защиты ваших средств и данных.\nВсе операции проходят через надёжную и проверенную систему безопасности.\nТоргуйте спокойно, не переживая за безопасность аккаунта.",
      securityCards: [
        { title: "Партнёрство", desc: "Официальная интеграция с брокером\nПлатформа поддерживает работу с торговым счётом через надёжное подключение к брокеру Pocket Option" },
        { title: "Тестирование", desc: "Тестирование стратегий без риска\nПеред использованием на реальном счёте вы можете проверить стратегии и торговых авто роботов в демо-режиме" },
        { title: "Поддержка", desc: "Поддержка 24/7\nНаша команда всегда на связи — вы можете обратиться в любое время и получить помощь по работе с платформой" },
      ],
      faqTitleLead: "Часто Задаваемые",
      faqTitleAccent: "Вопросы",
      faqItems: [
        { q: "Что такое PO Terminal?", a: "PO Terminal — это бесплатная платформа с набором инструментов для торговли бинарными опционами на Pocket Option. Включает графики, сигналы, стратегии и автоматических роботов." },
        { q: "Это бесплатно?", a: "Да, все функции PO Terminal полностью бесплатны. Мы не взимаем плату за использование терминала, сигналов или роботов." },
        { q: "Как начать пользоваться?", a: "Зарегистрируйтесь на нашем сайте, подключите свой аккаунт Pocket Option по реферальной ссылке, и все инструменты станут доступны мгновенно." },
        { q: "Какие брокеры поддерживаются?", a: "На данный момент платформа поддерживает только Pocket Option. Мы являемся прямыми партнёрами этого брокера." },
        { q: "Работает ли на мобильных устройствах?", a: "Да, PO Terminal полностью адаптирован для мобильных устройств. Можно пользоваться через браузер телефона." },
      ],
    },
    blog: {
      seoTitle: (page) => (page === 1 ? "Блог" : `Блог — страница ${page}`),
      seoDescription: (total) => `Статьи о трейдинге, стратегиях и аналитике. ${total} статей о торговле бинарными опционами на Pocket Option.`,
      structuredPageSuffix: (page, totalPages) => (page > 1 ? `Страница ${page} из ${totalPages}.` : ""),
      heroTitle: "Блог",
      heroDescription: "Гайды, стратегии, сравнения инструментов и обучающие материалы для трейдеров на Pocket Option.",
      searchPlaceholder: "Поиск по статьям...",
      searchAria: "Поиск по статьям",
      emptySearchTitle: "Ничего не найдено",
      emptyListTitle: "Статей пока нет",
      emptySearchDescription: (query) => `По запросу «${query}» статьи не найдены. Попробуйте изменить запрос.`,
      emptyListDescription: "Мы уже работаем над новыми материалами. Загляните позже!",
      paginationAria: "Пагинация блога",
      prevPage: "Предыдущая страница",
      nextPage: "Следующая страница",
      tocTitle: "На этой странице",
      tocAria: "Оглавление статьи",
      articleImageAlt: (title) => `Иллюстрация к статье: ${title}`,
      articleNotFoundSeoTitle: "Статья не найдена",
      articleNotFoundSeoDescription: "Запрошенная статья не найдена или была удалена.",
      articleNotFoundTitleLead: "Статья",
      articleNotFoundTitleAccent: "не найдена",
      articleNotFoundDescription: "Возможно, статья была перенесена или удалена. Откройте список публикаций — там вы найдёте свежие материалы о трейдинге, стратегиях и аналитике.",
      articleBackToBlog: "Вернуться к блогу",
      articleGoHome: "На главную",
      breadcrumbHome: "Главная",
      breadcrumbBlog: "Блог",
      listStructuredName: "Блог — PO Terminal",
    },
    notFound: {
      seoTitle: "Страница не найдена",
      seoDescription: "Такой страницы не существует. Возможно, она была перенесена или удалена. Вернитесь на главную или загляните в блог PO Terminal.",
      titleLead: "Страница",
      titleAccent: "не найдена",
      description: "Возможно, вы перешли по устаревшей ссылке или адрес введён с ошибкой. Вернитесь на главную или откройте блог — там много полезных материалов о трейдинге.",
      homeButton: "На главную",
      blogButton: "Открыть блог",
    },
    legal: {
      factsTitle: "Ключевые факты",
      asideTitle: "На этой странице",
    },
    validation: {
      required: "Обязательное поле",
      emailInvalid: "Некорректный email",
      passwordMin: (n) => `Минимум ${n} символов`,
      passwordPattern: "Пароль должен содержать букву и цифру",
      passwordMismatch: "Пароли не совпадают",
      loginError: "Ошибка входа",
      loginInvalidCredentials: "Неправильный логин или пароль",
      registerError: "Ошибка регистрации",
      registerEmailAlreadyRegistered: "Email уже зарегистрирован",
      confirmError: "Ошибка подтверждения",
      confirmIdNotFound: "Pocket ID не найден. Проверьте ID и попробуйте снова.",
      confirmDepositRequired: "Чтобы открыть доступ к терминалу, завершите первый депозит.",
      confirmStillPendingDeposit: "Депозит пока не найден. Доступ откроется автоматически после пополнения.",
      confirmPocketIdCopied: "Pocket ID скопирован",
      accountConfirmed: "Аккаунт подтверждён",
      twoFactorRequired: "Введите код двухфакторной аутентификации",
      twoFactorInvalid: "Неверный код. Попробуйте ещё раз.",
      twoFactorCodeRequired: "Введите код подтверждения",
      resetLinkInvalid: "Ссылка для сброса недействительна",
      resetError: "Ошибка сброса пароля",
      passwordChanged: "Пароль успешно изменён",
      sendError: "Ошибка отправки",
      copyFailed: "Не удалось скопировать Pocket ID",
    },
  },
  uk: {
    meta: { dateLocale: "uk-UA", ogLocale: "uk_UA", schemaLanguage: "uk-UA" },
    header: {
      navHome: "Головна",
      navBlog: "Блог",
      closeMenu: "Закрити меню",
      openMenu: "Відкрити меню",
      languagePicker: "Вибір мови",
      account: "Акаунт",
      login: "Увійти",
      register: "Реєстрація",
      localeOptions: {
        ru: { short: "Рос", full: "Російська" },
        uk: { short: "Укр", full: "Українська" },
        en: { short: "Англ", full: "Англійська" },
      },
    },
    footer: {
      products: "Продукти",
      terminal: "Торговий термінал",
      robot: "Авто-робот",
      strategies: "Торгові стратегії",
      signals: "Сигнали 24/7",
      resources: "Ресурси",
      blog: "Блог",
      socials: "Соцмережі",
      about: "Безкоштовні інструменти для торгівлі бінарними опціонами на Pocket Option — графіки, сигнали та калькулятори.",
      disclaimer: "Торгівля бінарними опціонами пов'язана з високим рівнем ризику та може призвести до втрати вкладених коштів. Цей сайт не є інвестиційною рекомендацією.",
      rightsReserved: "Усі права захищені.",
      terms: "Terms & Conditions",
      privacy: "Privacy Policy",
    },
    cta: {
      titleLead: "Усе для",
      titleAccent: "Pocket Option",
      subtitle: "Безкоштовно. Назавжди.",
      button: "Підключитися безкоштовно",
    },
    auth: {
      emailLabel: "Електронна пошта",
      emailPlaceholder: "Електронна пошта",
      googleButton: "Продовжити через Google",
      googleRegisterButton: "Реєстрація через Google",
      passwordLabel: "Пароль",
      passwordPlaceholder: "Пароль",
      confirmPasswordLabel: "Повтор пароля",
      confirmPasswordPlaceholder: "Повтор пароля",
      forgotPassword: "Забули пароль?",
      noAccount: "Немає акаунта?",
      alreadyHaveAccount: "Вже є акаунт?",
      login: {
        seoTitle: "Вхід",
        seoDescription: "Увійдіть в акаунт PO Terminal.",
        title: "Вхід",
        subtitle: "Використовуйте дані вашого акаунта PocketOption для входу",
        submit: "Увійти",
      },
      register: {
        seoTitle: "Реєстрація",
        seoDescription: "Створіть акаунт PO Terminal для доступу до інструментів і сервісів Pocket Option.",
        title: "Реєстрація",
        subtitle: "Для повного доступу створимо акаунт у брокера PocketOption",
        emailHint: "Потрібна нова адреса електронної пошти",
        submit: "Реєстрація",
        loginLink: "Увійти",
      },
      twoFactor: {
        seoTitle: "Двофакторна автентифікація",
        seoDescription: "Введіть код підтвердження, щоб завершити вхід.",
        title: "Підтвердження",
        subtitle: "PocketOption запросив код двофакторної автентифікації. Введіть його, щоб завершити вхід.",
        codeLabel: "Код підтвердження",
        codePlaceholder: "123456",
        confirm: "Підтвердити",
        cancel: "Скасувати",
      },
      reset: {
        seoTitle: "Забули пароль?",
        seoDescription: "Відновіть пароль від акаунта PO Terminal.",
        title: "Забули пароль?",
        subtitle: "Введіть пошту, і ми надішлемо на неї посилання для скидання пароля.",
        submit: "Надіслати посилання",
        cancel: "Скасувати",
        sentTitle: "Перевірте пошту",
        sentSubtitle: (email) => `Ми надіслали посилання для скидання пароля на ${email}. Перейдіть за ним, щоб встановити новий пароль.`,
        sentHint: "Не отримали лист? Перевірте папку «Спам» або спробуйте ще раз через кілька хвилин.",
        backToLogin: "Повернутися до входу",
      },
      accessPending: {
        seoTitle: "Доступ тимчасово закрито",
        seoDescription: "Завершіть перший депозит на Pocket Option, щоб відкрити доступ до термінала.",
        description: "Завершіть перший депозит на Pocket Option. Після поповнення доступ до термінала відкриється автоматично.",
        checkStatus: "Перевірити статус",
        needHelp: "Потрібна допомога",
        yourPocketId: "Ваш ID Pocket Option",
        copy: "Скопіювати",
        accessFlow: "Отримання доступу",
        stepRegisterTitle: "Реєстрація на Pocket Option",
        stepRegisterDescription: "Акаунт знайдено та прив'язано до вашого профілю.",
        stepConfirmedTitle: "Pocket ID підтверджено",
        stepConfirmedDescription: "Ваш ID збережено. Статус доступу перевірятиметься автоматично.",
        stepDepositTitle: "Перший депозит",
        stepDepositDescription: "Мінімальне поповнення у брокера — від 5$. Після депозиту доступ відкриється автоматично.",
        deposit: "Поповнити",
        changeId: "Змінити ID",
        logout: "Вийти з акаунта",
      },
    },
    home: {
      seoTitle: "Головна",
      seoDescription: "PO Terminal — безкоштовні інструменти для торгівлі бінарними опціонами на Pocket Option. Графіки, сигнали 24/7, торгові стратегії, авто-роботи та калькулятори.",
      heroTitleAccent: "Усе для трейдингу",
      heroTitleSuffix: "в одному терміналі",
      heroDescription: "Сигнали, графіки, автоматизація та контроль угод — без перемикань і зайвих інструментів.",
      heroButton: "Відкрити термінал",
      heroImageAlt: "Інтерфейс торгового термінала PO Terminal з графіками та індикаторами",
      featuresHeadingAccent: "PO Terminal",
      featuresHeadingMiddle: "Робить Твій",
      featuresHeadingBottom: "Трейдинг Розумнішим",
      features: [
        { title: "Мультимовність", desc: "Інтерфейс доступний кількома мовами для комфортної роботи." },
        { title: "Торгові Стратегії", desc: "Використовуйте готові стратегії або створюйте власні під будь-який ринок." },
        { title: "Щоденник Трейдера", desc: "Аналізуйте помилки та посилюйте прибуткові рішення." },
        { title: "Торгові Сигнали 24/7", desc: "Сигнали, засновані на аналізі ринку в реальному часі." },
        { title: "Доступний Демо-рахунок", desc: "Тестуйте платформу без ризику, використовуючи віртуальні кошти." },
        { title: "Автоматичні Роботи", desc: "Роботи виконують угоди за заданими алгоритмами 24/7." },
      ],
      signalCardTitle: "BTC Buy Signal",
      demoCardTitle: "Demo Account",
      journalHeader: "Profit",
      buy: "BUY",
      sell: "SELL",
      partnersTitleLead: "Є",
      partnersTitleAccent: "Прямими",
      partnersTitleSuffix: "Партнерами",
      partnersDescription: "Графіки створені з використанням потужної платформи TradingView — провідної у світі платформи для побудови графіків і активної спільноти, якою користуються понад 50 мільйонів трейдерів. Наша інтеграція з торговими платформами дозволяє отримати доступ до найкращих інструментів побудови графіків і технічного аналізу, таких як Stock Screener та Economic Calendar.",
      partnersButton: "Почати торгівлю",
      partnersMacbookAlt: "PO Terminal відкритий на MacBook — торгові графіки та аналітика",
      partnersPhoneAlt: "Мобільна версія PO Terminal на iPhone — торгівля будь-де",
      devicesTitleLead: "На",
      devicesTitleAccent: "Будь-якому",
      devicesTitleSuffix: "Пристрої",
      devicesMobileLabel: "Мобільному",
      devicesWebLabel: "Веб",
      devicesPhoneAlt: "PO Terminal на iPhone — мобільна версія торгового термінала",
      devicesLaptopAlt: "PO Terminal на MacBook — веб-версія",
      securityTitleTop: "Ваша Безпека - Наш",
      securityTitleAccent: "Пріоритет",
      securityDescription: "Ми забезпечуємо високий рівень захисту ваших коштів і даних.\nУсі операції проходять через надійну та перевірену систему безпеки.\nТоргуйте спокійно, не хвилюючись за безпеку акаунта.",
      securityCards: [
        { title: "Партнерство", desc: "Офіційна інтеграція з брокером\nПлатформа підтримує роботу з торговим рахунком через надійне підключення до брокера Pocket Option" },
        { title: "Тестування", desc: "Тестування стратегій без ризику\nПеред використанням на реальному рахунку ви можете перевірити стратегії та торгових авто-роботів у демо-режимі" },
        { title: "Підтримка", desc: "Підтримка 24/7\nНаша команда завжди на зв'язку — ви можете звернутися у будь-який час і отримати допомогу щодо роботи з платформою" },
      ],
      faqTitleLead: "Часті",
      faqTitleAccent: "Питання",
      faqItems: [
        { q: "Що таке PO Terminal?", a: "PO Terminal — це безкоштовна платформа з набором інструментів для торгівлі бінарними опціонами на Pocket Option. Включає графіки, сигнали, стратегії та автоматичних роботів." },
        { q: "Це безкоштовно?", a: "Так, усі функції PO Terminal повністю безкоштовні. Ми не стягуємо плату за використання термінала, сигналів чи роботів." },
        { q: "Як почати користуватися?", a: "Зареєструйтеся на нашому сайті, підключіть свій акаунт Pocket Option за реферальним посиланням, і всі інструменти стануть доступні миттєво." },
        { q: "Які брокери підтримуються?", a: "Наразі платформа підтримує лише Pocket Option. Ми є прямими партнерами цього брокера." },
        { q: "Чи працює на мобільних пристроях?", a: "Так, PO Terminal повністю адаптований для мобільних пристроїв. Можна користуватися через браузер телефона." },
      ],
    },
    blog: {
      seoTitle: (page) => (page === 1 ? "Блог" : `Блог — сторінка ${page}`),
      seoDescription: (total) => `Статті про трейдинг, стратегії та аналітику. ${total} статей про торгівлю бінарними опціонами на Pocket Option.`,
      structuredPageSuffix: (page, totalPages) => (page > 1 ? `Сторінка ${page} з ${totalPages}.` : ""),
      heroTitle: "Блог",
      heroDescription: "Гайди, стратегії, порівняння інструментів і навчальні матеріали для трейдерів на Pocket Option.",
      searchPlaceholder: "Пошук по статтях...",
      searchAria: "Пошук по статтях",
      emptySearchTitle: "Нічого не знайдено",
      emptyListTitle: "Статей поки немає",
      emptySearchDescription: (query) => `За запитом «${query}» статей не знайдено. Спробуйте змінити запит.`,
      emptyListDescription: "Ми вже працюємо над новими матеріалами. Завітайте пізніше!",
      paginationAria: "Пагінація блогу",
      prevPage: "Попередня сторінка",
      nextPage: "Наступна сторінка",
      tocTitle: "На цій сторінці",
      tocAria: "Зміст статті",
      articleImageAlt: (title) => `Ілюстрація до статті: ${title}`,
      articleNotFoundSeoTitle: "Статтю не знайдено",
      articleNotFoundSeoDescription: "Запитану статтю не знайдено або її було видалено.",
      articleNotFoundTitleLead: "Стаття",
      articleNotFoundTitleAccent: "не знайдена",
      articleNotFoundDescription: "Можливо, статтю було перенесено або видалено. Відкрийте список публікацій — там ви знайдете свіжі матеріали про трейдинг, стратегії та аналітику.",
      articleBackToBlog: "Повернутися до блогу",
      articleGoHome: "На головну",
      breadcrumbHome: "Головна",
      breadcrumbBlog: "Блог",
      listStructuredName: "Блог — PO Terminal",
    },
    notFound: {
      seoTitle: "Сторінку не знайдено",
      seoDescription: "Такої сторінки не існує. Можливо, її було перенесено або видалено. Поверніться на головну або загляньте в блог PO Terminal.",
      titleLead: "Сторінка",
      titleAccent: "не знайдена",
      description: "Можливо, ви перейшли за застарілим посиланням або адресу введено з помилкою. Поверніться на головну або відкрийте блог — там багато корисних матеріалів про трейдинг.",
      homeButton: "На головну",
      blogButton: "Відкрити блог",
    },
    legal: {
      factsTitle: "Ключові факти",
      asideTitle: "На цій сторінці",
    },
    validation: {
      required: "Обов'язкове поле",
      emailInvalid: "Некоректний email",
      passwordMin: (n) => `Мінімум ${n} символів`,
      passwordPattern: "Пароль має містити літеру і цифру",
      passwordMismatch: "Паролі не збігаються",
      loginError: "Помилка входу",
      loginInvalidCredentials: "Невірний логін або пароль",
      registerError: "Помилка реєстрації",
      registerEmailAlreadyRegistered: "Email вже зареєстрований",
      confirmError: "Помилка підтвердження",
      confirmIdNotFound: "Pocket ID не знайдено. Перевірте ID і спробуйте ще раз.",
      confirmDepositRequired: "Щоб відкрити доступ до термінала, завершіть перший депозит.",
      confirmStillPendingDeposit: "Депозит поки не знайдено. Доступ відкриється автоматично після поповнення.",
      confirmPocketIdCopied: "Pocket ID скопійовано",
      accountConfirmed: "Акаунт підтверджено",
      twoFactorRequired: "Введіть код двофакторної автентифікації",
      twoFactorInvalid: "Невірний код. Спробуйте ще раз.",
      twoFactorCodeRequired: "Введіть код підтвердження",
      resetLinkInvalid: "Посилання для скидання недійсне",
      resetError: "Помилка скидання пароля",
      passwordChanged: "Пароль успішно змінено",
      sendError: "Помилка відправлення",
      copyFailed: "Не вдалося скопіювати Pocket ID",
    },
  },
  en: {
    meta: { dateLocale: "en-US", ogLocale: "en_US", schemaLanguage: "en-US" },
    header: {
      navHome: "Home",
      navBlog: "Blog",
      closeMenu: "Close menu",
      openMenu: "Open menu",
      languagePicker: "Language selection",
      account: "Account",
      login: "Login",
      register: "Register",
      localeOptions: {
        ru: { short: "Rus", full: "Russian" },
        uk: { short: "Ukr", full: "Ukrainian" },
        en: { short: "Eng", full: "English" },
      },
    },
    footer: {
      products: "Products",
      terminal: "Trading terminal",
      robot: "Auto bot",
      strategies: "Trading strategies",
      signals: "Signals 24/7",
      resources: "Resources",
      blog: "Blog",
      socials: "Socials",
      about: "Free tools for binary options trading on Pocket Option: charts, signals, and calculators.",
      disclaimer: "Binary options trading involves a high level of risk and may result in the loss of invested funds. This website does not provide investment advice.",
      rightsReserved: "All rights reserved.",
      terms: "Terms & Conditions",
      privacy: "Privacy Policy",
    },
    cta: {
      titleLead: "Everything for",
      titleAccent: "Pocket Option",
      subtitle: "Free. Forever.",
      button: "Join for free",
    },
    auth: {
      emailLabel: "Email",
      emailPlaceholder: "Email",
      googleButton: "Continue with Google",
      googleRegisterButton: "Sign up with Google",
      passwordLabel: "Password",
      passwordPlaceholder: "Password",
      confirmPasswordLabel: "Confirm password",
      confirmPasswordPlaceholder: "Confirm password",
      forgotPassword: "Forgot password?",
      noAccount: "No account yet?",
      alreadyHaveAccount: "Already have an account?",
      login: {
        seoTitle: "Login",
        seoDescription: "Log in to your PO Terminal account.",
        title: "Login",
        subtitle: "Use your PocketOption account details to sign in",
        submit: "Login",
      },
      register: {
        seoTitle: "Register",
        seoDescription: "Create your PO Terminal account to access Pocket Option tools and services.",
        title: "Registration",
        subtitle: "For full access, we will create an account with the PocketOption broker",
        emailHint: "Use a new email address",
        submit: "Register",
        loginLink: "Login",
      },
      twoFactor: {
        seoTitle: "Two-factor authentication",
        seoDescription: "Enter the verification code to complete sign-in.",
        title: "Verification",
        subtitle: "PocketOption requested a two-factor authentication code. Enter it to complete sign-in.",
        codeLabel: "Verification code",
        codePlaceholder: "123456",
        confirm: "Confirm",
        cancel: "Cancel",
      },
      reset: {
        seoTitle: "Forgot password?",
        seoDescription: "Recover the password for your PO Terminal account.",
        title: "Forgot password?",
        subtitle: "Enter your email and we will send you a password reset link.",
        submit: "Send link",
        cancel: "Cancel",
        sentTitle: "Check your email",
        sentSubtitle: (email) => `We sent a password reset link to ${email}. Follow it to set a new password.`,
        sentHint: "Didn’t get the email? Check your spam folder or try again in a few minutes.",
        backToLogin: "Back to login",
      },
      accessPending: {
        seoTitle: "Access temporarily locked",
        seoDescription: "Complete your first deposit on Pocket Option to unlock access to the terminal.",
        description: "Complete your first deposit on Pocket Option. Access to the terminal will open automatically after funding.",
        checkStatus: "Check status",
        needHelp: "Need help",
        yourPocketId: "Your Pocket Option ID",
        copy: "Copy",
        accessFlow: "Access flow",
        stepRegisterTitle: "Pocket Option registration",
        stepRegisterDescription: "Your account was found and linked to your profile.",
        stepConfirmedTitle: "Pocket ID confirmed",
        stepConfirmedDescription: "Your ID is saved. Access status will be checked automatically.",
        stepDepositTitle: "First deposit",
        stepDepositDescription: "The broker minimum funding amount is from $5. After the deposit, access will open automatically.",
        deposit: "Deposit",
        changeId: "Change ID",
        logout: "Log out",
      },
    },
    home: {
      seoTitle: "Home",
      seoDescription: "PO Terminal offers free tools for binary options trading on Pocket Option. Charts, signals 24/7, trading strategies, auto bots, and calculators.",
      heroTitleAccent: "Everything for trading",
      heroTitleSuffix: "in one terminal",
      heroDescription: "Signals, charts, automation, and trade control without switching tabs or juggling extra tools.",
      heroButton: "Open terminal",
      heroImageAlt: "PO Terminal trading interface with charts and indicators",
      featuresHeadingAccent: "PO Terminal",
      featuresHeadingMiddle: "Makes Your",
      featuresHeadingBottom: "Trading Smarter",
      features: [
        { title: "Multi-language", desc: "The interface is available in multiple languages for a smoother workflow." },
        { title: "Trading Strategies", desc: "Use ready-made strategies or build your own for any market." },
        { title: "Trader Journal", desc: "Review mistakes and reinforce the decisions that drive profit." },
        { title: "Trading Signals 24/7", desc: "Signals powered by real-time market analysis." },
        { title: "Demo Account Available", desc: "Test the platform risk-free with virtual funds." },
        { title: "Automated Bots", desc: "Bots execute trades by predefined algorithms around the clock." },
      ],
      signalCardTitle: "BTC Buy Signal",
      demoCardTitle: "Demo Account",
      journalHeader: "Profit",
      buy: "BUY",
      sell: "SELL",
      partnersTitleLead: "We Are",
      partnersTitleAccent: "Direct",
      partnersTitleSuffix: "Partners",
      partnersDescription: "Charts are powered by TradingView, the world’s leading charting platform and active community trusted by more than 50 million traders. Our integration with trading platforms gives you access to top charting and technical analysis tools such as Stock Screener and Economic Calendar.",
      partnersButton: "Start trading",
      partnersMacbookAlt: "PO Terminal open on a MacBook with trading charts and analytics",
      partnersPhoneAlt: "Mobile PO Terminal on iPhone for trading anywhere",
      devicesTitleLead: "On",
      devicesTitleAccent: "Any",
      devicesTitleSuffix: "Device",
      devicesMobileLabel: "Mobile",
      devicesWebLabel: "Web",
      devicesPhoneAlt: "PO Terminal on iPhone mobile view",
      devicesLaptopAlt: "PO Terminal web version on MacBook",
      securityTitleTop: "Your Security Is Our",
      securityTitleAccent: "Priority",
      securityDescription: "We maintain a high level of protection for your funds and data.\nAll operations run through a reliable and proven security system.\nTrade with confidence without worrying about account safety.",
      securityCards: [
        { title: "Partnership", desc: "Official broker integration\nThe platform works with your trading account through a secure Pocket Option connection" },
        { title: "Testing", desc: "Risk-free strategy testing\nBefore using strategies or trading bots on a live account, you can test them in demo mode" },
        { title: "Support", desc: "24/7 support\nOur team is always available, so you can reach out anytime and get help with the platform" },
      ],
      faqTitleLead: "Frequently Asked",
      faqTitleAccent: "Questions",
      faqItems: [
        { q: "What is PO Terminal?", a: "PO Terminal is a free platform with a set of tools for binary options trading on Pocket Option. It includes charts, signals, strategies, and automated bots." },
        { q: "Is it free?", a: "Yes, every PO Terminal feature is completely free. We do not charge for the terminal, signals, or bots." },
        { q: "How do I get started?", a: "Register on our website, connect your Pocket Option account using the referral link, and all tools become available instantly." },
        { q: "Which brokers are supported?", a: "At the moment, the platform supports only Pocket Option. We are direct partners of this broker." },
        { q: "Does it work on mobile devices?", a: "Yes, PO Terminal is fully adapted for mobile devices. You can use it in a phone browser." },
      ],
    },
    blog: {
      seoTitle: (page) => (page === 1 ? "Blog" : `Blog — page ${page}`),
      seoDescription: (total) => `Articles about trading, strategies, and analytics. ${total} articles on binary options trading with Pocket Option.`,
      structuredPageSuffix: (page, totalPages) => (page > 1 ? `Page ${page} of ${totalPages}.` : ""),
      heroTitle: "Blog",
      heroDescription: "Guides, strategies, tool comparisons, and educational content for Pocket Option traders.",
      searchPlaceholder: "Search articles...",
      searchAria: "Search articles",
      emptySearchTitle: "Nothing found",
      emptyListTitle: "No articles yet",
      emptySearchDescription: (query) => `No articles were found for “${query}”. Try a different search query.`,
      emptyListDescription: "We’re already working on new content. Check back soon!",
      paginationAria: "Blog pagination",
      prevPage: "Previous page",
      nextPage: "Next page",
      tocTitle: "On this page",
      tocAria: "Article table of contents",
      articleImageAlt: (title) => `Article illustration: ${title}`,
      articleNotFoundSeoTitle: "Article not found",
      articleNotFoundSeoDescription: "The requested article could not be found or was removed.",
      articleNotFoundTitleLead: "Article",
      articleNotFoundTitleAccent: "not found",
      articleNotFoundDescription: "The article may have been moved or removed. Open the publication list to find fresh materials about trading, strategies, and analytics.",
      articleBackToBlog: "Back to blog",
      articleGoHome: "Go home",
      breadcrumbHome: "Home",
      breadcrumbBlog: "Blog",
      listStructuredName: "Blog — PO Terminal",
    },
    notFound: {
      seoTitle: "Page not found",
      seoDescription: "This page does not exist. It may have been moved or removed. Return home or visit the PO Terminal blog.",
      titleLead: "Page",
      titleAccent: "not found",
      description: "You may have followed an outdated link or entered the address incorrectly. Go back home or open the blog for useful trading content.",
      homeButton: "Go home",
      blogButton: "Open blog",
    },
    legal: {
      factsTitle: "Quick facts",
      asideTitle: "On this page",
    },
    validation: {
      required: "Required field",
      emailInvalid: "Invalid email",
      passwordMin: (n) => `Minimum ${n} characters`,
      passwordPattern: "Password must contain a letter and a number",
      passwordMismatch: "Passwords do not match",
      loginError: "Login error",
      loginInvalidCredentials: "Invalid login or password",
      registerError: "Registration error",
      registerEmailAlreadyRegistered: "Email is already registered",
      confirmError: "Confirmation error",
      confirmIdNotFound: "Pocket ID not found. Check the ID and try again.",
      confirmDepositRequired: "Complete your first deposit to unlock terminal access.",
      confirmStillPendingDeposit: "Deposit not found yet. Access will open automatically after funding.",
      confirmPocketIdCopied: "Pocket ID copied",
      accountConfirmed: "Account confirmed",
      twoFactorRequired: "Enter the two-factor authentication code",
      twoFactorInvalid: "Invalid code. Try again.",
      twoFactorCodeRequired: "Enter the verification code",
      resetLinkInvalid: "Reset link is invalid",
      resetError: "Password reset error",
      passwordChanged: "Password changed successfully",
      sendError: "Send error",
      copyFailed: "Failed to copy Pocket ID",
    },
  },
};

export function getPublicCopy(locale: Locale) {
  return PUBLIC_COPY[locale];
}

export function getPublicValidationMessages(locale: Locale) {
  return PUBLIC_COPY[locale].validation;
}

export function formatPublicDate(locale: Locale, value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(PUBLIC_COPY[locale].meta.dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function usePublicI18n() {
  const { locale } = useI18n();
  return {
    locale,
    publicT: PUBLIC_COPY[locale],
  };
}