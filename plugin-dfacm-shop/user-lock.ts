// Shared by every shop/title mutation in this Node process. This is NOT a
// cross-worker lock: multi-worker deployment requires persistent coordination.
// Acquire the UID lock before the title mint lock; never reacquire a UID lock
// from inside a locked callback or call another locking public entry point.
const userLocks = new Map<number, Promise<unknown>>();

export function pendingLockCount() {
    return userLocks.size;
}

export async function withUserLock<T>(uid: number, work: () => Promise<T>): Promise<T> {
    const previous = userLocks.get(uid) || Promise.resolve();
    // A failed operation must not poison the next request for this member.
    const run = previous.then(work, work);
    const tracked = run.catch(() => undefined);
    userLocks.set(uid, tracked);
    try {
        return await run;
    } finally {
        // A later waiter owns the slot until it completes. Only the last
        // request may release it, including when the request was rejected.
        if (userLocks.get(uid) === tracked) userLocks.delete(uid);
    }
}
