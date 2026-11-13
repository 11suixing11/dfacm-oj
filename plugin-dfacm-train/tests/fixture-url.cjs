'use strict';

// Deliberate root-domain URL fixture for pure DTO unit tests. Production callers
// must supply Hydro's handler.url and may never fall back to this function.
function fixtureUrl(name, args = {}) {
    const base = ({ training_detail: `/training/${encodeURIComponent(args.tid)}`,
        problem_detail: `/p/${encodeURIComponent(args.pid)}`,
        record_detail: `/record/${encodeURIComponent(args.rid)}` })[name];
    if (!base) throw new Error(`unknown test route ${name}`);
    return base + (args.query ? '?' + new URLSearchParams(args.query) : '');
}
module.exports = { fixtureUrl };
