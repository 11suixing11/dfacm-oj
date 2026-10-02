import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CODE_TTL_MS,
    MAX_CODE_ATTEMPTS,
    buildVerifyFilter,
    generateCode,
    isCodeExpired,
    isPurposeMatch,
    isValidCodeFormat,
    normalizeClientIp,
    normalizeMail,
} from './logic.ts';

test('normalizeMail trims and lowercases addresses', () => {
    assert.equal(normalizeMail('  User@Example.COM '), 'user@example.com');
});

test('normalizeClientIp accepts only valid IPs and takes the first XFF entry', () => {
    assert.equal(normalizeClientIp('203.0.113.7'), '203.0.113.7');
    assert.equal(normalizeClientIp(' 203.0.113.7, 10.0.0.1'), '203.0.113.7');
    assert.equal(normalizeClientIp('::1'), '::1');
    assert.equal(normalizeClientIp('unknown'), '');
    assert.equal(normalizeClientIp(undefined), '');
});

test('generateCode always returns a six-digit string', () => {
    for (let i = 0; i < 200; i += 1) {
        const code = generateCode();
        assert.match(code, /^\d{6}$/);
        assert.ok(Number(code) >= 100000 && Number(code) < 1000000);
    }
});

test('code format validation trims surrounding whitespace', () => {
    assert.equal(isValidCodeFormat('123456'), true);
    assert.equal(isValidCodeFormat(' 123456 '), true);
    assert.equal(isValidCodeFormat('12345'), false);
    assert.equal(isValidCodeFormat('12345a'), false);
});

test('expiry checks reject expired and invalid timestamps', () => {
    const now = 1_000_000;
    assert.equal(isCodeExpired(new Date(now + 1), now), false);
    assert.equal(isCodeExpired(new Date(now), now), true);
    assert.equal(isCodeExpired(undefined, now), true);
    assert.equal(isCodeExpired('not-a-date', now), true);
});

test('purpose binding rejects missing and mismatched purposes', () => {
    assert.equal(isPurposeMatch('reg', 'reg'), true);
    assert.equal(isPurposeMatch('reg', 'login'), false);
    assert.equal(isPurposeMatch(undefined, 'login'), false);
});

test('verify filter enforces code, purpose, expiry and attempt limit', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    assert.deepEqual(buildVerifyFilter('a@example.com', '123456', 'login', now), {
        _id: 'a@example.com',
        code: '123456',
        purpose: 'login',
        attempts: { $lt: MAX_CODE_ATTEMPTS },
        expireAt: { $gt: now },
    });
    assert.equal(CODE_TTL_MS, 300000);
});
