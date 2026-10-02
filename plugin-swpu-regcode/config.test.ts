import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRedirect, positiveLimit } from './config.ts';

test('redirects accept local routes and reject external URLs, controls and backslashes', () => {
    assert.equal(localRedirect('/training?group=2026', '/'), '/training?group=2026');
    for (const value of ['//evil.example', 'https://evil.example', '/\\evil.example', '/\nevil', 1, null]) {
        assert.equal(localRedirect(value, '/training'), '/training');
    }
});

test('rate defaults cannot become negative, non-finite or unlimited by accident', () => {
    assert.equal(positiveLimit('300', 200), 300);
    for (const value of [0, -1, NaN, Infinity, 1.5, 'abc', 100001, undefined]) {
        assert.equal(positiveLimit(value, 200), 200);
    }
});
