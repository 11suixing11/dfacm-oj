'use strict';

const { lookup } = require('node:dns').promises;
const https = require('node:https');
const { isIP } = require('node:net');
const { AssistantError } = require('./protocol.cjs');

const RESPONSE_LIMIT = 1024 * 1024;

function ipv6Value(address) {
    const halves = address.split('::');
    if (halves.length > 2 || address.includes('.') || address.includes('%')) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const pieces = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    if (pieces.length !== 8 || pieces.some(piece => !/^[a-f0-9]{1,4}$/i.test(piece))) return null;
    return BigInt('0x' + pieces.map(piece => piece.padStart(4, '0')).join(''));
}

function isPublicAddress(address) {
    if (isIP(address) === 4) {
        const [a, b, c] = address.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224
            || a === 100 && b >= 64 && b <= 127
            || a === 169 && b === 254
            || a === 172 && b >= 16 && b <= 31
            || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)
            || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
            || a === 203 && b === 0 && c === 113);
    }
    if (isIP(address) !== 6) return false;
    const value = ipv6Value(address);
    const within = (network, bits) => value >> BigInt(128 - bits) === ipv6Value(network) >> BigInt(128 - bits);
    return value !== null && within('2000::', 3)
        && !within('2001::', 23) && !within('2001:db8::', 32)
        && !within('2002::', 16) && !within('3fff::', 20);
}

function blocked() { return new AssistantError('INVALID_PROVIDER', '供应商地址必须指向公网 HTTPS 服务。'); }

function publicLookup(lookupImpl = lookup) {
    return (hostname, options, callback) => {
        Promise.resolve().then(() => lookupImpl(hostname, { all: true, verbatim: true })).then((records) => {
            if (!Array.isArray(records) || !records.length
                || records.some(record => !isPublicAddress(record.address) || isIP(record.address) !== record.family)) {
                throw blocked();
            }
            // Return these exact validated addresses to the TLS socket. The
            // connection never performs a second, unchecked DNS resolution.
            if (options?.all) callback(null, records);
            else {
                const record = records.find(item => item.family === 4) || records[0];
                callback(null, record.address, record.family);
            }
        }).catch(error => callback(error));
    };
}

function createPublicFetch({ lookupImpl = lookup, requestImpl = https.request } = {}) {
    return async (endpoint, { method = 'POST', headers, body, signal } = {}) => {
        const url = new URL(endpoint);
        const host = url.hostname.replace(/^\[|\]$/g, '');
        if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search
            || isIP(host) && !isPublicAddress(host)) throw blocked();
        if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
        return new Promise((resolve, reject) => {
            let bodyFailure = null;
            const request = requestImpl(url, {
                method, headers, signal, agent: false, lookup: publicLookup(lookupImpl),
            }, (response) => {
                const status = response.statusCode || 502;
                if (status < 200 || status > 599) {
                    reject(new AssistantError('UPSTREAM_ERROR', '模型服务返回了无效状态，请检查供应商配置。', 502));
                    response.destroy();
                    return;
                }
                // No redirects: personal credentials stay at the chosen
                // endpoint. Error bodies are neither forwarded nor logged.
                if (status < 200 || status >= 300) {
                    resolve(new Response(null, { status }));
                    response.destroy();
                    return;
                }
                const headers = new Headers();
                if (typeof response.headers?.['content-type'] === 'string') headers.set('content-type', response.headers['content-type']);
                let streamController, settled = false;
                const abort = () => { fail(new DOMException('Request aborted', 'AbortError')); response.destroy(); };
                const cleanup = () => { signal?.removeEventListener('abort', abort); bodyFailure = null; };
                const stream = new ReadableStream({
                    start(controller) { streamController = controller; },
                    pull() { response.resume?.(); },
                    cancel() { settled = true; cleanup(); response.destroy(); },
                });
                let bytes = 0;
                function fail(error) { if (!settled) { settled = true; cleanup(); streamController.error(error); } }
                bodyFailure = fail;
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted) abort();
                response.on('data', (chunk) => {
                    bytes += chunk.length;
                    if (bytes > RESPONSE_LIMIT) {
                        fail(new AssistantError('INVALID_RESPONSE', '模型返回内容过长，请重试。', 502));
                        response.destroy();
                        return;
                    }
                    if (!settled) {
                        streamController.enqueue(Buffer.from(chunk));
                        if (streamController.desiredSize <= 0) response.pause?.();
                    }
                });
                response.on('error', fail);
                response.on('aborted', () => fail(new Error('Provider response interrupted')));
                response.on('close', () => { if (!settled) fail(new Error('Provider response interrupted')); });
                response.on('end', () => { if (!settled) { settled = true; cleanup(); streamController.close(); } });
                resolve(new Response(status === 204 || status === 205 ? null : stream, { status, headers }));
            });
            request.on('error', error => { if (bodyFailure) bodyFailure(error); else reject(error); });
            request.end(body);
        });
    };
}

const publicHttpsFetch = createPublicFetch();
module.exports = { isPublicAddress, publicLookup, createPublicFetch, publicHttpsFetch };
