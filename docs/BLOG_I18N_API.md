# Blog API: Multilingual Contract

## Purpose

This document describes the backend changes required so the admin panel can save article translations and the public blog can receive already localized content from the API.

Current frontend status:

- Admin article editor sends `translations` for `ru`, `uk`, `en`
- Public blog sends `locale` and `lang` query parameters to blog endpoints
- Frontend still supports backward compatibility with legacy top-level article fields

## Supported Locales

- `ru`
- `uk`
- `en`

## Target Data Model

Recommended article shape in storage:

```json
{
  "_id": "682f1a...",
  "slug": "price-action-basics",
  "thumbnail": "/uploads/blog/thumb.webp",
  "banner": "/uploads/blog/banner.webp",
  "tags": ["beginners", "price-action"],
  "is_published": true,
  "published_at": "2026-05-07T12:00:00.000Z",
  "created_at": "2026-05-06T09:00:00.000Z",
  "updated_at": "2026-05-07T12:00:00.000Z",
  "translations": {
    "ru": {
      "title": "Основы price action",
      "description": "Как читать движение цены без лишних индикаторов.",
      "sections": [
        {
          "id": "intro",
          "title": "Введение",
          "content": "<p>...</p>",
          "order": 0
        }
      ]
    },
    "uk": {
      "title": "Основи price action",
      "description": "Як читати рух ціни без зайвих індикаторів.",
      "sections": [
        {
          "id": "intro",
          "title": "Вступ",
          "content": "<p>...</p>",
          "order": 0
        }
      ]
    },
    "en": {
      "title": "Price action basics",
      "description": "How to read price movement without extra indicators.",
      "sections": [
        {
          "id": "intro",
          "title": "Introduction",
          "content": "<p>...</p>",
          "order": 0
        }
      ]
    }
  }
}
```

## Backward Compatibility

During migration, keep legacy top-level fields in responses:

- `title`
- `description`
- `sections`

These fields should contain the resolved localized content for the requested locale.

This lets the existing public UI continue working even if some consumers still rely on the old shape.

## Locale Resolution Rules

For public endpoints, resolve content by locale using this order:

1. requested locale from `locale`
2. requested locale from `lang`
3. fallback `ru`
4. fallback `uk`
5. fallback `en`

If no translation exists at all, return the legacy stored content or empty strings.

## Admin API

### GET `/admin/blog/articles`

List articles for admin table.

Request query:

- `page`
- `limit`
- `status` = `published | draft`

Response requirements:

- include `translations`
- keep top-level `title`, `description`, `sections` for compatibility

Example response item:

```json
{
  "_id": "682f1a...",
  "title": "Основы price action",
  "slug": "price-action-basics",
  "description": "Как читать движение цены без лишних индикаторов.",
  "thumbnail": "/uploads/blog/thumb.webp",
  "banner": "/uploads/blog/banner.webp",
  "tags": ["beginners", "price-action"],
  "is_published": true,
  "published_at": "2026-05-07T12:00:00.000Z",
  "created_at": "2026-05-06T09:00:00.000Z",
  "updated_at": "2026-05-07T12:00:00.000Z",
  "sections": [
    {
      "id": "intro",
      "title": "Введение",
      "content": "<p>...</p>",
      "order": 0
    }
  ],
  "translations": {
    "ru": {
      "title": "Основы price action",
      "description": "Как читать движение цены без лишних индикаторов.",
      "sections": [
        {
          "id": "intro",
          "title": "Введение",
          "content": "<p>...</p>",
          "order": 0
        }
      ]
    },
    "uk": {
      "title": "Основи price action",
      "description": "Як читати рух ціни без зайвих індикаторів.",
      "sections": []
    },
    "en": {
      "title": "Price action basics",
      "description": "How to read price movement without extra indicators.",
      "sections": []
    }
  }
}
```

### GET `/admin/blog/articles/:id`

Return the full article for editing.

Response requirements:

- include full `translations`
- keep top-level fallback fields

### POST `/admin/blog/articles`

Create a new article.

Expected request body:

```json
{
  "slug": "price-action-basics",
  "thumbnail": "/uploads/blog/thumb.webp",
  "banner": "/uploads/blog/banner.webp",
  "tags": ["beginners", "price-action"],
  "is_published": true,
  "title": "Основы price action",
  "description": "Как читать движение цены без лишних индикаторов.",
  "sections": [
    {
      "id": "intro",
      "title": "Введение",
      "content": "<p>...</p>",
      "order": 0
    }
  ],
  "translations": {
    "ru": {
      "title": "Основы price action",
      "description": "Как читать движение цены без лишних индикаторов.",
      "sections": [
        {
          "id": "intro",
          "title": "Введение",
          "content": "<p>...</p>",
          "order": 0
        }
      ]
    },
    "uk": {
      "title": "Основи price action",
      "description": "Як читати рух ціни без зайвих індикаторів.",
      "sections": [
        {
          "id": "intro",
          "title": "Вступ",
          "content": "<p>...</p>",
          "order": 0
        }
      ]
    },
    "en": {
      "title": "Price action basics",
      "description": "How to read price movement without extra indicators.",
      "sections": [
        {
          "id": "intro",
          "title": "Introduction",
          "content": "<p>...</p>",
          "order": 0
        }
      ]
    }
  }
}
```

Notes:

- `title`, `description`, `sections` are still sent for compatibility
- backend should treat them as resolved fallback content, normally based on `ru`
- preferred source of truth is `translations`

### PUT `/admin/blog/articles/:id`

Same contract as `POST`.

### DELETE `/admin/blog/articles/:id`

No multilingual changes required.

### POST `/admin/blog/images/upload`

No multilingual changes required.

## Public API

### GET `/blog/articles`

Request query:

- `page`
- `limit`
- `search`
- `tag`
- `locale`
- `lang`

Behavior:

- `locale` and `lang` should be treated as aliases
- resolve article fields according to locale fallback rules

Response item shape:

```json
{
  "_id": "682f1a...",
  "title": "Price action basics",
  "slug": "price-action-basics",
  "description": "How to read price movement without extra indicators.",
  "thumbnail": "/uploads/blog/thumb.webp",
  "tags": ["beginners", "price-action"],
  "published_at": "2026-05-07T12:00:00.000Z",
  "views": 120
}
```

Top-level `title` and `description` must already be localized.

### GET `/blog/articles/:slug`

Request query:

- `locale`
- `lang`

Response shape:

```json
{
  "success": true,
  "data": {
    "article": {
      "_id": "682f1a...",
      "title": "Price action basics",
      "slug": "price-action-basics",
      "description": "How to read price movement without extra indicators.",
      "thumbnail": "/uploads/blog/thumb.webp",
      "banner": "/uploads/blog/banner.webp",
      "sections": [
        {
          "id": "intro",
          "title": "Introduction",
          "content": "<p>...</p>",
          "order": 0
        }
      ],
      "tags": ["beginners", "price-action"],
      "is_published": true,
      "views": 120,
      "published_at": "2026-05-07T12:00:00.000Z",
      "created_at": "2026-05-06T09:00:00.000Z",
      "updated_at": "2026-05-07T12:00:00.000Z"
    },
    "toc": [
      { "id": "intro", "title": "Introduction" }
    ],
    "prev_article": null,
    "next_article": null
  }
}
```

Top-level `article.title`, `article.description`, `article.sections`, and `toc` must already be localized.

### GET `/blog/tags`

No required multilingual changes unless tag labels become translated.

For now tags can remain language-neutral slugs.

## Validation Rules

Recommended backend validation:

- `slug` unique
- `translations` object optional but recommended
- if translation exists for a locale:
  - `title` required when that translation has meaningful content
  - `sections[].title` required for non-empty sections
  - `sections[].content` may contain sanitized HTML
- `sections[].order` should be normalized on save

## Migration Plan

### Phase 1

Add `translations` to schema without breaking old fields.

- existing articles without `translations` remain valid
- on read, synthesize `translations.ru` from legacy fields if needed

### Phase 2

Update admin create and update handlers.

- accept `translations`
- keep writing top-level compatibility fields
- use `ru` translation as main fallback when available

### Phase 3

Update public read handlers.

- resolve locale using query params
- return already localized top-level content

### Phase 4

Optional cleanup.

- once all consumers are migrated, top-level content can become derived-only
- storage can keep them as denormalized cache or remove them later

## Pseudocode

```ts
function resolveLocale(query: { locale?: string; lang?: string }): 'ru' | 'uk' | 'en' {
  const raw = (query.locale || query.lang || '').toLowerCase();
  if (raw === 'ru' || raw === 'uk' || raw === 'en') return raw;
  return 'ru';
}

function resolveTranslation(article: ArticleEntity, locale: 'ru' | 'uk' | 'en') {
  return article.translations?.[locale]
    || article.translations?.ru
    || article.translations?.uk
    || article.translations?.en
    || {
      title: article.title || '',
      description: article.description || '',
      sections: article.sections || [],
    };
}

function toPublicArticleDto(article: ArticleEntity, locale: 'ru' | 'uk' | 'en') {
  const translated = resolveTranslation(article, locale);
  return {
    _id: article._id,
    title: translated.title,
    slug: article.slug,
    description: translated.description,
    thumbnail: article.thumbnail,
    banner: article.banner,
    sections: translated.sections,
    tags: article.tags,
    is_published: article.is_published,
    views: article.views,
    published_at: article.published_at,
    created_at: article.created_at,
    updated_at: article.updated_at,
  };
}
```

## Frontend Already Expects

Implemented in this repository:

- admin editor posts `translations`
- admin editor reads `translations`
- public blog calls:
  - `/blog/articles?locale=ru&lang=ru`
  - `/blog/articles/:slug?locale=en&lang=en`

Relevant files:

- [src/api/adminBlog.ts](../src/api/adminBlog.ts)
- [src/components/AdminBlogArticles.tsx](../src/components/AdminBlogArticles.tsx)
- [src/pages/shared/api/blog.ts](../src/pages/shared/api/blog.ts)

## Implementation Checklist

- extend article DB schema with `translations`
- update admin list endpoint to return `translations`
- update admin detail endpoint to return `translations`
- update admin create endpoint to accept `translations`
- update admin update endpoint to accept `translations`
- add locale resolution in public list endpoint
- add locale resolution in public article endpoint
- generate localized `toc` from resolved sections
- keep top-level fallback fields during transition
- migrate old articles into `translations.ru`
