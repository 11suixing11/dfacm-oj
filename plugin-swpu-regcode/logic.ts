import { randomInt } from 'crypto';
import { isIP } from 'net';

export const CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const CODE_PATTERN = /^\d{6}$/;

export type CodePurpose = 'reg' | 'login';

export function normalizeMail(mail: string): string {
    return mail.trim().toLowerCase();
}

export function normalizeClientIp(value: string | null | undefined): string {
    const candidate = String(value || '').split(',')[0].trim();
    return isIP(candidate) ? candidate : '';
}

export function generateCode(): string {
    return String(randomInt(100000, 1000000));
}

export function isValidCodeFormat(code: string): boolean {
    return CODE_PATTERN.test(code.trim());
}

export function isCodeExpired(
    expireAt: Date | string | number | null | undefined,
    now = Date.now(),
): boolean {
    if (!expireAt) return true;
    const expires = expireAt instanceof Date ? expireAt.getTime() : new Date(expireAt).getTime();
    return !Number.isFinite(expires) || expires <= now;
}

export function isPurposeMatch(
    docPurpose: string | null | undefined,
    expected: CodePurpose,
): boolean {
    return docPurpose === expected;
}

export function buildVerifyFilter(
    mailKey: string,
    code: string,
    purpose: CodePurpose,
    now = new Date(),
) {
    return {
        _id: mailKey,
        code: code.trim(),
        purpose,
        attempts: { $lt: MAX_CODE_ATTEMPTS },
        expireAt: { $gt: now },
    };
}
