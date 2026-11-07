import { NextResponse } from 'next/server';
import { getUserByPhone, setUserPasswordHash } from '@i-renovation/shared';
import { checkBossLogin, checkPassword, hashPassword, setSessionCookie, type Role } from '@/lib/auth';

const WRONG = '手机号或密码错误';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { phone?: string; password?: string };
    const phone = (body.phone ?? '').trim();
    const password = body.password ?? '';
    if (!phone) return NextResponse.json({ error: '请填写手机号' }, { status: 400 });
    if (!password) return NextResponse.json({ error: '请填写密码' }, { status: 400 });

    // 老板账号（.env.local 中的 BOSS_PHONE / BOSS_PASSWORD）
    const boss = checkBossLogin(phone, password);
    if (boss !== null) {
      if (!boss) return NextResponse.json({ error: WRONG }, { status: 401 });
      const res = NextResponse.json({ id: 0, role: 'boss', name: '平台老板' });
      setSessionCookie(res, 0, 'boss');
      return res;
    }

    const user = await getUserByPhone(phone);
    // 旧版本创建的账号没有密码：告诉用户怎么办，而不是只说「密码错误」
    if (user && !user.passwordHash) {
      return NextResponse.json({ error: '这个账号是旧版本创建的，还没有设置密码。请点「注册」，用同一手机号和同一身份设置一个密码。' }, { status: 401 });
    }
    const check = checkPassword(password, user?.passwordHash);
    if (!user || !check.ok) return NextResponse.json({ error: WRONG }, { status: 401 });
    // 旧账号的明文密码：登录成功后改存哈希
    if (check.legacy) await setUserPasswordHash(user.id, hashPassword(password));

    const res = NextResponse.json({
      id: user.id,
      role: user.role,
      name: user.name,
      companyName: user.companyName ?? undefined,
    });
    setSessionCookie(res, user.id, user.role as Role);
    return res;
  } catch (e) {
    console.error('login error:', (e as Error).message);
    return NextResponse.json({ error: '登录失败' }, { status: 500 });
  }
}
