import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CODE_TTL_MS, MAX_CODE_ATTEMPTS, normalizeClientIp, normalizeMail, resolveClientIp,
} from './logic.ts';

test('normalizeMail trims and lowercases addresses', () => {
    assert.equal(normalizeMail('  User@Example.COM '), 'user@example.com');
});

test('normalizeClientIp accepts only valid IPs and takes the first XFF entry', () => {
    assert.equal(normalizeClientIp('203.0.113.7'), '203.0.113.7');
    assert.equal(normalizeClientIp(' 203.0.113.7, 10.0.0.1'), '203.0.113.7');
    assert.equal(normalizeClientIp('::1'), '::1');
    assert.equal(normalizeClientIp('unknown'), '');
    assert.equal(normalizeClientIp(['198.51.100.9, 10.0.0.1']), '198.51.100.9');
    assert.equal(normalizeClientIp(undefined), '');
});

test('resolveClientIp keeps a direct public peer and ignores spoofed XFF', () => {
    assert.equal(resolveClientIp('203.0.113.7', '10.0.0.1'), '203.0.113.7');
});

test('resolveClientIp falls back to the proxy XFF when the peer is loopback', () => {
    assert.equal(resolveClientIp('127.0.0.1', '198.51.100.9, 10.0.0.1'), '198.51.100.9');
    assert.equal(resolveClientIp('::1', '2001:db8::1'), '2001:db8::1');
    assert.equal(resolveClientIp('::ffff:127.0.0.1', '198.51.100.9'), '198.51.100.9');
});

test('resolveClientIp rejects invalid XFF and keeps the socket IP', () => {
    assert.equal(resolveClientIp('127.0.0.1', 'unknown'), '127.0.0.1');
    assert.equal(resolveClientIp('127.0.0.1', undefined), '127.0.0.1');
});

test('code lifetime and attempt budget stay explicit', () => {
    assert.equal(CODE_TTL_MS, 300000);
    assert.equal(MAX_CODE_ATTEMPTS, 5);
});
