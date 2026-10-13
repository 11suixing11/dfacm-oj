/* plugin-linuxdo-oauth — linux.do Connect 第三方登录（d&f算法网）
 *
 * 走 Hydro 原生 OAuth 通道（ctx.oauth.provide），接口形状与 login-with-github 对齐：
 * Service 类 + TokenModel state 防伪 + superagent HTTP。
 *
 * 启用：系统设置 linuxdo.client_id / linuxdo.client_secret（/manage/setting 或 mongo），
 * pm2 restart 后 /reg 页面自动出现 linux.do 按钮。
 * 回调地址填 https://dfacm.website/oauth/linuxdo/callback
 */
import {
    Context, Handler, Service, SystemModel,
    TokenModel, UserFacingError, ValidationError,
} from 'hydrooj';

const AUTH_URL = 'https://connect.linux.do/oauth2/authorize';
const TOKEN_URL = 'https://connect.linux.do/oauth2/token';
const USER_URL = 'https://connect.linux.do/api/user';
// eslint-disable-next-line max-len
const icon = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';

interface LinuxdoUser {
    id: number;
    username: string;
    name?: string;
    email?: string;
    active?: boolean;
    trust_level?: number;
}

export default class LinuxdoService extends Service {
    static inject = ['oauth'];

    constructor(ctx: Context) {
        super(ctx, 'oauth.linuxdo');
        const clientId = SystemModel.get('linuxdo.client_id');
        const clientSecret = SystemModel.get('linuxdo.client_secret');
        if (!clientId || !clientSecret) {
            // 未配置时不注册——不渲染死按钮（reg.html 的 oauthEntries 会过滤）
            return;
        }
        ctx.oauth.provide('linuxdo', {
            text: '使用 linux.do 登录',
            name: 'linux.do',
            icon,
            canRegister: true,
            callback: async function callback({ state, code }) {
                const s = await TokenModel.get(state, TokenModel.TYPE_OAUTH);
                if (!s) throw new ValidationError('token');
                const url = SystemModel.get('server.url');
                // linux.do Connect requires HTTP Basic auth for the token
                // endpoint (RFC 6749 §2.3.1) — body credentials alone get 401.
                // Cloudflare fronts connect.linux.do and rejects the default
                // Hydro UA with 403 (superagent surfaces this as Unauthorized)
                // — a browser UA is required for server-to-server calls.
                const redirectUri = `${url}oauth/linuxdo/callback`;
                // Native fetch, not superagent: superagent serializes .send()
                // objects as JSON bodies (Content-Type: application/json), and
                // linux.do Connect's token endpoint only understands
                // application/x-www-form-urlencoded — a JSON body gets an HTML
                // error page whose body parses as {} ("no access_token").
                // Native fetch with URLSearchParams sends the form body and
                // returns the real JSON error (invalid_grant / ...).
                const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
                const tokenResp = await fetch(TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                        'User-Agent': browserUA,
                    },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri,
                    }).toString(),
                });
                const tokenData = await tokenResp.json() as Record<string, string>;
                if (tokenData.error) {
                    throw new UserFacingError(
                        tokenData.error, tokenData.error_description, tokenData.error_uri,
                    );
                }
                const t = tokenData.access_token;
                if (!t) throw new UserFacingError('linuxdo token exchange failed: no access_token');
                const userInfo = await fetch(USER_URL, {
                    headers: {
                        Authorization: `Bearer ${t}`,
                        Accept: 'application/json',
                        'User-Agent': browserUA,
                    },
                });
                const user = await userInfo.json() as LinuxdoUser;
                if (!user.id || !user.username) {
                    throw new UserFacingError('linuxdo user response incomplete');
                }
                await TokenModel.del(s._id, TokenModel.TYPE_OAUTH);
                // Hydro 要求返回 email；linux.do 用户可能未公开邮箱——用固定
                // 占位域保证字段存在（该邮箱不会收信，验证码登录不受影响）。
                const ret = {
                    _id: `linuxdo:${user.id}`,
                    uname: [user.name, user.username].filter((i) => i),
                    email: user.email || `${user.id}@linuxdo.connect`,
                    avatar: `linuxdo:${user.id}`,
                    bio: user.name || '',
                };
                return ret;
            },
            get: async function get(this: Handler) {
                const [state] = await TokenModel.add(TokenModel.TYPE_OAUTH, 600, { redirect: this.request.referer });
                const params = new URLSearchParams({
                    client_id: clientId,
                    response_type: 'code',
                    state,
                    redirect_uri: `${SystemModel.get('server.url')}oauth/linuxdo/callback`,
                    scope: 'read',
                });
                this.response.redirect = `${AUTH_URL}?${params.toString()}`;
            },
        });
    }
}
