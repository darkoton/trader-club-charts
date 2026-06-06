import { useCallback, useEffect, useMemo, useState } from 'react';
import AddLinkIcon from '@mui/icons-material/AddLink';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { MenuProps as MuiMenuProps } from '@mui/material/Menu';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  createAffiliateLink,
  deleteAffiliateLink,
  getAffiliateAnalyticsEvents,
  getAffiliateAnalyticsLinks,
  getAffiliateAnalyticsSummary,
  getAffiliateAnalyticsTimeline,
  getAffiliateLinks,
  getAffiliateMe,
  updateAffiliateLink,
  type AffiliateAnalyticsSummary,
  type AffiliateEventItem,
  type AffiliateLink,
  type AffiliateLinkAnalyticsItem,
  type AffiliateMeResponse,
  type AffiliatePeriod,
  type AffiliateTimelinePoint,
  type AffiliateTimelineBucket,
} from '../api/affiliate';
import { getMyProfile, persistUserAccess, type UserProfile } from '../api/user';
import { useI18n } from '../i18n';
import routes, { buildPath } from '../configs/routes';

type AffiliateTab = 'overview' | 'links' | 'events';

const AFFILIATE_TAB_SECTION_MAP: Record<AffiliateTab, string> = {
  overview: 'overview',
  links: 'links',
  events: 'events',
};

const AFFILIATE_SECTION_TAB_MAP = Object.fromEntries(
  Object.entries(AFFILIATE_TAB_SECTION_MAP).map(([tab, section]) => [section, tab as AffiliateTab]),
) as Record<string, AffiliateTab>;

const AFFILIATE_NAV_ITEMS: { id: AffiliateTab; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'links', label: 'Ссылки' },
  { id: 'events', label: 'События' },
];

const AFFILIATE_THEME = {
  pageBg: 'radial-gradient(circle at top right, rgba(46, 189, 133, 0.12), transparent 24%), linear-gradient(180deg, var(--bg-primary, #0f1116) 0%, #0c1016 100%)',
  cardBg: 'var(--bg-card, #14161a)',
  cardRaisedBg: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))',
  tableBg: 'rgba(10, 14, 20, 0.92)',
  tableHeadBg: 'rgba(255,255,255,0.04)',
  line: 'var(--border-default, rgba(255,255,255,0.08))',
  lineStrong: 'rgba(255,255,255,0.14)',
  hover: 'rgba(255,255,255,0.04)',
  text: 'var(--text-primary, #f4f7fb)',
  textMuted: 'var(--text-secondary, rgba(244,247,251,0.72))',
  textSoft: 'rgba(244,247,251,0.56)',
  accent: 'var(--accent, #2ebd85)',
  shadow: '0 18px 44px rgba(0, 0, 0, 0.28)',
} as const;

const cardSx = {
  bgcolor: AFFILIATE_THEME.cardBg,
  backgroundImage: AFFILIATE_THEME.cardRaisedBg,
  color: AFFILIATE_THEME.text,
  border: `1px solid ${AFFILIATE_THEME.line}`,
  borderRadius: 3,
  boxShadow: AFFILIATE_THEME.shadow,
  backdropFilter: 'blur(14px)',
} as const;

const tableContainerSx = {
  bgcolor: AFFILIATE_THEME.tableBg,
  borderRadius: 2.5,
  border: `1px solid ${AFFILIATE_THEME.line}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
  '& .MuiTableCell-root': {
    borderBottom: `1px solid ${AFFILIATE_THEME.line}`,
    color: AFFILIATE_THEME.text,
  },
  '& .MuiTableHead-root .MuiTableCell-root': {
    backgroundColor: AFFILIATE_THEME.tableHeadBg,
    color: AFFILIATE_THEME.textMuted,
    fontWeight: 700,
  },
  '& .MuiTableRow-hover:hover .MuiTableCell-root': {
    backgroundColor: AFFILIATE_THEME.hover,
  },
} as const;

const controlSx = {
  '& .MuiInputLabel-root': {
    color: AFFILIATE_THEME.textSoft,
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: AFFILIATE_THEME.accent,
  },
  '& .MuiOutlinedInput-root': {
    color: AFFILIATE_THEME.text,
    backgroundColor: 'rgba(255,255,255,0.03)',
    transition: 'border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease',
    '& fieldset': {
      borderColor: AFFILIATE_THEME.line,
    },
    '&:hover': {
      backgroundColor: AFFILIATE_THEME.hover,
    },
    '&:hover fieldset': {
      borderColor: AFFILIATE_THEME.lineStrong,
    },
    '&.Mui-focused': {
      boxShadow: '0 0 0 3px rgba(46, 189, 133, 0.12)',
    },
    '&.Mui-focused fieldset': {
      borderColor: AFFILIATE_THEME.accent,
    },
  },
  '& .MuiSelect-icon': {
    color: AFFILIATE_THEME.textMuted,
  },
  '& .MuiFormHelperText-root': {
    color: AFFILIATE_THEME.textSoft,
  },
} as const;

const containedButtonSx = {
  background: 'linear-gradient(180deg, rgba(46, 189, 133, 0.92), rgba(36, 156, 108, 0.92))',
  color: '#08110d',
  fontWeight: 700,
  border: '1px solid rgba(46, 189, 133, 0.28)',
  boxShadow: '0 10px 24px rgba(46, 189, 133, 0.18)',
  '&:hover': {
    background: 'linear-gradient(180deg, rgba(58, 201, 146, 0.96), rgba(39, 170, 118, 0.96))',
    boxShadow: '0 12px 28px rgba(46, 189, 133, 0.24)',
  },
} as const;

const outlinedButtonSx = {
  color: AFFILIATE_THEME.textMuted,
  borderColor: AFFILIATE_THEME.line,
  backgroundColor: 'rgba(255,255,255,0.02)',
  '&:hover': {
    borderColor: AFFILIATE_THEME.lineStrong,
    backgroundColor: AFFILIATE_THEME.hover,
  },
} as const;

const dialogPaperSx = {
  ...cardSx,
  backgroundColor: AFFILIATE_THEME.cardBg,
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
} as const;

const selectMenuProps: Partial<MuiMenuProps> = {
  slotProps: {
    paper: {
      sx: {
        mt: 0.75,
        color: AFFILIATE_THEME.text,
        backgroundColor: AFFILIATE_THEME.cardBg,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
        border: `1px solid ${AFFILIATE_THEME.line}`,
        boxShadow: AFFILIATE_THEME.shadow,
        '& .MuiMenuItem-root': {
          color: AFFILIATE_THEME.text,
        },
        '& .MuiMenuItem-root:hover': {
          backgroundColor: AFFILIATE_THEME.hover,
        },
        '& .MuiMenuItem-root.Mui-selected': {
          backgroundColor: 'rgba(46, 189, 133, 0.16)',
        },
        '& .MuiMenuItem-root.Mui-selected:hover': {
          backgroundColor: 'rgba(46, 189, 133, 0.22)',
        },
      },
    },
  },
};

const iconButtonSx = {
  color: AFFILIATE_THEME.textMuted,
  border: `1px solid ${AFFILIATE_THEME.line}`,
  backgroundColor: 'rgba(255,255,255,0.02)',
  '&:hover': {
    color: AFFILIATE_THEME.text,
    backgroundColor: AFFILIATE_THEME.hover,
    borderColor: AFFILIATE_THEME.lineStrong,
  },
} as const;

function chipSx(tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info', variant: 'filled' | 'outlined' = 'outlined') {
  const palette = {
    neutral: { border: AFFILIATE_THEME.lineStrong, bg: 'rgba(255,255,255,0.03)', text: AFFILIATE_THEME.textMuted },
    accent: { border: 'rgba(46, 189, 133, 0.28)', bg: 'rgba(46, 189, 133, 0.16)', text: '#c8f3e3' },
    success: { border: 'rgba(34, 197, 94, 0.28)', bg: 'rgba(34, 197, 94, 0.16)', text: '#d7fbe4' },
    warning: { border: 'rgba(245, 158, 11, 0.28)', bg: 'rgba(245, 158, 11, 0.16)', text: '#ffe8bb' },
    danger: { border: 'rgba(239, 68, 68, 0.28)', bg: 'rgba(239, 68, 68, 0.16)', text: '#ffd7d7' },
    info: { border: 'rgba(96, 165, 250, 0.28)', bg: 'rgba(96, 165, 250, 0.16)', text: '#d9e9ff' },
  } as const;

  const token = palette[tone];
  return {
    color: token.text,
    borderColor: token.border,
    backgroundColor: variant === 'filled' ? token.bg : 'rgba(255,255,255,0.02)',
    '& .MuiChip-label': {
      px: 1.1,
      fontWeight: 500,
    },
  };
}

function alertSx(color: 'info' | 'success' | 'warning' | 'error') {
  const accents = {
    info: 'rgba(96, 165, 250, 0.24)',
    success: 'rgba(46, 189, 133, 0.24)',
    warning: 'rgba(245, 158, 11, 0.24)',
    error: 'rgba(239, 68, 68, 0.24)',
  } as const;

  return {
    color: AFFILIATE_THEME.text,
    border: `1px solid ${accents[color]}`,
    backgroundColor: 'rgba(255,255,255,0.03)',
    '& .MuiAlert-icon': {
      color: AFFILIATE_THEME.text,
      opacity: 0.9,
    },
  };
}

function tabButtonSx(active: boolean) {
  return {
    ...(active ? containedButtonSx : outlinedButtonSx),
    minWidth: 128,
    justifyContent: 'center',
    ...(active
      ? {
          color: AFFILIATE_THEME.text,
          background: 'linear-gradient(180deg, rgba(46, 189, 133, 0.24), rgba(46, 189, 133, 0.12))',
          borderColor: 'rgba(46, 189, 133, 0.36)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }
      : null),
  };
}

type LinkFormState = {
  id: string | null;
  name: string;
  sub_id1: string;
  al: string;
  description: string;
  is_active: boolean;
};

function getTodayInputValue() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function shiftDateInput(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function toUtcDayBoundaryIso(value: string, boundary: 'start' | 'end') {
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return value;
  }

  const date = boundary === 'start'
    ? new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
    : new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  return date.toISOString();
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU').format(value ?? 0);
}

function formatPercent(value: number | null | undefined) {
  return `${((value ?? 0) * 100).toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function createLinkForm(link?: AffiliateLink | null, fallbackAl?: string | null): LinkFormState {
  return {
    id: link?.id ?? null,
    name: link?.name ?? '',
    sub_id1: link?.sub_id1 ?? '',
    al: link?.al ?? fallbackAl ?? '',
    description: link?.description ?? '',
    is_active: link?.is_active ?? true,
  };
}

function normalizeRefCode(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/^@+/, '').toLowerCase();
}

function buildAffiliateRegistrationLink(
  refCode: string | null | undefined,
  al?: string | null,
  subId1?: string | null,
): string {
  const normalizedRef = normalizeRefCode(refCode);
  if (!normalizedRef) return '';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = new URL(routes.Register, origin || 'http://localhost');
  url.searchParams.set('ref', normalizedRef);

  const normalizedAl = (al ?? '').trim();
  if (normalizedAl) {
    url.searchParams.set('al', normalizedAl);
  }

  const normalizedSubId1 = (subId1 ?? '').trim();
  if (normalizedSubId1) {
    url.searchParams.set('sub_id1', normalizedSubId1);
  }

  return origin ? url.toString() : `${routes.Register}?${url.searchParams.toString()}`;
}

function randomString(len: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function buildRandomTestCredentials(): { email: string; password: string } {
  const suffix = `${Date.now()}_${randomString(6)}`;
  return {
    email: `affiliate_test_${suffix}@example.com`,
    password: `Tst_${randomString(10)}!A1`,
  };
}

function getPublicAuthApiBase(): string {
  return ((import.meta.env.VITE_PAGES_API_URL as string | undefined) ?? 'https://api.po-terminal.com').replace(/\/+$/, '');
}

function buildAffiliateProbeRequestBody(registrationLink: string, email: string, password: string): Record<string, unknown> {
  const url = new URL(registrationLink, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const refCode = (url.searchParams.get('ref') ?? '').trim().replace(/^@+/, '').toLowerCase();
  const body: Record<string, unknown> = { email, password };

  if (refCode) body.ref_code = refCode;

  const directKeys = ['al', 'click_id', 'site_id', 'sub_id1', 'sub_id2', 'sub_id3', 'sub_id4', 'sub_id5', 'utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content'] as const;
  for (const key of directKeys) {
    const value = url.searchParams.get(key)?.trim();
    if (value) body[key] = value;
  }

  const hasAffiliateTracking = Boolean(
    body.ref_code || body.al || body.click_id || body.site_id || body.sub_id1 || body.sub_id2 || body.sub_id3 || body.sub_id4 || body.sub_id5,
  );

  if (hasAffiliateTracking) {
    if (!body.utm_source) body.utm_source = 'affiliate';
    if (!body.utm_medium) body.utm_medium = 'sr';
    if (!body.utm_campaign && typeof body.ref_code === 'string' && body.ref_code) {
      body.utm_campaign = body.ref_code;
    }
  }

  return body;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card sx={cardSx}>
      <CardContent>
        <Typography color={AFFILIATE_THEME.textMuted} variant="body2">
          {title}
        </Typography>
        <Typography sx={{ fontSize: 28, fontWeight: 800, mt: 1 }}>
          {value}
        </Typography>
        {subtitle ? (
          <Typography color={AFFILIATE_THEME.textSoft} sx={{ mt: 1 }} variant="caption">
            {subtitle}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TimelineChart({ items }: { items: AffiliateTimelinePoint[] }) {
  const width = 960;
  const height = 300;
  const padding = { top: 20, right: 18, bottom: 48, left: 44 };
  const series = [
    { key: 'visits', label: 'Визиты', color: '#60a5fa' },
    { key: 'unique_visitors', label: 'Уники', color: '#22c55e' },
    { key: 'registrations', label: 'Регистрации', color: '#f59e0b' },
    { key: 'ftd', label: 'FTD', color: '#ef4444' },
  ] as const;

  if (items.length === 0) {
    return (
      <Box
        sx={{
          minHeight: 240,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: AFFILIATE_THEME.textSoft,
          background: 'rgba(255,255,255,0.02)',
          border: `1px dashed ${AFFILIATE_THEME.lineStrong}`,
          borderRadius: 2,
        }}
      >
        Нет данных для графика
      </Box>
    );
  }

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => series.map((entry) => item[entry.key] ?? 0)),
  );
  const stepX = items.length === 1 ? 0 : plotWidth / (items.length - 1);
  const y = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;
  const x = (index: number) => padding.left + stepX * index;

  const buildPath = (key: (typeof series)[number]['key']) => {
    return items
      .map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(item[key] ?? 0).toFixed(2)}`)
      .join(' ');
  };

  const axisLabels = items.map((item) => item.bucket);
  const visibleLabelIndexes = Array.from(new Set([0, Math.floor((items.length - 1) / 2), items.length - 1]));

  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {series.map((entry) => (
          <Stack direction="row" key={entry.key} spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: entry.color }} />
            <Typography variant="caption">{entry.label}</Typography>
          </Stack>
        ))}
      </Stack>
      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const value = Math.round(maxValue * fraction);
            const yy = y(value);
            return (
              <g key={fraction}>
                <line x1={padding.left} x2={width - padding.right} y1={yy} y2={yy} stroke={AFFILIATE_THEME.line} />
                <text x={6} y={yy + 4} fill={AFFILIATE_THEME.textSoft} fontSize="11">
                  {formatNumber(value)}
                </text>
              </g>
            );
          })}
          {series.map((entry) => (
            <path
              key={entry.key}
              d={buildPath(entry.key)}
              fill="none"
              stroke={entry.color}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {visibleLabelIndexes.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 12}
              textAnchor={index === 0 ? 'start' : index === items.length - 1 ? 'end' : 'middle'}
              fill={AFFILIATE_THEME.textSoft}
              fontSize="11"
            >
              {axisLabels[index]}
            </text>
          ))}
        </svg>
      </Box>
    </Box>
  );
}

function EventTypeChip({ type }: { type: string }) {
  const tone = type === 'visit' ? 'info' : type === 'registration' ? 'warning' : type === 'ftd' ? 'success' : 'neutral';
  const variant = tone === 'neutral' ? 'outlined' : 'filled';
  return <Chip label={type} size="small" sx={chipSx(tone, variant)} variant={variant} />;
}

export function AffiliatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { section } = useParams<{ section?: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [selectedBot, setSelectedBot] = useState('');
  const [period, setPeriod] = useState<AffiliatePeriod>('week');
  const [bucket, setBucket] = useState<AffiliateTimelineBucket>('day');
  const [from, setFrom] = useState(() => shiftDateInput(getTodayInputValue(), -7));
  const [to, setTo] = useState(() => getTodayInputValue());
  const [selectedLinkId, setSelectedLinkId] = useState('');
  const [subId1Filter, setSubId1Filter] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const [affiliateMe, setAffiliateMe] = useState<AffiliateMeResponse | null>(null);
  const [summary, setSummary] = useState<AffiliateAnalyticsSummary | null>(null);
  const [timeline, setTimeline] = useState<AffiliateTimelinePoint[]>([]);
  const [linkAnalytics, setLinkAnalytics] = useState<AffiliateLinkAnalyticsItem[]>([]);
  const [events, setEvents] = useState<AffiliateEventItem[]>([]);
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [linksLoading, setLinksLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [probeLoadingLinkId, setProbeLoadingLinkId] = useState<string | null>(null);
  const [probeOutput, setProbeOutput] = useState('');
  const [probeLinkName, setProbeLinkName] = useState<string | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkForm, setLinkForm] = useState<LinkFormState>(createLinkForm());
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const routeTab = section ? AFFILIATE_SECTION_TAB_MAP[section] ?? null : null;
  const activeTab: AffiliateTab = routeTab ?? 'overview';

  useEffect(() => {
    const expectedPath = buildPath.affiliateSection(AFFILIATE_TAB_SECTION_MAP[activeTab]);
    if (location.pathname !== expectedPath) {
      navigate({ pathname: expectedPath, search: location.search }, { replace: true });
    }
  }, [activeTab, location.pathname, location.search, navigate]);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    getMyProfile()
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        persistUserAccess(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setProfileError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const affiliateAccess = profile?.affiliate_access ?? null;
  const hasAffiliateAccess = affiliateAccess?.has_access ?? false;
  const requiresBotSelection = affiliateAccess?.requires_bot_selection ?? false;
  const bots = affiliateAccess?.bots ?? [];

  useEffect(() => {
    if (!affiliateAccess?.has_access) return;
    setSelectedBot((prev) => {
      if (prev) return prev;
      if (affiliateAccess.selected_bot?.bot_username) return affiliateAccess.selected_bot.bot_username;
      if (!affiliateAccess.requires_bot_selection && affiliateAccess.bots[0]?.bot_username) {
        return affiliateAccess.bots[0].bot_username;
      }
      return '';
    });
  }, [affiliateAccess]);

  const activeBotUsername = useMemo(() => {
    if (!affiliateAccess?.has_access) return '';
    if (selectedBot) return selectedBot;
    if (affiliateAccess.selected_bot?.bot_username) return affiliateAccess.selected_bot.bot_username;
    if (!affiliateAccess.requires_bot_selection && affiliateAccess.bots[0]?.bot_username) return affiliateAccess.bots[0].bot_username;
    return '';
  }, [affiliateAccess, selectedBot]);

  const analyticsParams = useMemo(() => {
    if (!activeBotUsername) return null;
    return {
      bot_username: activeBotUsername,
      period,
      ...(period === 'custom'
        ? {
            from: toUtcDayBoundaryIso(from, 'start'),
            to: toUtcDayBoundaryIso(to, 'end'),
          }
        : {}),
      ...(selectedLinkId ? { link_id: selectedLinkId } : {}),
      ...(subId1Filter.trim() ? { sub_id1: subId1Filter.trim() } : {}),
    };
  }, [activeBotUsername, period, from, to, selectedLinkId, subId1Filter]);

  const refreshAll = useCallback(() => setReloadTick((prev) => prev + 1), []);

  const handleTabChange = useCallback((nextTab: AffiliateTab) => {
    navigate({ pathname: buildPath.affiliateSection(AFFILIATE_TAB_SECTION_MAP[nextTab]), search: location.search });
  }, [location.search, navigate]);

  useEffect(() => {
    if (!hasAffiliateAccess || !activeBotUsername) return;
    let cancelled = false;
    setLinksLoading(true);

    Promise.all([
      getAffiliateMe({ bot_username: activeBotUsername }),
      getAffiliateLinks({ bot_username: activeBotUsername }),
    ])
      .then(([meData, linksData]) => {
        if (cancelled) return;
        setAffiliateMe(meData);
        setLinks(linksData);
        setLinkForm((prev) => (prev.id ? prev : createLinkForm(null, meData.affiliate.partner_link_id)));
      })
      .catch((err) => {
        if (cancelled) return;
        setAnalyticsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLinksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasAffiliateAccess, activeBotUsername, reloadTick]);

  useEffect(() => {
    if (!analyticsParams) return;
    if (period === 'custom' && (!from || !to)) return;

    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);

    Promise.all([
      getAffiliateAnalyticsSummary(analyticsParams),
      getAffiliateAnalyticsTimeline({ ...analyticsParams, bucket }),
      getAffiliateAnalyticsLinks(analyticsParams),
      getAffiliateAnalyticsEvents(analyticsParams),
    ])
      .then(([summaryData, timelineData, linkData, eventsData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setTimeline(timelineData.items ?? []);
        setLinkAnalytics(linkData.items ?? []);
        setEvents(eventsData.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAnalyticsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analyticsParams, bucket, period, from, to, reloadTick]);

  const openCreateDialog = useCallback(() => {
    setLinkError(null);
    setLinkForm(createLinkForm(null, affiliateMe?.affiliate.partner_link_id));
    setLinkDialogOpen(true);
  }, [affiliateMe]);

  const openEditDialog = useCallback((link: AffiliateLink) => {
    setLinkError(null);
    setLinkForm(createLinkForm(link, affiliateMe?.affiliate.partner_link_id));
    setLinkDialogOpen(true);
  }, [affiliateMe]);

  const handleSaveLink = useCallback(async () => {
    if (!activeBotUsername) return;
    if (!linkForm.name.trim()) {
      setLinkError('Введите название ссылки');
      return;
    }

    setLinkSaving(true);
    setLinkError(null);
    try {
      const payload = {
        name: linkForm.name.trim(),
        sub_id1: linkForm.sub_id1.trim() || null,
        al: linkForm.al.trim() || null,
        description: linkForm.description.trim() || null,
        is_active: linkForm.is_active,
      };

      if (linkForm.id) {
        await updateAffiliateLink(linkForm.id, payload, { bot_username: activeBotUsername });
      } else {
        await createAffiliateLink(payload, { bot_username: activeBotUsername });
      }

      setLinkDialogOpen(false);
      refreshAll();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinkSaving(false);
    }
  }, [activeBotUsername, linkForm, refreshAll]);

  const handleDeleteLink = useCallback(async (link: AffiliateLink) => {
    if (!activeBotUsername) return;
    if (!window.confirm(`Удалить ссылку «${link.name}»?`)) return;

    try {
      await deleteAffiliateLink(link.id, { bot_username: activeBotUsername });
      if (selectedLinkId === link.id) {
        setSelectedLinkId('');
      }
      refreshAll();
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : String(err));
    }
  }, [activeBotUsername, refreshAll, selectedLinkId]);

  const handleCopyRegistrationLink = useCallback(async (link: AffiliateLink) => {
    const registrationLink = buildAffiliateRegistrationLink(
      affiliateMe?.affiliate.ref_code,
      link.al ?? affiliateMe?.affiliate.partner_link_id,
      link.sub_id1,
    );

    if (!registrationLink) {
      setAnalyticsError('Невозможно скопировать ссылку: отсутствует ref_code для affiliate-бота');
      return;
    }

    try {
      await copyToClipboard(registrationLink);
      setAnalyticsError(null);
      setCopySuccess(`Ссылка регистрации для «${link.name}» скопирована`);
    } catch (err) {
      setCopySuccess(null);
      setAnalyticsError(err instanceof Error ? err.message : String(err));
    }
  }, [affiliateMe]);

  const handleProbeRegistration = useCallback(async (link: AffiliateLink) => {
    const registrationLink = buildAffiliateRegistrationLink(
      affiliateMe?.affiliate.ref_code,
      link.al ?? affiliateMe?.affiliate.partner_link_id,
      link.sub_id1,
    );

    if (!registrationLink) {
      setAnalyticsError('Невозможно выполнить тест: отсутствует ref_code для affiliate-бота');
      return;
    }

    const creds = buildRandomTestCredentials();
    const requestBody = buildAffiliateProbeRequestBody(registrationLink, creds.email, creds.password);

    setProbeLoadingLinkId(link.id);
    setProbeLinkName(link.name);
    setProbeOutput('');
    setAnalyticsError(null);
    setCopySuccess(null);

    try {
      const response = await fetch(`${getPublicAuthApiBase()}/api/terminal/v2/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const raw = await response.text();
      const prettyResponse = (() => {
        try {
          return JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          return raw || '<empty>';
        }
      })();

      setProbeOutput([
        `link: ${registrationLink}`,
        `ok: ${response.ok}`,
        `status: ${response.status}`,
        '',
        'request:',
        JSON.stringify(requestBody, null, 2),
        '',
        'response:',
        prettyResponse,
      ].join('\n'));
      setCopySuccess(`Тест регистрации для «${link.name}» выполнен (status ${response.status})`);
    } catch (err) {
      setProbeOutput('');
      setAnalyticsError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbeLoadingLinkId(null);
    }
  }, [affiliateMe]);

  if (profileLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-primary, #0f1116)' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (profileError) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-primary, #0f1116)', p: 3 }}>
        <Alert severity="error" sx={alertSx('error')}>{profileError}</Alert>
      </Box>
    );
  }

  if (!hasAffiliateAccess) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-primary, #0f1116)', p: 3 }}>
        <Alert severity="warning" sx={alertSx('warning')}>{t.affiliateAccessDenied}</Alert>
      </Box>
    );
  }

  const canQuery = Boolean(activeBotUsername) && (!requiresBotSelection || Boolean(selectedBot));

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'var(--bg-primary, #0f1116)', backgroundImage: AFFILIATE_THEME.pageBg, color: AFFILIATE_THEME.text, px: { xs: 2, md: 3 }, py: 3 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: { xs: 28, md: 34 }, fontWeight: 800 }}>
              Affiliate кабинет
            </Typography>
          </Box>
          <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', md: 'flex-end' } }}>
            <Button onClick={refreshAll} startIcon={<RefreshIcon />} sx={outlinedButtonSx} variant="outlined">
              Обновить данные
            </Button>
          </Stack>
        </Stack>

        <Card sx={cardSx}>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 1.5 }} variant="h6">
              Разделы кабинета
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {AFFILIATE_NAV_ITEMS.map((item) => (
                <Button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  sx={tabButtonSx(activeTab === item.id)}
                  variant={activeTab === item.id ? 'contained' : 'outlined'}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          </CardContent>
        </Card>

        <Card sx={cardSx}>
          <CardContent>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5}>
              <Stack spacing={1.5} sx={{ minWidth: { xs: '100%', lg: 320 } }}>
                <FormControl fullWidth sx={controlSx}>
                  <InputLabel id="affiliate-bot-select-label">Бот</InputLabel>
                  <Select
                    label="Бот"
                    labelId="affiliate-bot-select-label"
                    MenuProps={selectMenuProps}
                    onChange={(event: SelectChangeEvent<string>) => setSelectedBot(event.target.value)}
                    sx={controlSx}
                    value={activeBotUsername}
                  >
                    {bots.map((bot) => (
                      <MenuItem key={bot.bot_username} value={bot.bot_username}>
                        {bot.affiliate_name || bot.bot_username} ({bot.bot_username})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={cardSx}>
          <CardContent>
            <Typography sx={{ fontWeight: 700, mb: 2 }} variant="h6">
              Фильтры аналитики
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' },
                gap: 2,
              }}
            >
              <FormControl fullWidth sx={controlSx}>
                <InputLabel id="affiliate-period-label">Период</InputLabel>
                <Select
                  label="Период"
                  labelId="affiliate-period-label"
                  MenuProps={selectMenuProps}
                  onChange={(event: SelectChangeEvent<AffiliatePeriod>) => setPeriod(event.target.value as AffiliatePeriod)}
                  sx={controlSx}
                  value={period}
                >
                  <MenuItem value="day">День</MenuItem>
                  <MenuItem value="week">Неделя</MenuItem>
                  <MenuItem value="month">Месяц</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={controlSx}>
                <InputLabel id="affiliate-bucket-label">Бакет графика</InputLabel>
                <Select
                  label="Бакет графика"
                  labelId="affiliate-bucket-label"
                  MenuProps={selectMenuProps}
                  onChange={(event: SelectChangeEvent<AffiliateTimelineBucket>) => setBucket(event.target.value as AffiliateTimelineBucket)}
                  sx={controlSx}
                  value={bucket}
                >
                  <MenuItem value="hour">По часам</MenuItem>
                  <MenuItem value="day">По дням</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={controlSx}>
                <InputLabel id="affiliate-link-label">Ссылка</InputLabel>
                <Select
                  label="Ссылка"
                  labelId="affiliate-link-label"
                  MenuProps={selectMenuProps}
                  onChange={(event: SelectChangeEvent<string>) => setSelectedLinkId(event.target.value)}
                  sx={controlSx}
                  value={selectedLinkId}
                >
                  <MenuItem value="">Все ссылки</MenuItem>
                  {links.map((link) => (
                    <MenuItem key={link.id} value={link.id}>
                      {link.name} {link.sub_id1 ? `(${link.sub_id1})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {period === 'custom' ? (
                <>
                  <TextField fullWidth label="Дата от" onChange={(event) => setFrom(event.target.value)} sx={controlSx} type="date" value={from} slotProps={{ inputLabel: { shrink: true } }} />
                  <TextField fullWidth label="Дата до" onChange={(event) => setTo(event.target.value)} sx={controlSx} type="date" value={to} slotProps={{ inputLabel: { shrink: true } }} />
                </>
              ) : null}
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
              <Button onClick={refreshAll} startIcon={<RefreshIcon />} sx={containedButtonSx} variant="contained">
                Применить фильтры
              </Button>
              <Button
                onClick={() => {
                  setPeriod('week');
                  setBucket('day');
                  setFrom(shiftDateInput(getTodayInputValue(), -7));
                  setTo(getTodayInputValue());
                  setSelectedLinkId('');
                  setSubId1Filter('');
                  refreshAll();
                }}
                sx={outlinedButtonSx}
                variant="outlined"
              >
                Сбросить
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {!canQuery ? (
          <Alert severity="warning" sx={alertSx('warning')}>Выберите бота, чтобы загрузить affiliate-аналитику.</Alert>
        ) : null}
        {analyticsError ? <Alert severity="error" sx={alertSx('error')}>{analyticsError}</Alert> : null}
        {copySuccess ? <Alert severity="success" sx={alertSx('success')}>{copySuccess}</Alert> : null}

        {activeTab === 'overview' ? (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
              <StatCard
                title="Визиты"
                value={formatNumber(summary?.visits)}
                subtitle={`Уникальные: ${formatNumber(summary?.unique_visitors)}`}
              />
              <StatCard
                title="Регистрации"
                value={formatNumber(summary?.registrations)}
                subtitle={`CR: ${formatPercent(summary?.registration_rate)}`}
              />
              <StatCard
                title="FTD"
                value={formatNumber(summary?.ftd)}
                subtitle={`FTD rate: ${formatPercent(summary?.ftd_rate)}`}
              />
            </Box>

            <Card sx={cardSx}>
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 700 }} variant="h6">
                    Динамика по времени
                  </Typography>
                  <Chip label={`Bucket: ${bucket === 'hour' ? 'по часам' : 'по дням'}`} sx={chipSx('neutral')} variant="outlined" />
                </Stack>
                {analyticsLoading ? (
                  <Box sx={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : (
                  <TimelineChart items={timeline} />
                )}
              </CardContent>
            </Card>
          </>
        ) : null}

        {activeTab === 'links' ? (
          <>
            <Card sx={cardSx}>
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 700 }} variant="h6">
                    Управление affiliate-ссылками
                  </Typography>
                  <Button onClick={openCreateDialog} startIcon={<AddLinkIcon />} sx={containedButtonSx} variant="contained">
                    Создать ссылку
                  </Button>
                </Stack>

                {linksLoading ? (
                  <Box sx={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress size={26} />
                  </Box>
                ) : (
                  <TableContainer component={Paper} sx={tableContainerSx}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Название</TableCell>
                          <TableCell>sub_id1</TableCell>
                          <TableCell>al</TableCell>
                          <TableCell>Описание</TableCell>
                          <TableCell>Registration link</TableCell>
                          <TableCell>Создана</TableCell>
                          <TableCell>Обновлена</TableCell>
                          <TableCell>Статус</TableCell>
                          <TableCell align="right">Действия</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {links.map((link) => (
                          <TableRow hover key={link.id}>
                            <TableCell>{link.name}</TableCell>
                            <TableCell>{link.sub_id1 || '—'}</TableCell>
                            <TableCell>{link.al || '—'}</TableCell>
                            <TableCell>{link.description || '—'}</TableCell>
                            <TableCell>
                              <Tooltip title="Скопировать ссылку регистрации">
                                <span>
                                  <Button
                                    onClick={() => void handleCopyRegistrationLink(link)}
                                    size="small"
                                    startIcon={<ContentCopyIcon fontSize="small" />}
                                    sx={outlinedButtonSx}
                                    variant="outlined"
                                  >
                                    Копировать
                                  </Button>
                                </span>
                              </Tooltip>
                            </TableCell>
                            <TableCell>{formatShortDateTime(link.created_at)}</TableCell>
                            <TableCell>{formatShortDateTime(link.updated_at)}</TableCell>
                            <TableCell>
                              <Chip label={link.is_active ? 'Активна' : 'Выключена'} size="small" sx={chipSx(link.is_active ? 'success' : 'neutral', link.is_active ? 'filled' : 'outlined')} variant={link.is_active ? 'filled' : 'outlined'} />
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Тест регистрации через public endpoint">
                                <span>
                                  <IconButton onClick={() => void handleProbeRegistration(link)} size="small" sx={{ ...iconButtonSx, color: '#9cf0c3', borderColor: 'rgba(46, 189, 133, 0.2)', '&:hover': { color: '#d8ffe9', backgroundColor: 'rgba(46, 189, 133, 0.12)', borderColor: 'rgba(46, 189, 133, 0.32)' } }}>
                                    {probeLoadingLinkId === link.id ? <CircularProgress size={16} sx={{ color: AFFILIATE_THEME.accent }} /> : <PersonAddAlt1Icon fontSize="small" />}
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Редактировать">
                                <IconButton onClick={() => openEditDialog(link)} size="small" sx={iconButtonSx}>
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Удалить">
                                <IconButton onClick={() => void handleDeleteLink(link)} size="small" sx={{ ...iconButtonSx, color: '#ff8d8d', borderColor: 'rgba(239, 68, 68, 0.18)', '&:hover': { color: '#ffd0d0', backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.28)' } }}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                        {links.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9}>
                              <Typography color={AFFILIATE_THEME.textSoft} sx={{ py: 2, textAlign: 'center' }}>
                                Дополнительные affiliate-ссылки пока не созданы.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {probeOutput ? (
                  <Box sx={{ mt: 2, border: `1px solid ${AFFILIATE_THEME.line}`, borderRadius: 2.5, overflow: 'hidden', backgroundColor: 'rgba(7, 11, 16, 0.82)' }}>
                    <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${AFFILIATE_THEME.line}`, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <Typography sx={{ fontWeight: 700 }} variant="body2">
                        Результат тестовой регистрации{probeLinkName ? `: ${probeLinkName}` : ''}
                      </Typography>
                    </Box>
                    <Box component="pre" sx={{ m: 0, px: 2, py: 1.5, color: AFFILIATE_THEME.textMuted, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace', fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {probeOutput}
                    </Box>
                  </Box>
                ) : null}
              </CardContent>
            </Card>

            <Card sx={cardSx}>
              <CardContent>
                <Typography sx={{ fontWeight: 700, mb: 2 }} variant="h6">
                  Breakdown по ссылкам
                </Typography>
                <TableContainer component={Paper} sx={tableContainerSx}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Ссылка</TableCell>
                        <TableCell>sub_id1</TableCell>
                        <TableCell align="right">Визиты</TableCell>
                        <TableCell align="right">Уники</TableCell>
                        <TableCell align="right">Регистрации</TableCell>
                        <TableCell align="right">FTD</TableCell>
                        <TableCell align="right">CR</TableCell>
                        <TableCell align="right">FTD rate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {linkAnalytics.map((item, index) => (
                        <TableRow hover key={`${item.link_id ?? item.sub_id1 ?? 'row'}-${index}`}>
                          <TableCell>{item.name || '—'}</TableCell>
                          <TableCell>{item.sub_id1 || '—'}</TableCell>
                          <TableCell align="right">{formatNumber(item.visits)}</TableCell>
                          <TableCell align="right">{formatNumber(item.unique_visitors)}</TableCell>
                          <TableCell align="right">{formatNumber(item.registrations)}</TableCell>
                          <TableCell align="right">{formatNumber(item.ftd)}</TableCell>
                          <TableCell align="right">{formatPercent(item.registration_rate)}</TableCell>
                          <TableCell align="right">{formatPercent(item.ftd_rate)}</TableCell>
                        </TableRow>
                      ))}
                      {linkAnalytics.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <Typography color={AFFILIATE_THEME.textSoft} sx={{ py: 2, textAlign: 'center' }}>
                              Нет breakdown-данных по ссылкам для выбранного периода.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </>
        ) : null}

        {activeTab === 'events' ? (
          <Card sx={cardSx}>
            <CardContent>
              <Typography sx={{ fontWeight: 700, mb: 2 }} variant="h6">
                Детальные события
              </Typography>
              <TableContainer component={Paper} sx={{ ...tableContainerSx, maxHeight: 520 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Время</TableCell>
                      <TableCell>Тип</TableCell>
                      <TableCell>Visitor / Trader ID</TableCell>
                      <TableCell>Link / sub_id1</TableCell>
                      <TableCell>Email / al</TableCell>
                      <TableCell>Click / UTM</TableCell>
                      <TableCell>Бот</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {events.map((event, index) => (
                      <TableRow hover key={`${event.id ?? event.created_at}-${index}`}>
                        <TableCell>{formatDateTime(event.created_at)}</TableCell>
                        <TableCell><EventTypeChip type={event.event_type} /></TableCell>
                        <TableCell>{event.visitor_id || (event.trader_id != null ? String(event.trader_id) : '—')}</TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2">{event.link_name || event.link_id || '—'}</Typography>
                            <Typography color={AFFILIATE_THEME.textSoft} variant="caption">{event.sub_id1 || '—'}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2">{event.registration_email || event.ref_code || '—'}</Typography>
                            <Typography color={AFFILIATE_THEME.textSoft} variant="caption">{event.al || '—'}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2">{event.click_id || '—'}</Typography>
                            <Typography color={AFFILIATE_THEME.textSoft} variant="caption">
                              {[event.utm_source, event.utm_campaign].filter(Boolean).join(' / ') || '—'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2">{event.bot_username || '—'}</Typography>
                            <Typography color={AFFILIATE_THEME.textSoft} variant="caption">
                              {[event.country, event.device_type].filter(Boolean).join(' / ') || '—'}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Typography color={AFFILIATE_THEME.textSoft} sx={{ py: 2, textAlign: 'center' }}>
                            Детальных событий для выбранного периода нет.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <Dialog fullWidth maxWidth="sm" onClose={() => setLinkDialogOpen(false)} open={linkDialogOpen} slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle>{linkForm.id ? 'Редактировать ссылку' : 'Создать ссылку'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {linkError ? <Alert severity="error" sx={alertSx('error')}>{linkError}</Alert> : null}
            <TextField
              autoFocus
              fullWidth
              label="Название"
              onChange={(event) => setLinkForm((prev) => ({ ...prev, name: event.target.value }))}
              sx={controlSx}
              value={linkForm.name}
            />
            <TextField
              fullWidth
              label="sub_id1"
              onChange={(event) => setLinkForm((prev) => ({ ...prev, sub_id1: event.target.value }))}
              sx={controlSx}
              value={linkForm.sub_id1}
            />
            <TextField
              fullWidth
              label="al"
              onChange={(event) => setLinkForm((prev) => ({ ...prev, al: event.target.value }))}
              sx={controlSx}
              value={linkForm.al}
            />
            <TextField
              fullWidth
              label="Описание"
              minRows={3}
              multiline
              onChange={(event) => setLinkForm((prev) => ({ ...prev, description: event.target.value }))}
              sx={controlSx}
              value={linkForm.description}
            />
            <Button
              onClick={() => setLinkForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
              sx={linkForm.is_active ? containedButtonSx : outlinedButtonSx}
              variant={linkForm.is_active ? 'contained' : 'outlined'}
            >
              {linkForm.is_active ? 'Ссылка активна' : 'Ссылка выключена'}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)} sx={outlinedButtonSx}>Отмена</Button>
          <Button disabled={linkSaving} onClick={() => void handleSaveLink()} sx={containedButtonSx} variant="contained">
            {linkSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}