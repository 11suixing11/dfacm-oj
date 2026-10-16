export interface LoginUser {
    _id: number;
    _loginip?: string;
    tfa?: boolean;
    authn?: boolean;
    hasPriv(privilege: number): boolean;
}

export interface LoginPolicy {
    enabled: boolean;
    contestMode: unknown;
    ip: string;
    profilePrivilege: number;
    editSystemPrivilege: number;
    hasOtherUserAtIp(uid: number, ip: string): Promise<boolean>;
}

// This endpoint cannot collect a second factor without changing the existing UI.
// Accounts using one must use Hydro's native password / passkey login instead.
export async function loginPolicyFailure(user: LoginUser | null | undefined, policy: LoginPolicy): Promise<string | null> {
    if (!user) return '账号不存在，请联系管理员或重新注册。';
    if (!policy.enabled) return '当前已关闭站内登录。';
    if (!user.hasPriv(policy.profilePrivilege)) return '该账号已被禁用，请联系管理员。';
    if (user.tfa || user.authn) return '该账号已启用两步验证或通行密钥，请使用原生登录页面。';
    if (policy.contestMode && !user.hasPriv(policy.editSystemPrivilege)) {
        if (user._loginip && user._loginip !== policy.ip) return '比赛模式下该账号已绑定其他 IP，请联系管理员。';
        if (policy.contestMode === 'strict' && await policy.hasOtherUserAtIp(user._id, policy.ip)) {
            return '比赛模式下当前 IP 已绑定其他账号，请联系管理员。';
        }
    }
    return null;
}
