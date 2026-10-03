# Upstream issue draft: TypeError on malformed request bodies with `@post` decorators

File this against **hydro-dev/Hydro** (framework `@hydrooj/framework` decorators).
Ready to paste; adjust the version numbers after checking the deployed build.

---

**Title:** `@post`-decorated handler throws `TypeError` (500) instead of a
validation error when `request.body` is undefined (e.g. an unusable
`Content-Type`)

**Hydro version:** hydrooj 5.0.7 / @hydrooj/framework (as shipped with it)
**Node version:** v22 (nix profile from the official installer)

## Steps to reproduce

```bash
# A handler with @post params, e.g. a POST-only endpoint:
curl -s -X POST \
  -H 'Content-Type:' \
  -d 'mail=x@example.com&purpose=login' \
  http://127.0.0.1:8888/d/system/reg/code
```

Any request whose body Koa fails to parse (empty `Content-Type` header, or a
`Content-Type` Koa's body parser rejects) reaches the decorator wrapper with
`request.body === undefined`.

## What happens

`@hydrooj/framework/decorators.ts`, inside the generated `validate` wrapper:

```js
const src = item.source === 'all'
    ? rawArgs
    : ...
        : this.request.body;   // <- undefined when the body was not parsed
const value = src[item.name];  // TypeError: Cannot read properties of undefined
```

The `TypeError` propagates as a 500 `Hydro System Error` page (and for JSON
clients a 500 response), producing these log lines:

```
server [E] User: 0(Guest) post: /d/system/reg/code Cannot read properties of undefined (reading 'mail') undefined
server [E] TypeError: Cannot read properties of undefined (reading 'mail')
```

## Expected

A `ValidationError` / `BadRequestError` with HTTP 400 — the same shape as any
other missing-field case. Suggested guard inside the wrapper before reading
`src`:

```js
const src = item.source === 'all' ? rawArgs
    : item.source === 'get' ? this.request.query
    : item.source === 'route' ? { ...this.request.params, domainId: this.args.domainId }
    : (this.request.body || {});
```

## Impact

Any Hydro site with `@post`-decorated endpoints can be made to log a stack
trace per request by sending an unparseable body — log noise and a 500 where
a 4xx belongs. No data exposure; the response only contains the TypeError
message.

## Workaround (site-side)

None needed for normal browsers (they always send a parseable Content-Type);
API consumers should send `application/x-www-form-urlencoded` or valid JSON.
