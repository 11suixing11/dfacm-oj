import { Context, Handler, Logger, PRIV, TrainingModel } from 'hydrooj';

const { readFilters, filterClauses, withoutOwnClauses, buildCatalog } = require('./catalog.cjs');
const logger = new Logger('swpu-train-catalog');

export function registerTrainingCatalog(ctx: Context) {
    const requests = new WeakMap<Handler, any>();
    // Native TrainingMain awaits this event before counting and paginating.
    // Add constraints to its query so search and filters cover ALL pages, and
    // retain constraints added by other addons (including visibility rules).
    ctx.on('training/list', async (query: any, handler: Handler) => {
        const member = handler.user.hasPriv(PRIV.PRIV_USER_PROFILE);
        const filters = readFilters(handler.request.query, member);
        const statuses = filters.view === 'all' ? [] : await TrainingModel.getMultiStatus(handler.args.domainId,
            { uid: handler.user._id, enroll: 1 }).toArray();
        const own = filterClauses(filters, statuses);
        if (own.length) query.$and = [...(query.$and || []), ...own];
        requests.set(handler, { query, own, filters, member });
    });
    ctx.on('handler/after/TrainingMain#get', async (handler: Handler) => {
        const state = requests.get(handler);
        if (!state || handler.request.json || handler.response.template !== 'training_main.html') return;
        // Native training_main passes body.qs to its paginator but does not
        // populate it. Keep search and filters on every page, including when
        // the optional facet lookup fails. Preserve other addons' parameters.
        const qs = new URLSearchParams(handler.response.body.qs || '');
        qs.delete('page');
        for (const [key, value] of Object.entries({ q: handler.response.body.q || '', ...state.filters })) {
            if (value && !(key === 'view' && value === 'all')) qs.set(key, String(value));
            else qs.delete(key);
        }
        handler.response.body.qs = qs.toString();
        handler.response.addHeader('Cache-Control', 'private, no-store');
        try {
            const { tdocs, tsdict, q, page, tpcount } = handler.response.body;
            // Only fetch IDs and titles for facets. The enhanced list remains
            // paginated; keep native enrollment-sidebar loading unchanged.
            const docs = await TrainingModel.getMulti(handler.args.domainId,
                withoutOwnClauses(state.query, state.own)).project({ docId: 1, title: 1 }).toArray();
            handler.UiContext.dfacmCatalog = buildCatalog({ docs, items: tdocs, statuses: tsdict,
                filters: state.filters, member: state.member, q, page, pages: tpcount,
                url: handler.url('training_main') });
        } catch (error) {
            // The ordinary native list and its links stay usable on failure.
            logger.error('training catalogue unavailable:', error);
        }
    });
}
