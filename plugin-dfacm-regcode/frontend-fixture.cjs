const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML, DOMParser } = require('linkedom');

// Execute the shipped page in a real DOM. Only browser navigation, network,
// storage and timers are local substitutes; removal and visibility remain real.
function realPage({ markup = fs.readFileSync(path.join(__dirname, 'reg.html'), 'utf8'),
    returnTo = '', embed = false, boot, fetchImpl } = {}) {
    const { document, window: domWindow } = parseHTML(markup);
    const requests = [], messages = [], pending = [], timers = new Map();
    let timerId = 0;
    for (const element of document.querySelectorAll('*')) {
        const add = element.addEventListener.bind(element);
        element.addEventListener = (type, listener, options) => add(type, function(event) {
            const result = listener.call(this, event);
            if (result && typeof result.then === 'function') pending.push(result);
        }, options);
    }
    const location = new Proxy(new URL('https://oj.example/reg' + (returnTo ? '?return=' + encodeURIComponent(returnTo) : '')), {
        get: (url, key) => { const value = Reflect.get(url, key, url); return typeof value === 'function' ? value.bind(url) : value; },
        set: (url, key, value) => Reflect.set(url, key, key === 'href' ? new URL(value, url).href : value, url),
    });
    const window = { addEventListener() {} };
    window.self = window; window.top = embed ? {} : window;
    const context = vm.createContext({
        document, window, location, URL, URLSearchParams, DOMParser, AbortController,
        localStorage: { getItem() { return null; }, setItem() {} },
        parent: { postMessage: (data, origin) => messages.push({ data, origin }) },
        setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: (id) => timers.delete(id), setInterval: () => ++timerId, clearInterval() {},
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (!fetchImpl) throw new Error('No network configured for this fixture');
            return fetchImpl(url, options);
        },
    });
    const scripts = [...markup.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    vm.runInContext(scripts[0], context);
    if (boot) Object.assign(window.__SWPU_BOOT, boot);
    for (const script of scripts.slice(1)) vm.runInContext(script, context);
    const $ = (id) => document.getElementById(id);
    async function dispatch(id, type) {
        $(id).dispatchEvent(new domWindow.Event(type, { bubbles: true, cancelable: true }));
        await Promise.all(pending.splice(0));
    }
    return { document, $, requests, messages, location, timers,
        click: (id) => dispatch(id, 'click'), submit: (id) => dispatch(id, 'submit') };
}

function visible(element) {
    if (!element || !element.isConnected) return false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        if (node.hidden || node.localName === 'noscript'
            || (node.classList.contains('pane') && !node.classList.contains('on'))) return false;
    }
    return true;
}

module.exports = { realPage, visible };
