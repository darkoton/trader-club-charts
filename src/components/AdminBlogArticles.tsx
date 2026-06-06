import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import DOMPurify from 'dompurify';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  ADMIN_BLOG_IMAGE_ACCEPT,
  ADMIN_BLOG_IMAGE_ALLOWED_EXTENSIONS,
  ADMIN_BLOG_IMAGE_ALLOWED_TYPES,
  ADMIN_BLOG_IMAGE_MAX_SIZE,
  BLOG_TRANSLATION_LOCALES,
  createAdminBlogArticle,
  deleteAdminBlogArticle,
  getAdminBlogArticle,
  listAdminBlogArticles,
  uploadAdminBlogImage,
  updateAdminBlogArticle,
  type AdminBlogArticle,
  type AdminBlogArticlePayload,
  type AdminBlogImageKind,
  type BlogArticleStatus,
  type BlogSection,
} from '../api/adminBlog';
import { LOCALE_LABELS, useI18n, type Locale } from '../i18n';
import { resolveTmaMediaUrl } from '../tma/api';

interface AdminBlogArticlesProps {
  isActive: boolean;
  t: Record<string, string>;
}

interface BlogSectionForm {
  clientKey: string;
  id?: string;
  title: string;
  content: string;
  order: number;
}

interface BlogArticleForm {
  slug: string;
  thumbnail: string;
  banner: string;
  tagsText: string;
  is_published: boolean;
  translations: Record<Locale, BlogArticleTranslationForm>;
}

interface BlogArticleTranslationForm {
  title: string;
  description: string;
  sections: BlogSectionForm[];
}

type BlogImageField = 'thumbnail' | 'banner';
const LEGACY_BLOG_LOCALE: Locale = 'ru';

const ADMIN_BLOG_UI_COPY: Record<Locale, {
  translations: string;
  translationHint: string;
  sharedFields: string;
  contentForLocale: string;
  translationFallback: string;
}> = {
  ru: {
    translations: 'Переводы статьи',
    translationHint: 'Каждая локаль сохраняется отдельно и может отдаваться бэкендом уже в переведённом виде.',
    sharedFields: 'Общие поля статьи',
    contentForLocale: 'Контент для локали',
    translationFallback: 'Если перевод пустой, API сможет использовать fallback.',
  },
  uk: {
    translations: 'Переклади статті',
    translationHint: 'Кожна локаль зберігається окремо й може віддаватися бекендом уже перекладеною.',
    sharedFields: 'Спільні поля статті',
    contentForLocale: 'Контент для локалі',
    translationFallback: 'Якщо переклад порожній, API зможе використати fallback.',
  },
  en: {
    translations: 'Article translations',
    translationHint: 'Each locale is stored separately so the backend can return already localized content.',
    sharedFields: 'Shared article fields',
    contentForLocale: 'Content for locale',
    translationFallback: 'If a translation is empty, the API can use fallback content.',
  },
};

const SAFE_HTML_TAGS = ['h3', 'h4', 'p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'img', 'br', 'span'];
const SAFE_HTML_ATTRS = ['href', 'target', 'rel', 'src', 'alt', 'class'];

function sanitizeArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: SAFE_HTML_TAGS,
    ALLOWED_ATTR: SAFE_HTML_ATTRS,
  });
}

function resolveBlogImageUrl(value: string): string {
  return resolveTmaMediaUrl(value);
}

function prepareArticlePreviewHtml(html: string): string {
  const safeHtml = sanitizeArticleHtml(html);
  if (typeof document === 'undefined') return safeHtml;

  const template = document.createElement('template');
  template.innerHTML = safeHtml;
  template.content.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src');
    if (!src) return;
    image.setAttribute('src', resolveBlogImageUrl(src));
  });

  return template.innerHTML;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createSectionClientKey(): string {
  return `section_${Math.random().toString(36).slice(2, 10)}`;
}

function hasAllowedBlogImageExtension(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ADMIN_BLOG_IMAGE_ALLOWED_EXTENSIONS.includes(extension);
}

function validateBlogImage(file: File, t: Record<string, string>): string | null {
  if (file.size > ADMIN_BLOG_IMAGE_MAX_SIZE) return t.adminBlogImageTooLarge;
  if (file.type && ADMIN_BLOG_IMAGE_ALLOWED_TYPES.includes(file.type)) return null;
  if (hasAllowedBlogImageExtension(file)) return null;
  return t.adminBlogImageInvalidFormat;
}

function normalizeNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeSections(sections: BlogSectionForm[]): BlogSectionForm[] {
  return sections.map((section, index) => ({
    ...section,
    order: index,
  }));
}

function buildSectionForm(section: BlogSection, index: number): BlogSectionForm {
  return {
    clientKey: section.id || createSectionClientKey(),
    id: section.id,
    title: section.title ?? '',
    content: section.content ?? '',
    order: section.order ?? index,
  };
}

function createEmptySection(index = 0): BlogSectionForm {
  return {
    clientKey: createSectionClientKey(),
    title: '',
    content: '<p></p>',
    order: index,
  };
}

function buildTranslationForm(
  source?: {
    title?: string | null;
    description?: string | null;
    sections?: BlogSection[];
  } | null,
): BlogArticleTranslationForm {
  const sections = (source?.sections ?? []).length > 0
    ? source?.sections?.map((section, index) => buildSectionForm(section, index)) ?? []
    : [createEmptySection(0)];

  return {
    title: source?.title ?? '',
    description: source?.description ?? '',
    sections: normalizeSections(sections),
  };
}

function isMeaningfulSection(section: BlogSectionForm): boolean {
  return Boolean(section.title.trim() || stripHtml(section.content));
}

function isMeaningfulTranslation(translation: BlogArticleTranslationForm): boolean {
  return Boolean(
    translation.title.trim()
      || translation.description.trim()
      || translation.sections.some((section) => isMeaningfulSection(section)),
  );
}

function buildArticleForm(article?: AdminBlogArticle | null): BlogArticleForm {
  const translations = BLOG_TRANSLATION_LOCALES.reduce<Record<Locale, BlogArticleTranslationForm>>((acc, locale) => {
    const translation = article?.translations[locale];
    const legacy = locale === LEGACY_BLOG_LOCALE
      ? {
        title: article?.title,
        description: article?.description,
        sections: article?.sections,
      }
      : null;

    acc[locale] = buildTranslationForm(translation ?? legacy);
    return acc;
  }, {} as Record<Locale, BlogArticleTranslationForm>);

  return {
    slug: article?.slug ?? '',
    thumbnail: article?.thumbnail ?? '',
    banner: article?.banner ?? '',
    tagsText: article?.tags.join(', ') ?? '',
    is_published: article?.is_published ?? false,
    translations,
  };
}

function normalizeTranslationPayloadSections(sections: BlogSectionForm[]): BlogSection[] {
  return normalizeSections(sections)
    .filter((section) => isMeaningfulSection(section))
    .map((section) => {
      const payload: BlogSection = {
        title: section.title.trim(),
        content: section.content,
        order: section.order,
      };
      if (section.id) payload.id = section.id;
      return payload;
    });
}

function buildArticlePayload(form: BlogArticleForm): AdminBlogArticlePayload {
  const tags = form.tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, items) => items.indexOf(tag) === index);

  const translations = BLOG_TRANSLATION_LOCALES.reduce<NonNullable<AdminBlogArticlePayload['translations']>>((acc, locale) => {
    const translation = form.translations[locale];
    const sections = normalizeTranslationPayloadSections(translation.sections);
    if (!isMeaningfulTranslation(translation) && sections.length === 0) return acc;

    acc[locale] = {
      title: translation.title.trim(),
      description: translation.description.trim(),
      sections,
    };
    return acc;
  }, {});

  const primaryTranslation = translations.ru ?? translations.uk ?? translations.en;

  return {
    title: primaryTranslation?.title ?? '',
    ...(normalizeNullableString(form.slug) ? { slug: form.slug.trim() } : {}),
    description: primaryTranslation?.description ?? '',
    thumbnail: normalizeNullableString(form.thumbnail),
    banner: normalizeNullableString(form.banner),
    tags,
    is_published: form.is_published,
    sections: primaryTranslation?.sections ?? [],
    translations,
  };
}

function getArticleTranslationForLocale(
  article: AdminBlogArticle,
  locale: Locale,
): BlogArticleTranslationForm {
  const translation = article.translations[locale]
    ?? article.translations.ru
    ?? article.translations.uk
    ?? article.translations.en;

  return buildTranslationForm(translation ?? {
    title: article.title,
    description: article.description,
    sections: article.sections,
  });
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleString('ru-RU');
}

function EditorToolbarButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`admin-blog__toolbar-btn${active ? ' admin-blog__toolbar-btn--active' : ''}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SectionHtmlEditor({
  content,
  onChange,
  onUploadImage,
  t,
}: {
  content: string;
  onChange: (next: string) => void;
  onUploadImage: (file: File) => Promise<string>;
  t: Record<string, string>;
}) {
  const lastValueRef = useRef(content);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
    ],
    content: content || '<p></p>',
    editorProps: {
      attributes: {
        class: 'admin-blog__editor-surface',
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const html = nextEditor.getHTML();
      lastValueRef.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const normalized = content || '<p></p>';
    if (normalized === lastValueRef.current || normalized === editor.getHTML()) return;
    lastValueRef.current = normalized;
    editor.commands.setContent(normalized);
  }, [content, editor]);

  const handleLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = typeof editor.getAttributes('link').href === 'string' ? editor.getAttributes('link').href as string : '';
    const href = window.prompt(t.adminBlogPromptLink, previousUrl || 'https://');
    if (href === null) return;
    const trimmed = href.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  }, [editor, t.adminBlogPromptLink]);

  const handleImage = useCallback(() => {
    if (!editor) return;
    const src = window.prompt(t.adminBlogPromptImage, 'https://');
    if (!src) return;
    editor.chain().focus().setImage({ src: src.trim() }).run();
  }, [editor, t.adminBlogPromptImage]);

  const handleUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;

    setUploading(true);
    try {
      const src = await onUploadImage(file);
      if (!src) return;
      editor.chain().focus().setImage({ src }).run();
    } catch {
      return;
    } finally {
      setUploading(false);
    }
  }, [editor, onUploadImage]);

  return (
    <div className="admin-blog__editor-shell">
      <div className="admin-blog__toolbar">
        <EditorToolbarButton label={t.adminBlogToolbarParagraph} active={editor?.isActive('paragraph')} onClick={() => editor?.chain().focus().setParagraph().run()} />
        <EditorToolbarButton label={t.adminBlogToolbarH3} active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
        <EditorToolbarButton label={t.adminBlogToolbarH4} active={editor?.isActive('heading', { level: 4 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()} />
        <EditorToolbarButton label={t.adminBlogToolbarBold} active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} />
        <EditorToolbarButton label={t.adminBlogToolbarItalic} active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <EditorToolbarButton label={t.adminBlogToolbarBulletList} active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
        <EditorToolbarButton label={t.adminBlogToolbarOrderedList} active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
        <EditorToolbarButton label={t.adminBlogToolbarQuote} active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
        <EditorToolbarButton label={t.adminBlogToolbarLink} active={editor?.isActive('link')} onClick={handleLink} />
        <EditorToolbarButton label={t.adminBlogToolbarImage} onClick={handleImage} />
        <EditorToolbarButton label={uploading ? '…' : t.adminBlogToolbarUploadImage} onClick={() => fileInputRef.current?.click()} />
        <EditorToolbarButton label={t.adminBlogToolbarClear} onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} />
      </div>
      <input ref={fileInputRef} type="file" accept={ADMIN_BLOG_IMAGE_ACCEPT} hidden onChange={handleUpload} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function AdminBlogArticles({ isActive, t }: AdminBlogArticlesProps) {
  const { locale } = useI18n();
  const uiCopy = ADMIN_BLOG_UI_COPY[locale];
  const [articles, setArticles] = useState<AdminBlogArticle[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [form, setForm] = useState<BlogArticleForm | null>(null);
  const [editingLocale, setEditingLocale] = useState<Locale>(locale);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<BlogArticleStatus | ''>('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<BlogImageField | null>(null);
  const dragSectionKeyRef = useRef<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setEditingLocale((prev) => (BLOG_TRANSLATION_LOCALES.includes(prev) ? prev : locale));
  }, [locale]);

  const loadArticles = useCallback(async () => {
    if (!isActive) return;
    setLoadingList(true);
    try {
      const result = await listAdminBlogArticles({ page, limit, status });
      setArticles(result.articles);
      setTotal(result.total);
      setTotalPages(Math.max(1, result.total_pages));
      setError(null);
      setSelectedArticleId((prev) => {
        if (isCreating) return prev;
        if (prev && result.articles.some((article) => article._id === prev)) return prev;
        return result.articles[0]?._id ?? null;
      });
    } catch (err) {
      setArticles([]);
      setError(formatError(err));
    } finally {
      setLoadingList(false);
    }
  }, [isActive, isCreating, limit, page, status]);

  const loadArticle = useCallback(async (articleId: string) => {
    if (!isActive) return;
    setLoadingArticle(true);
    try {
      const article = await getAdminBlogArticle(articleId);
      setForm(buildArticleForm(article));
      setError(null);
    } catch (err) {
      setForm(null);
      setError(formatError(err));
    } finally {
      setLoadingArticle(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    void loadArticles();
  }, [isActive, loadArticles]);

  useEffect(() => {
    if (!isActive) return;
    if (isCreating || !selectedArticleId) {
      if (isCreating) setForm((prev) => prev ?? buildArticleForm(null));
      return;
    }
    void loadArticle(selectedArticleId);
  }, [isActive, isCreating, loadArticle, selectedArticleId]);

  const selectedArticle = useMemo(
    () => articles.find((article) => article._id === selectedArticleId) ?? null,
    [articles, selectedArticleId],
  );

  const handleCreate = useCallback(() => {
    setIsCreating(true);
    setSelectedArticleId(null);
    setForm(buildArticleForm(null));
    setError(null);
    setSuccess(null);
  }, []);

  const handleSelectArticle = useCallback((articleId: string) => {
    setIsCreating(false);
    setSelectedArticleId(articleId);
    setSuccess(null);
  }, []);

  const updateForm = useCallback(<K extends keyof Omit<BlogArticleForm, 'translations'>,>(field: K, value: BlogArticleForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const uploadImage = useCallback(async (file: File, kind: AdminBlogImageKind): Promise<string> => {
    const validationError = validateBlogImage(file, t);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      throw new Error(validationError);
    }

    setError(null);
    setSuccess(null);

    const uploaded = await uploadAdminBlogImage(file, kind);
    const resolvedUrl = uploaded.url
      ? resolveBlogImageUrl(uploaded.url)
      : uploaded.path
        ? resolveBlogImageUrl(uploaded.path)
        : '';

    if (!resolvedUrl) {
      const uploadError = t.adminBlogImageUploadNoUrl;
      setError(uploadError);
      throw new Error(uploadError);
    }

    setSuccess(t.adminBlogImageUploaded);
    return resolvedUrl;
  }, [t]);

  const handleMetaImageUpload = useCallback(async (field: BlogImageField, file: File) => {
    setUploadingField(field);
    try {
      const nextUrl = await uploadImage(file, field);
      updateForm(field, nextUrl);
    } catch {
      return;
    } finally {
      setUploadingField(null);
    }
  }, [updateForm, uploadImage]);

  const updateTranslationField = useCallback((targetLocale: Locale, patch: Partial<Omit<BlogArticleTranslationForm, 'sections'>>) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [targetLocale]: {
            ...prev.translations[targetLocale],
            ...patch,
          },
        },
      };
    });
  }, []);

  const updateSection = useCallback((targetLocale: Locale, clientKey: string, patch: Partial<BlogSectionForm>) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [targetLocale]: {
            ...prev.translations[targetLocale],
            sections: prev.translations[targetLocale].sections.map((section) => section.clientKey === clientKey ? { ...section, ...patch } : section),
          },
        },
      };
    });
  }, []);

  const addSection = useCallback((targetLocale: Locale) => {
    setForm((prev) => {
      if (!prev) return prev;
      const currentSections = prev.translations[targetLocale].sections;
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [targetLocale]: {
            ...prev.translations[targetLocale],
            sections: normalizeSections([
              ...currentSections,
              createEmptySection(currentSections.length),
            ]),
          },
        },
      };
    });
  }, []);

  const removeSection = useCallback((targetLocale: Locale, clientKey: string) => {
    setForm((prev) => {
      if (!prev || prev.translations[targetLocale].sections.length === 1) return prev;
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [targetLocale]: {
            ...prev.translations[targetLocale],
            sections: normalizeSections(prev.translations[targetLocale].sections.filter((section) => section.clientKey !== clientKey)),
          },
        },
      };
    });
  }, []);

  const moveSection = useCallback((targetLocale: Locale, clientKey: string, direction: -1 | 1) => {
    setForm((prev) => {
      if (!prev) return prev;
      const currentSections = prev.translations[targetLocale].sections;
      const index = currentSections.findIndex((section) => section.clientKey === clientKey);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= currentSections.length) return prev;
      const nextSections = [...currentSections];
      const [section] = nextSections.splice(index, 1);
      nextSections.splice(targetIndex, 0, section);
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [targetLocale]: {
            ...prev.translations[targetLocale],
            sections: normalizeSections(nextSections),
          },
        },
      };
    });
  }, []);

  const reorderSections = useCallback((targetLocale: Locale, sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    setForm((prev) => {
      if (!prev) return prev;
      const currentSections = prev.translations[targetLocale].sections;
      const sourceIndex = currentSections.findIndex((section) => section.clientKey === sourceKey);
      const targetIndex = currentSections.findIndex((section) => section.clientKey === targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const nextSections = [...currentSections];
      const [section] = nextSections.splice(sourceIndex, 1);
      nextSections.splice(targetIndex, 0, section);
      return {
        ...prev,
        translations: {
          ...prev.translations,
          [targetLocale]: {
            ...prev.translations[targetLocale],
            sections: normalizeSections(nextSections),
          },
        },
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!form) return;

    const meaningfulTranslations = BLOG_TRANSLATION_LOCALES.filter((item) => isMeaningfulTranslation(form.translations[item]));
    if (meaningfulTranslations.length === 0) {
      setError(t.adminBlogNeedTitle);
      setSuccess(null);
      return;
    }

    for (const item of meaningfulTranslations) {
      const nonEmptySections = form.translations[item].sections.filter((section) => isMeaningfulSection(section));
      if (!form.translations[item].title.trim()) {
        setError(`${LOCALE_LABELS[item]}: ${t.adminBlogNeedTitle}`);
        setSuccess(null);
        return;
      }
      if (nonEmptySections.some((section) => !section.title.trim())) {
        setError(`${LOCALE_LABELS[item]}: ${t.adminBlogNeedSectionTitle}`);
        setSuccess(null);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = buildArticlePayload(form);
      const article = isCreating || !selectedArticleId
        ? await createAdminBlogArticle(payload)
        : await updateAdminBlogArticle(selectedArticleId, payload);
      setIsCreating(false);
      setSelectedArticleId(article._id);
      setForm(buildArticleForm(article));
      setSuccess(isCreating ? t.adminBlogArticleCreated : t.adminBlogArticleSaved);
      await loadArticles();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  }, [form, isCreating, loadArticles, selectedArticleId, t.adminBlogArticleCreated, t.adminBlogArticleSaved, t.adminBlogNeedSectionTitle, t.adminBlogNeedTitle]);

  const handleDelete = useCallback(async () => {
    if (isCreating || !selectedArticleId) return;
    if (!window.confirm(t.adminBlogConfirmDeleteArticle)) return;
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminBlogArticle(selectedArticleId);
      setSelectedArticleId(null);
      setForm(null);
      setSuccess(t.adminBlogArticleDeleted);
      await loadArticles();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setDeleting(false);
    }
  }, [isCreating, loadArticles, selectedArticleId, t.adminBlogArticleDeleted, t.adminBlogConfirmDeleteArticle]);

  const thumbnailPreviewUrl = form?.thumbnail ? resolveBlogImageUrl(form.thumbnail) : '';
  const bannerPreviewUrl = form?.banner ? resolveBlogImageUrl(form.banner) : '';
  const activeTranslation = form ? form.translations[editingLocale] : null;

  return (
    <div className="admin-blog">
      {error && <div className="admin-blog__message admin-blog__message--error">{error}</div>}
      {success && <div className="admin-blog__message admin-blog__message--success">{success}</div>}

      <div className="admin-blog__toolbar-row">
        <div className="admin-blog__filters">
          <select className="admin-blog__select" value={status} onChange={(event) => { setStatus(event.target.value as BlogArticleStatus | ''); setPage(1); }}>
            <option value="">{t.adminBlogFilterAll}</option>
            <option value="published">{t.adminBlogFilterPublished}</option>
            <option value="draft">{t.adminBlogFilterDraft}</option>
          </select>
          <select className="admin-blog__select" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="admin-blog__actions">
          <button className="admin-blog__action-btn" type="button" onClick={() => void loadArticles()} disabled={loadingList}>
            {loadingList ? '…' : t.adminBlogReload}
          </button>
          <button className="admin-blog__action-btn admin-blog__action-btn--primary" type="button" onClick={handleCreate}>
            {t.adminBlogCreate}
          </button>
        </div>
      </div>

      <div className="admin-blog__toolbar-row admin-blog__toolbar-row--meta">
        <span className="admin-blog__meta-text">{t.adminBlogTotal}: {total}</span>
        <div className="admin-blog__pagination">
          <button className="admin-blog__action-btn" type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
            ←
          </button>
          <span className="admin-blog__meta-text">{t.adminBlogPage}: {page} / {totalPages}</span>
          <button className="admin-blog__action-btn" type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>
            →
          </button>
        </div>
      </div>

      <div className="admin-blog__layout">
        <div className="admin-blog__list">
          {loadingList ? (
            <div className="admin-page__loading"><div className="loading__spinner" /></div>
          ) : articles.length === 0 ? (
            <div className="admin-page__empty">{t.adminBlogNoArticles}</div>
          ) : (
            articles.map((article) => (
              <button
                key={article._id}
                className={`admin-blog__card${selectedArticleId === article._id && !isCreating ? ' admin-blog__card--selected' : ''}`}
                type="button"
                onClick={() => handleSelectArticle(article._id)}
              >
                {(() => {
                  const articleTranslation = getArticleTranslationForLocale(article, locale);
                  return (
                    <>
                <div className="admin-blog__card-top">
                  <span className="admin-blog__card-title">{articleTranslation.title || t.adminBlogUntitled}</span>
                  <span className={`admin-blog__badge${article.is_published ? ' admin-blog__badge--published' : ' admin-blog__badge--draft'}`}>
                    {article.is_published ? t.adminBlogFilterPublished : t.adminBlogFilterDraft}
                  </span>
                </div>
                <div className="admin-blog__card-slug">/{article.slug || '—'}</div>
                <div className="admin-blog__card-desc">{articleTranslation.description || '—'}</div>
                <div className="admin-blog__card-meta">
                  <span>{articleTranslation.sections.filter((section) => isMeaningfulSection(section)).length} {t.adminBlogSectionsCount}</span>
                  <span>{formatDate(article.published_at || article.updated_at || article.created_at)}</span>
                </div>
                    </>
                  );
                })()}
              </button>
            ))
          )}
        </div>

        <div className="admin-blog__editor-panel">
          {!form ? (
            <div className="admin-page__empty">{loadingArticle ? t.loading : t.adminBlogSelect}</div>
          ) : activeTranslation ? (
            <div className="admin-blog__form">
              <div className="admin-blog__translation-header">
                <div>
                  <h3 className="admin-blog__section-heading">{uiCopy.sharedFields}</h3>
                  <p className="admin-blog__section-subtitle">{uiCopy.translationHint}</p>
                </div>
              </div>

              <div className="admin-blog__form-grid">
                <label className="admin-blog__field">
                  <span>{t.adminBlogSlug}</span>
                  <input className="admin-blog__input" type="text" value={form.slug} onChange={(event) => updateForm('slug', event.target.value)} placeholder={t.adminBlogSlugHint} />
                </label>
                <label className="admin-blog__field admin-blog__field--checkbox">
                  <span>{form.is_published ? t.adminBlogFilterPublished : t.adminBlogFilterDraft}</span>
                  <input type="checkbox" checked={form.is_published} onChange={(event) => updateForm('is_published', event.target.checked)} />
                </label>
                <div className="admin-blog__field admin-blog__media-field">
                  <span>{t.adminBlogThumbnail}</span>
                  <div className="admin-blog__media-row">
                    <input className="admin-blog__input" type="text" value={form.thumbnail} onChange={(event) => updateForm('thumbnail', event.target.value)} placeholder="https://cdn.example.com/blog/thumb.jpg" />
                    <div className="admin-blog__media-actions">
                      <button className="admin-blog__action-btn" type="button" onClick={() => thumbnailInputRef.current?.click()} disabled={uploadingField !== null}>
                        {uploadingField === 'thumbnail' ? '…' : t.adminBlogUploadImage}
                      </button>
                      <button className="admin-blog__action-btn" type="button" onClick={() => updateForm('thumbnail', '')} disabled={!form.thumbnail || uploadingField !== null}>
                        {t.remove}
                      </button>
                    </div>
                  </div>
                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept={ADMIN_BLOG_IMAGE_ACCEPT}
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      void handleMetaImageUpload('thumbnail', file);
                    }}
                  />
                  {thumbnailPreviewUrl && (
                    <div className="admin-blog__media-preview">
                      <img src={thumbnailPreviewUrl} alt="" />
                    </div>
                  )}
                </div>
                <div className="admin-blog__field admin-blog__media-field">
                  <span>{t.adminBlogBanner}</span>
                  <div className="admin-blog__media-row">
                    <input className="admin-blog__input" type="text" value={form.banner} onChange={(event) => updateForm('banner', event.target.value)} placeholder="https://cdn.example.com/blog/banner.jpg" />
                    <div className="admin-blog__media-actions">
                      <button className="admin-blog__action-btn" type="button" onClick={() => bannerInputRef.current?.click()} disabled={uploadingField !== null}>
                        {uploadingField === 'banner' ? '…' : t.adminBlogUploadImage}
                      </button>
                      <button className="admin-blog__action-btn" type="button" onClick={() => updateForm('banner', '')} disabled={!form.banner || uploadingField !== null}>
                        {t.remove}
                      </button>
                    </div>
                  </div>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept={ADMIN_BLOG_IMAGE_ACCEPT}
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      void handleMetaImageUpload('banner', file);
                    }}
                  />
                  {bannerPreviewUrl && (
                    <div className="admin-blog__media-preview admin-blog__media-preview--wide">
                      <img src={bannerPreviewUrl} alt="" />
                    </div>
                  )}
                </div>
                <label className="admin-blog__field admin-blog__field--wide">
                  <span>{t.adminBlogTags}</span>
                  <input className="admin-blog__input" type="text" value={form.tagsText} onChange={(event) => updateForm('tagsText', event.target.value)} placeholder={t.adminBlogTagsHint} />
                </label>
              </div>

              <div className="admin-blog__translation-header">
                <div>
                  <h3 className="admin-blog__section-heading">{uiCopy.translations}</h3>
                  <p className="admin-blog__section-subtitle">{uiCopy.translationFallback}</p>
                </div>
                <div className="admin-blog__locale-tabs" role="tablist" aria-label={uiCopy.translations}>
                  {BLOG_TRANSLATION_LOCALES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="tab"
                      aria-selected={editingLocale === item}
                      className={`admin-blog__locale-tab${editingLocale === item ? ' admin-blog__locale-tab--active' : ''}`}
                      onClick={() => setEditingLocale(item)}
                    >
                      <span>{item.toUpperCase()}</span>
                      <small>{LOCALE_LABELS[item]}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-blog__form-grid">
                <label className="admin-blog__field admin-blog__field--wide">
                  <span>{t.adminBlogTitle} · {LOCALE_LABELS[editingLocale]}</span>
                  <input
                    className="admin-blog__input"
                    type="text"
                    value={activeTranslation.title}
                    onChange={(event) => updateTranslationField(editingLocale, { title: event.target.value })}
                  />
                </label>
                <label className="admin-blog__field admin-blog__field--wide">
                  <span>{t.adminBlogDescription} · {LOCALE_LABELS[editingLocale]}</span>
                  <textarea
                    className="admin-blog__textarea admin-blog__textarea--sm"
                    value={activeTranslation.description}
                    onChange={(event) => updateTranslationField(editingLocale, { description: event.target.value })}
                  />
                </label>
              </div>

              <div className="admin-blog__meta-grid">
                <div className="admin-blog__meta-card"><span>{t.adminBlogPublishedAt}</span><strong>{formatDate(selectedArticle?.published_at ?? null)}</strong></div>
                <div className="admin-blog__meta-card"><span>{t.adminBlogCreatedAt}</span><strong>{formatDate(selectedArticle?.created_at ?? null)}</strong></div>
                <div className="admin-blog__meta-card"><span>{t.adminBlogUpdatedAt}</span><strong>{formatDate(selectedArticle?.updated_at ?? null)}</strong></div>
              </div>

              <div className="admin-blog__sections-header">
                <div>
                  <h3 className="admin-blog__section-heading">{t.adminBlogSections} · {LOCALE_LABELS[editingLocale]}</h3>
                  <p className="admin-blog__section-subtitle">{t.adminBlogDragHint}</p>
                </div>
                <button className="admin-blog__action-btn admin-blog__action-btn--primary" type="button" onClick={() => addSection(editingLocale)}>
                  {t.adminBlogAddSection}
                </button>
              </div>

              <div className="admin-blog__sections">
                {activeTranslation.sections.map((section, index) => {
                  const safePreview = prepareArticlePreviewHtml(section.content);
                  return (
                    <div
                      key={section.clientKey}
                      className="admin-blog__section-card"
                      draggable
                      onDragStart={() => { dragSectionKeyRef.current = section.clientKey; }}
                      onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); }}
                      onDrop={() => {
                        if (dragSectionKeyRef.current) {
                          reorderSections(editingLocale, dragSectionKeyRef.current, section.clientKey);
                          dragSectionKeyRef.current = null;
                        }
                      }}
                      onDragEnd={() => { dragSectionKeyRef.current = null; }}
                    >
                      <div className="admin-blog__section-top">
                        <span className="admin-blog__section-order">#{index + 1}</span>
                        <div className="admin-blog__section-actions">
                          <button className="admin-blog__icon-btn" type="button" onClick={() => moveSection(editingLocale, section.clientKey, -1)} disabled={index === 0} title={t.adminBlogSectionMoveUp}>↑</button>
                          <button className="admin-blog__icon-btn" type="button" onClick={() => moveSection(editingLocale, section.clientKey, 1)} disabled={index === activeTranslation.sections.length - 1} title={t.adminBlogSectionMoveDown}>↓</button>
                          <button className="admin-blog__icon-btn admin-blog__icon-btn--danger" type="button" onClick={() => removeSection(editingLocale, section.clientKey)} disabled={activeTranslation.sections.length === 1} title={t.adminBlogSectionDelete}>✕</button>
                        </div>
                      </div>
                      <label className="admin-blog__field">
                        <span>{t.adminBlogSectionTitle}</span>
                        <input className="admin-blog__input" type="text" value={section.title} onChange={(event) => updateSection(editingLocale, section.clientKey, { title: event.target.value })} />
                      </label>
                      <div className="admin-blog__field">
                        <span>{t.adminBlogSectionContent}</span>
                        <SectionHtmlEditor
                          content={section.content}
                          onChange={(next) => updateSection(editingLocale, section.clientKey, { content: next })}
                          onUploadImage={(file) => uploadImage(file, 'content')}
                          t={t}
                        />
                      </div>
                      <div className="admin-blog__preview-block">
                        <span>{t.adminBlogPreview}</span>
                        <div className="admin-blog__preview-html" dangerouslySetInnerHTML={{ __html: safePreview }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="admin-blog__form-actions">
                {!isCreating && selectedArticleId && (
                  <button className="admin-blog__action-btn admin-blog__action-btn--danger" type="button" onClick={handleDelete} disabled={deleting || saving}>
                    {deleting ? '…' : t.adminBlogDeleteArticle}
                  </button>
                )}
                <button className="admin-blog__action-btn admin-blog__action-btn--primary" type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? '…' : t.adminBlogSaveArticle}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}