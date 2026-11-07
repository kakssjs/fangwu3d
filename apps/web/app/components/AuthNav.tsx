'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import RegisterModal from './RegisterModal';

export default function AuthNav() {
  const router = useRouter();
  const [modalMode, setModalMode] = useState<'register' | 'login' | null>(null);
  const [user, setUser] = useState<{ id: number; role: string; name: string; companyName?: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) { try { setUser(JSON.parse(saved)); } catch {} }
    // 以服务端会话为准：Cookie 过期或失效时，清掉浏览器里记住的账号
    fetch('/api/auth/me').then(res => {
      if (res.status === 401) { setUser(null); localStorage.removeItem('user'); }
    }).catch(() => {});
  }, []);

  function handleSuccess(u: { id: number; role: string; name: string; companyName?: string }) {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
    setModalMode(null);
    // 按角色跳转到对应控制台
    router.push(u.role === 'boss' ? '/boss' : u.role === 'company' ? '/contractor' : '/dashboard');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    localStorage.removeItem('user');
    router.push('/');
  }

  if (user) {
    const consoleHref = user.role === 'boss' ? '/boss' : user.role === 'company' ? '/contractor' : '/dashboard';
    const consoleLabel = user.role === 'boss' ? '老板控制台' : user.role === 'company' ? '公司后台' : '我的工作台';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href={consoleHref} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
          {consoleLabel}
        </Link>
        <span className="tag tag-cyan" style={{ fontSize: 11 }}>
          {user.role === 'boss' ? '平台老板' : user.role === 'company' ? '装潢公司' : '个人用户'}
        </span>
        <span className="user-name">{user.companyName ?? user.name}</span>
        <button onClick={logout} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>退出</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <button data-auth="login" onClick={() => setModalMode('login')} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>
          登录
        </button>
        <button data-auth="register" onClick={() => setModalMode('register')} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
          注册
        </button>
      </div>
      {modalMode && <RegisterModal mode={modalMode} onClose={() => setModalMode(null)} onSuccess={handleSuccess} />}
    </>
  );
}
