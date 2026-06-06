export interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  image: string;
  date: string;
  /** ISO 8601 date for structured data */
  dateISO: string;
  readTime: string;
  /** SEO keywords/tags */
  tags: string[];
  /** Article category for article:section meta */
  category: string;
  content: ContentBlock[];
}

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string; id: string }
  | { type: "image"; src: string; alt: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "link"; href: string; text: string }
  | { type: "quote"; text: string; author?: string }
  | { type: "step"; number: number; title: string; blocks: ContentBlock[] };

function makeArticle(i: number): BlogArticle {
  const slug = `article-${i}`;
  const dateObj = new Date(2025, 10, 29);
  const date = dateObj.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const dateISO = dateObj.toISOString();

  return {
    slug,
    title: "С чего начать путь в трейдинге: Полное пошаговое руководство по Pocket Option",
    description:
      "Дорожная карта для новичка: пошаговый план от регистрации и безопасного пополнения через криптовалюту до основ технического анализа и настройки Spectra Charts.",
    image: "https://placehold.co/800x400/1b1e2e/80b2ff?text=Trading+Guide",
    date,
    dateISO,
    readTime: `${5 + (i % 8)} мин`,
    tags: ["трейдинг", "Pocket Option", "бинарные опционы", "обучение", "новичкам"],
    category: "Обучение трейдингу",
    content: [
      {
        type: "paragraph",
        text: "Если вы узнали себя в этих вопросах — эта статья для вас. В самом начале пути каждый из нас чувствует растерянность. Это нормально. Чтобы превратить хаос в систему, мы разработали чёткую хронологию изучения материалов.",
      },
      {
        type: "paragraph",
        text: "В этом руководстве вы найдёте структурированный план: от регистрации и финансовой безопасности до использования профессиональных аналитических инструментов Spectra Charts.",
      },
      {
        type: "heading",
        level: 2,
        text: "Часть 1. Фундамент: Подготовка к работе",
        id: "part-1",
      },
      {
        type: "paragraph",
        text: "Если вы ещё не являетесь нашим партнёром, но хотите присоединиться к команде, получить доступ к закрытому сообществу, сигналам и инструментам, начинайте именно с этого раздела. Не перепрыгивайте через ступени.",
      },
      {
        type: "step",
        number: 1,
        title: "Погружение в теорию",
        blocks: [
          {
            type: "paragraph",
            text: "Прежде чем рисковать деньгами, нужно выучить «язык» рынка.",
          },
          {
            type: "link",
            href: "#",
            text: "Бинарные опционы: Полный глоссарий терминов и их определений",
          },
          {
            type: "paragraph",
            text: "Изучите основные понятия, чтобы понимать, о чём говорят трейдеры и что написано в обучающих статьях. Без базы двигаться дальше бессмысленно.",
          },
        ],
      },
      {
        type: "step",
        number: 2,
        title: "Знакомство с инструментом",
        blocks: [
          {
            type: "paragraph",
            text: "Ваш рабочий стол — это платформа брокера.",
          },
          {
            type: "link",
            href: "#",
            text: "Полный обзор платформы Pocket Option — руководство для новичков",
          },
          {
            type: "paragraph",
            text: "Перед началом работы вам необходимо иметь чёткое представление о том, как функционирует платформа, где находится каждая кнопка, как настроить график и какие внутренние возможности предоставляет биржа.",
          },
        ],
      },
      {
        type: "step",
        number: 3,
        title: "Регистрация аккаунта",
        blocks: [
          {
            type: "paragraph",
            text: "Правильный старт — залог отсутствия проблем в будущем.",
          },
          {
            type: "link",
            href: "#",
            text: "Как зарегистрироваться на бирже Pocket Option",
          },
          {
            type: "paragraph",
            text: "Многие новички спотыкаются на этом этапе. Данная инструкция — базовая информация, которая снимет все вопросы о создании профиля.",
          },
        ],
      },
      {
        type: "heading",
        level: 2,
        text: "Заключение",
        id: "conclusion",
      },
      {
        type: "paragraph",
        text: "Трейдинг — это путь постепенного накопления опыта. Вы получаете «насмотренность» графика, изо дня в день повышаете свою квалификацию и со временем вам становится проще замечать знакомые ситуации и паттерны. Вы начинаете понимать не только что вы делаете, но и зачем.",
      },
      {
        type: "quote",
        text: "«Преодоление трудностей начинается с лёгкого, осуществление великого начинается с малого, ибо в мире трудное образуется из лёгкого, а великое — из малого»",
        author: "Лао-цзы",
      },
      {
        type: "paragraph",
        text: "Трейдинг — это путь постепенного накопления опыта. Вы получаете «насмотренность» графика, изо дня в день повышаете свою квалификацию и со временем вам становится проще замечать знакомые ситуации и паттерны.",
      },
    ],
  };
}

export const articles: BlogArticle[] = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));

export function getArticleBySlug(slug: string): BlogArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getArticlesPaginated(page: number, perPage = 15) {
  const start = (page - 1) * perPage;
  const items = articles.slice(start, start + perPage);
  return {
    items,
    page,
    perPage,
    total: articles.length,
    totalPages: Math.ceil(articles.length / perPage),
  };
}

/**
 * Approximate word count of an article — used for `schema.org/BlogPosting.wordCount`.
 * Traverses all content blocks (including nested step blocks).
 */
export function getArticleWordCount(article: BlogArticle): number {
  const countText = (s: string) => s.trim().match(/\S+/g)?.length ?? 0;

  function walk(blocks: ContentBlock[]): number {
    let total = 0;
    for (const b of blocks) {
      switch (b.type) {
        case "paragraph":
        case "heading":
        case "link":
        case "quote":
          total += countText(b.text);
          break;
        case "list":
          for (const item of b.items) total += countText(item);
          break;
        case "step":
          total += countText(b.title);
          total += walk(b.blocks);
          break;
      }
    }
    return total;
  }

  return walk(article.content);
}
