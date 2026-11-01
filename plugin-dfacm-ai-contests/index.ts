import { Context, Logger } from 'hydrooj';

const logger = new Logger('dfacm-ai-contests');

// Retained for old installation packages. Public UI and compatibility routes
// now belong to swpu-calendar; this collector never injects a second menu.
export function apply(_ctx: Context) {
    logger.info('AI collector uses the unified /calendar addon');
}
