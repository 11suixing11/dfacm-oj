export const DEFAULTS = {
    sendIpHourly: 200,
    sendGlobalHourly: 500,
    verifyIpMinute: 60,
    verifyAccountMinute: 10,
    registerRedirect: '/training',
    loginRedirect: '/',
} as const;

export function positiveLimit(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : fallback;
}

// Redirects stay on this site, including when an administrator mistypes a setting.
export function localRedirect(value: unknown, fallback: string) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
        || /[\\\s\u0000-\u001f\u007f]/.test(value)) return fallback;
    try {
        if (new URL(value, 'https://swpu.invalid').origin !== 'https://swpu.invalid') return fallback;
    } catch {
        return fallback;
    }
    return value;
}
