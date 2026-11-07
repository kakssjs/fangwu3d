import './globals.css';
import Link from 'next/link';
import AuthNav from './components/AuthNav';

export const metadata = {
  title: 'I Renovation · AI 装修智能体平台',
  description: '上传户型图 → AI 出图 · 报价 · 匹配装修队 — 一人公司 OPC 智能体系统',
  icons: { icon: '/brand/icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <Link href="/" className="topbar-brand">
            <div className="brand-icon"><img src="/brand/icon.png" alt="" /></div>
            <span>I Renovation</span>
            <span className="tag tag-brand">OPC</span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <AuthNav />
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
