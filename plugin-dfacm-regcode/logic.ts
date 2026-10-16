import { isIP } from 'net';

export const CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;

export function normalizeMail(mail: string): string {
    return mail.trim().toLowerCase();
}

export function normalizeClientIp(value: string | string[] | null | undefined): string {
    const raw = Array.isArray(value) ? value[0] : value;
    const candidate = String(raw || '').split(',')[0].trim();
    return isIP(candidate) ? candidate : '';
}

function isLoopback(ip: string): boolean {
    const value = ip.trim().toLowerCase();
    return value === '::1'
        || value === 'localhost'
        || value.startsWith('127.')
        || value.startsWith('::ffff:127.');
}

// Caddy is the only trusted proxy. A direct public peer always wins; when the
// socket peer is loopback, fall back to the proxy-written X-Forwarded-For.
export function resolveClientIp(
    directIp: string | null | undefined,
    forwarded?: string | string[] | null,
): string {
    const direct = String(directIp || '').trim();
    if (direct && !isLoopback(direct)) return direct;
    return normalizeClientIp(forwarded) || direct;
}
