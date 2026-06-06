import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useMemo, useState } from 'react';
import { decodeAdminBetterJwt, type BetterJwtDecodeResponse } from '../api/adminBetterAuthEvents';

interface AdminBetterJwtDecoderProps {
  isActive: boolean;
  t: Record<string, string>;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCreatedAt(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatJson(value: unknown): string {
  if (value == null) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AdminBetterJwtDecoder({ isActive}: AdminBetterJwtDecoderProps) {
  const [jwtInput, setJwtInput] = useState('');
  const [jwtDecoding, setJwtDecoding] = useState(false);
  const [jwtDecodeResult, setJwtDecodeResult] = useState<BetterJwtDecodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canClear = useMemo(() => jwtDecoding === false && (jwtInput.trim().length > 0 || jwtDecodeResult != null), [jwtDecodeResult, jwtDecoding, jwtInput]);

  const handleDecodeJwt = useCallback(async () => {
    const token = jwtInput.trim();
    if (!token) {
      setError('JWT is required');
      setSuccess(null);
      return;
    }
    setJwtDecoding(true);
    setError(null);
    setSuccess(null);
    try {
      const decoded = await decodeAdminBetterJwt(token);
      setJwtDecodeResult(decoded);
      setSuccess(decoded.verified ? 'JWT decoded and verified' : 'JWT decoded');
    } catch (err) {
      setJwtDecodeResult(null);
      setError(formatError(err));
    } finally {
      setJwtDecoding(false);
    }
  }, [jwtInput]);

  const handleClear = useCallback(() => {
    setJwtInput('');
    setJwtDecodeResult(null);
    setError(null);
    setSuccess(null);
  }, []);

  const handleCopyDecoded = useCallback(async () => {
    if (!jwtDecodeResult) return;
    setError(null);
    setSuccess(null);
    try {
      await navigator.clipboard.writeText(formatJson({
        meta: {
          subject_kind: jwtDecodeResult.subject_kind,
          verified: jwtDecodeResult.verified,
          is_expired: jwtDecodeResult.is_expired,
          expires_at: jwtDecodeResult.expires_at,
          parse_error: jwtDecodeResult.parse_error,
          verify_error: jwtDecodeResult.verify_error,
        },
        header: jwtDecodeResult.header,
        payload: jwtDecodeResult.payload,
      }));
      setSuccess('Decoded JWT copied to clipboard');
    } catch (err) {
      setError(formatError(err));
    }
  }, [jwtDecodeResult]);

  if (!isActive) return null;

  return (
    <Stack spacing={2} sx={{ maxWidth: 1040 }}>
      <Stack spacing={0.75}>
        <Typography variant="h6">JWT Decoder</Typography>
        <Typography color="text.secondary" variant="body2">
          Вставь JWT из auth popup или Better Auth Events, чтобы посмотреть header, payload и результат серверной верификации.
        </Typography>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {success ? <Alert severity="success">{success}</Alert> : null}

      <TextField
        label="JWT"
        minRows={6}
        multiline
        value={jwtInput}
        onChange={(event) => setJwtInput(event.target.value)}
        placeholder="Paste JWT from auth popup here"
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
        <Button disabled={jwtDecoding} onClick={() => void handleDecodeJwt()} startIcon={<RefreshIcon />} variant="contained">
          {jwtDecoding ? 'Decoding…' : 'Decode JWT'}
        </Button>
        <Button disabled={!jwtDecodeResult || jwtDecoding} onClick={() => void handleCopyDecoded()} startIcon={<ContentCopyIcon />} variant="outlined">
          Copy decoded JSON
        </Button>
        <Button disabled={!canClear} onClick={handleClear} variant="outlined">
          Clear
        </Button>
      </Stack>

      {jwtDecodeResult ? (
        <Stack spacing={1.25} sx={{ p: 2, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#121923' }}>
          <Typography color="text.secondary" variant="body2">
            Kind: {jwtDecodeResult.subject_kind} • Verified: {jwtDecodeResult.verified ? 'yes' : 'no'} • Expired: {jwtDecodeResult.is_expired == null ? 'unknown' : (jwtDecodeResult.is_expired ? 'yes' : 'no')}
          </Typography>
          {jwtDecodeResult.expires_at ? (
            <Typography color="text.secondary" variant="body2">Expires at: {formatCreatedAt(jwtDecodeResult.expires_at)}</Typography>
          ) : null}
          {jwtDecodeResult.parse_error ? <Alert severity="warning">{jwtDecodeResult.parse_error}</Alert> : null}
          {jwtDecodeResult.verify_error ? <Alert severity="warning">{jwtDecodeResult.verify_error}</Alert> : null}
          <Typography variant="body2"><strong>Header</strong></Typography>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(jwtDecodeResult.header)}</pre>
          <Typography variant="body2"><strong>Payload</strong></Typography>
          <pre style={{ margin: 0, padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.08)', color: '#98a8b8', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{formatJson(jwtDecodeResult.payload)}</pre>
        </Stack>
      ) : (
        <Alert severity="info">Декодер активен. После вставки JWT нажми Decode JWT.</Alert>
      )}
    </Stack>
  );
}