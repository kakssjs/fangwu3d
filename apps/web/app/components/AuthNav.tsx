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
  }, []);

  function handleSuccess(u: { id: number; role: string; name: string; companyName?: string }) {
    setUser(u);
    localStorage.setItem('user', JSON.stringify(u));
    setModalMode(null);
    // 按角色跳转到对应控制台
    router.push(u.role === 'company' ? '/contractor' : '/dashboard');
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('user');
    router.push('/');
  }

  if (user) {
    const consoleHref = user.role === 'company' ? '/contractor' : '/dashboard';
    const consoleLabel = user.role === 'company' ? '公司后台' : '我的工作台';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href={consoleHref} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
          {consoleLabel}
        </Link>
        <span className="tag tag-cyan" style={{ fontSize: 11 }}>
          {user.role === 'company' ? '装潢公司' : '个人用户'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text)' }}>{user.companyName ?? user.name}</span>
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
