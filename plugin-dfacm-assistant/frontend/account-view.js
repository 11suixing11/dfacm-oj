'use strict';

const { personalProvider } = require('../provider-config.cjs');

function localPath(value) {
    return typeof value === 'string' && /^\/(?![\\/])/.test(value) && !/[\\\x00-\x20\x7f]/.test(value);
}

function publicAccount(value, uid) {
    const fields = ['uid', 'configured', 'hasKey', 'provider', 'baseUrl', 'model', 'revision', 'updatedAt'];
    if (!value || value.uid !== uid || Object.keys(value).some(name => !fields.includes(name))
        || typeof value.configured !== 'boolean' || value.hasKey !== value.configured
        || typeof value.revision !== 'string' || (value.configured ? !/^[a-f0-9]{32}$/.test(value.revision) : value.revision !== '')
        || value.updatedAt !== null && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))) {
        throw new Error('账户配置响应不完整或会话已变化，请刷新页面。');
    }
    try {
        const checked = personalProvider({ ...value, apiKey: 'public-metadata-check' });
        if (checked.baseUrl !== value.baseUrl || checked.model !== value.model) throw new Error();
    } catch { throw new Error('账户配置响应不完整，请刷新页面。'); }
    return Object.fromEntries(fields.map(name => [name, value[name]]));
}

module.exports = { localPath, publicAccount };
