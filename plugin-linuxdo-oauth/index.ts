/* plugin-linuxdo-oauth — linux.do Connect 第三方登录（d&f算法网）
 *
 * linux.do Connect 是 OAuth 2.0 授权码流程（https://connect.linux.do）。
 * 本插件走 Hydro 原生 OAuth 通道（ctx.oauth.provide），不 fork 不改引擎：
 * 配置两个系统设置键即可启用：
 *   linuxdo.client_id     — Connect 应用的 Client ID
 *   linuxdo.client_secret — Connect 应用的 Client Secret
 * 回调地址填 https://dfacm.website/oauth/linuxdo/callback
 */
import { Context, SystemModel } from 'hydrooj';

const AUTH_URL = 'https://connect.linux.do/oauth2/authorize';
const TOKEN_URL = 'https://connect.linux.do/oauth2/token';
const USER_URL = 'https://connect.linux.do/api/user';

interface LinuxdoUser {
    id: number;
    username: string;
    name?: string;
    email?: string;
    avatar_url?: string;
}

export const inject = [];

export async function apply(ctx: Context) {
    const clientId = SystemModel.get('linuxdo.client_id');
    const clientSecret = SystemModel.get('linuxdo.client_secret');
    if (!clientId || !clientSecret) {
        // 未配置时不注册——不渲染死按钮（reg.html 的 oauthEntries 会过滤）
        return;
    }
    ctx.oauth.provide('linuxdo', {
        text: '使用 linux.do 登录',
        icon: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
        async getAuthUrl(redirect: string) {
            const params = new URLSearchParams({
                client_id: clientId,
                response_type: 'code',
                redirect_uri: `${SystemModel.get('server.url')}oauth/linuxdo/callback`,
                scope: 'read',
            });
            return `${AUTH_URL}?${params.toString()}`;
        },
        async getUserInfo(code: string) {
            const tokenResp = await fetch(TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    redirect_uri: `${SystemModel.get('server.url')}oauth/linuxdo/callback`,
                }),
            });
            if (!tokenResp.ok) throw new Error(`linuxdo token exchange failed: ${tokenResp.status}`);
            const tokenData = await tokenResp.json();
            const accessToken = tokenData.access_token;
            if (!accessToken) throw new Error('linuxdo token response missing access_token');

            const userResp = await fetch(USER_URL, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!userResp.ok) throw new Error(`linuxdo user info failed: ${userResp.status}`);
            const user = await userResp.json() as LinuxdoUser;
            if (!user.id || !user.username) throw new Error('linuxdo user response incomplete');

            return {
                _id: `linuxdo:${user.id}`,
                uname: user.username,
                mail: user.email || `${user.id}@linuxdo.connect`,
                avatar: user.avatar_url || '',
                bio: user.name || '',
            };
        },
    });
}
