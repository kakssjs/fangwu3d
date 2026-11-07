'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';

type Step = 'choose' | 'homeowner' | 'company' | 'login' | 'done';

type RegisterUser = {
  id: number;
  role: string;
  name: string;
  companyName?: string;
};

type HomeownerForm = {
  name: string;
  phone: string;
  email: string;
  password: string;
};

type CompanyForm = {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  license: string;
  qualifications: string;
  districts: string;
  serviceTypes: string;
  specialties: string;
};

/** 将逗号分隔字符串拆成去空的字符串数组 */
function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'flex-start',
  paddingTop: '6vh',
  paddingBottom: '4vh',
  overflowY: 'auto',
  justifyContent: 'center',
  zIndex: 99999,
};

const panelStyle: React.CSSProperties = {
  position: 'relative',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 32,
  maxWidth: 520,
  width: '90%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: 'var(--glow-cyan)',
};

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 14,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
};

const roleCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
  padding: '22px 18px',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  color: 'var(--text)',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'border-color 0.25s, box-shadow 0.25s',
};

const roleCardHoverStyle: React.CSSProperties = {
  borderColor: 'var(--accent)',
  boxShadow: 'var(--glow-cyan)',
};

export default function RegisterModal({
  mode = 'register',
  onClose,
  onSuccess,
}: {
  mode?: 'register' | 'login';
  onClose: () => void;
  onSuccess: (user: RegisterUser) => void;
}) {
  const [step, setStep] = useState<Step>(mode === 'login' ? 'login' : 'choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  const [doneUser, setDoneUser] = useState<RegisterUser | null>(null);
  const [hoveredCard, setHoveredCard] = useState<'homeowner' | 'company' | null>(null);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const [homeForm, setHomeForm] = useState<HomeownerForm>({
    name: '',
    phone: '',
    email: '',
    password: '',
  });

  const [coForm, setCoForm] = useState<CompanyForm>({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    license: '',
    qualifications: '',
    districts: '',
    serviceTypes: '',
    specialties: '',
  });

  function pickStep(next: Step) {
    setError('');
    setStep(next);
  }

  async function submitHomeowner(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'homeowner',
          name: homeForm.name,
          phone: homeForm.phone,
          email: homeForm.email,
          password: homeForm.password,
        }),
      });
      const data = (await res.json()) as { id?: number; role?: string; error?: string };
      if (!res.ok || typeof data.id !== 'number' || typeof data.role !== 'string') {
        setError(data.error ?? '注册失败，请稍后重试');
        return;
      }
      setDoneUser({ id: data.id, role: data.role, name: homeForm.name });
      setDoneMessage('注册成功！欢迎加入，发布装修需求，AI 立即为你生成全屋设计方案。');
      setStep('done');
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function submitCompany(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'company',
          name: coForm.name,
          companyName: coForm.companyName,
          phone: coForm.phone,
          email: coForm.email,
          license: coForm.license,
          qualifications: splitList(coForm.qualifications),
          districts: splitList(coForm.districts),
          serviceTypes: splitList(coForm.serviceTypes),
          specialties: splitList(coForm.specialties),
        }),
      });
      const data = (await res.json()) as { id?: number; role?: string; error?: string };
      if (!res.ok || typeof data.id !== 'number' || typeof data.role !== 'string') {
        setError(data.error ?? '提交失败，请稍后重试');
        return;
      }
      setDoneUser({ id: data.id, role: data.role, name: coForm.name });
      setDoneMessage('入驻申请已提交，平台审核通过后即可接单');
      setStep('done');
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginPhone }),
      });
      const data = (await res.json()) as { id?: number; role?: string; name?: string; companyName?: string; error?: string };
      if (!res.ok || typeof data.id !== 'number') {
        setError(data.error ?? '登录失败，请检查手机号是否已注册');
        return;
      }
      onSuccess({ id: data.id, role: data.role ?? 'homeowner', name: data.name ?? loginPhone, companyName: data.companyName });
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setLoginBusy(false);
    }
  }

  function handleDone() {
    if (doneUser) onSuccess(doneUser);
    else onClose();
  }

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="关闭"
          style={closeBtnStyle}
          onClick={onClose}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-dim)';
          }}
        >
          ×
        </button>

        <div className="panel-title" style={{ marginBottom: 22 }}>
          <span className="accent-bar" />
          {step === 'login' && '用户登录'}
          {step === 'choose' && '注册账号'}
          {step === 'homeowner' && '个人装修用户注册'}
          {step === 'company' && '装潢公司入驻'}
          {step === 'done' && '提交成功'}
        </div>

        {step === 'login' && (
          <form onSubmit={submitLogin}>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.7, margin: '0 0 18px' }}>
              使用注册时的手机号登录
            </p>
            <div className="form-group">
              <label>手机号</label>
              <input
                className="form-input"
                required
                type="tel"
                placeholder="请输入注册手机号"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
              />
            </div>
            {error && (
              <p style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: -6, marginBottom: 12 }}>{error}</p>
            )}
            <button disabled={loginBusy} className="btn btn-primary" style={{ width: '100%' }}>
              {loginBusy ? '登录中...' : '登录'}
            </button>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
              还没有账号？
              <button type="button" onClick={() => pickStep('choose')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0, marginLeft: 4 }}>
                立即注册
              </button>
            </p>
          </form>
        )}

        {step === 'choose' && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.7, margin: '0 0 18px' }}>
              选择你的身份，开启智能装修之旅
            </p>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', margin: '-8px 0 16px' }}>
              已有账号？
              <button type="button" onClick={() => pickStep('login')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0, marginLeft: 4 }}>
                直接登录
              </button>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <button
                type="button"
                style={hoveredCard === 'homeowner' ? { ...roleCardStyle, ...roleCardHoverStyle } : roleCardStyle}
                onClick={() => pickStep('homeowner')}
                onMouseEnter={() => setHoveredCard('homeowner')}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <span style={{ fontSize: 32, lineHeight: 1 }}>⌂</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>个人装修用户</span>
                <span style={{ fontSize: 12, color: 'var(--accent)', lineHeight: 1.6 }}>发布装修需求，获取AI设计方案</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                  输入户型与偏好，AI 生成全屋设计方案、报价与工期，并为你匹配靠谱装修队。
                </span>
              </button>
              <button
                type="button"
                style={hoveredCard === 'company' ? { ...roleCardStyle, ...roleCardHoverStyle } : roleCardStyle}
                onClick={() => pickStep('company')}
                onMouseEnter={() => setHoveredCard('company')}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <span style={{ fontSize: 32, lineHeight: 1 }}>◆</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>装潢公司</span>
                <span style={{ fontSize: 12, color: 'var(--accent3)', lineHeight: 1.6 }}>承接装修项目，精准获客</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                  入驻平台获取精准业主需求，按服务区域与擅长风格智能匹配优质项目，高效承接订单。
                </span>
              </button>
            </div>
          </div>
        )}

        {step === 'homeowner' && (
          <form onSubmit={submitHomeowner}>
            <div className="form-group">
              <label>姓名 *</label>
              <input
                className="form-input"
                required
                placeholder="请输入您的姓名"
                value={homeForm.name}
                onChange={(e) => setHomeForm({ ...homeForm, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>手机号 *</label>
              <input
                className="form-input"
                required
                type="tel"
                placeholder="请输入手机号"
                value={homeForm.phone}
                onChange={(e) => setHomeForm({ ...homeForm, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>邮箱（选填）</label>
              <input
                className="form-input"
                type="email"
                placeholder="用于接收设计方案通知"
                value={homeForm.email}
                onChange={(e) => setHomeForm({ ...homeForm, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>密码（选填）</label>
              <input
                className="form-input"
                type="password"
                placeholder="设置登录密码"
                value={homeForm.password}
                onChange={(e) => setHomeForm({ ...homeForm, password: e.target.value })}
              />
            </div>
            {error && (
              <p style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: -6, marginBottom: 12 }}>{error}</p>
            )}
            <button disabled={busy} className="btn btn-primary" style={{ width: '100%' }}>
              {busy ? '提交中…' : '注册并开始设计'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => pickStep('choose')}
            >
              返回上一步
            </button>
          </form>
        )}

        {step === 'company' && (
          <form onSubmit={submitCompany}>
            <div className="form-group">
              <label>联系人姓名 *</label>
              <input
                className="form-input"
                required
                placeholder="请输入联系人姓名"
                value={coForm.name}
                onChange={(e) => setCoForm({ ...coForm, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>公司名称 *</label>
              <input
                className="form-input"
                required
                placeholder="请输入公司全称"
                value={coForm.companyName}
                onChange={(e) => setCoForm({ ...coForm, companyName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>手机号 *</label>
              <input
                className="form-input"
                required
                type="tel"
                placeholder="请输入手机号"
                value={coForm.phone}
                onChange={(e) => setCoForm({ ...coForm, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>邮箱（选填）</label>
              <input
                className="form-input"
                type="email"
                placeholder="请输入邮箱"
                value={coForm.email}
                onChange={(e) => setCoForm({ ...coForm, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>营业执照号（选填）</label>
              <input
                className="form-input"
                placeholder="统一社会信用代码"
                value={coForm.license}
                onChange={(e) => setCoForm({ ...coForm, license: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>资质证书（选填，逗号分隔）</label>
              <input
                className="form-input"
                placeholder="如：建筑装修装饰工程专业承包二级,ISO9001"
                value={coForm.qualifications}
                onChange={(e) => setCoForm({ ...coForm, qualifications: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>服务区域（选填，逗号分隔）</label>
              <input
                className="form-input"
                placeholder="如：徐汇区,浦东新区,长宁区"
                value={coForm.districts}
                onChange={(e) => setCoForm({ ...coForm, districts: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>承接类型（选填，逗号分隔）</label>
              <input
                className="form-input"
                placeholder="如：全包,半包,清包"
                value={coForm.serviceTypes}
                onChange={(e) => setCoForm({ ...coForm, serviceTypes: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>擅长风格（选填，逗号分隔）</label>
              <input
                className="form-input"
                placeholder="如：现代简约,北欧,轻奢"
                value={coForm.specialties}
                onChange={(e) => setCoForm({ ...coForm, specialties: e.target.value })}
              />
            </div>
            {error && (
              <p style={{ color: 'var(--accent-danger)', fontSize: 13, marginTop: -6, marginBottom: 12 }}>{error}</p>
            )}
            <button disabled={busy} className="btn btn-primary" style={{ width: '100%' }}>
              {busy ? '提交中…' : '提交入驻申请'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => pickStep('choose')}
            >
              返回上一步
            </button>
          </form>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
            <div style={{ fontSize: 42, lineHeight: 1, marginBottom: 18, color: 'var(--accent3)' }}>✓</div>
            <div style={{ marginBottom: 16 }}>
              <span className="tag tag-green" style={{ fontSize: 13, padding: '8px 16px' }}>
                ✓ 成功
              </span>
            </div>
            <p style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.8, margin: '0 0 26px' }}>{doneMessage}</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleDone}>
              进入工作台
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
