'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const GALLERY = [
  { src: '/images/gallery/modern-living.jpg', label: '现代简约', en: 'Modern' },
  { src: '/images/gallery/nordic-bedroom.jpg', label: '北欧风', en: 'Nordic' },
  { src: '/images/gallery/industrial-kitchen.jpg', label: '工业风', en: 'Industrial' },
  { src: '/images/gallery/chinese-classic.jpg', label: '新中式', en: 'Chinese' },
  { src: '/images/gallery/japanese-zen.jpg', label: '日式禅意', en: 'Zen' },
  { src: '/images/gallery/luxury-villa.jpg', label: '轻奢别墅', en: 'Luxury' },
  { src: '/images/gallery/french-elegant.jpg', label: '法式优雅', en: 'French' },
  { src: '/images/gallery/coastal-breeze.jpg', label: '地中海', en: 'Coastal' },
];

const N = GALLERY.length;
const BASE_ANGLE = 360 / N;
const CARD_W = 280;
const CARD_H = 340;
const RADIUS = Math.round(CARD_W / (2 * Math.tan(Math.PI / N)));

function KineticWords({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const words = text.split(/(\s+)/);
  let ai = 0;
  return (
    <span className={'kinetic-wrap ' + className}>
      {words.map((w, i) => {
        if (/^\s+$/.test(w)) return <span key={i}>{w}</span>;
        const idx = ai++;
        return (
          <span key={i} className="kinetic-mask">
            <span className="kinetic-word" style={{ animationDelay: delay + idx * 0.08 + 's' }}>{w}</span>
          </span>
        );
      })}
    </span>
  );
}

function KineticChars({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  let ai = 0;
  return (
    <span className={'kinetic-wrap ' + className}>
      {Array.from(text).map((ch, i) => {
        if (/\s/.test(ch)) return <span key={i}>{ch}</span>;
        const idx = ai++;
        return (
          <span key={i} className="kinetic-mask">
            <span className="kinetic-word" style={{ animationDelay: delay + idx * 0.05 + 's' }}>{ch}</span>
          </span>
        );
      })}
    </span>
  );
}

function Ticker() {
  const items = 'AI DESIGN · 3D RENDER · SMART QUOTE · CONTRACTOR MATCH · OPC PLATFORM · FLOOR PLAN · ';
  return (
    <div className="ticker-strip">
      <div className="ticker-track">{items + items}</div>
    </div>
  );
}

function Preloader({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(1);
  const [fade, setFade] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const iv = setInterval(() => setImgIdx(p => (p + 1) % GALLERY.length), 550);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let v = 1;
    const iv = setInterval(() => {
      v = Math.min(100, v + (v > 85 ? 2 : 6));
      setPct(v);
      if (v >= 100) {
        clearInterval(iv);
        setFade(true);
        setTimeout(() => onDoneRef.current?.(), 500);
      }
    }, 55);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="preloader" style={{ opacity: fade ? 0 : 1, pointerEvents: fade ? 'none' : 'auto' }}>
      <img src={GALLERY[imgIdx].src} alt="" className="preloader-img" style={{ filter: `blur(${(pct / 100) * 18}px)` }} />
      <div className="preloader-counter">{pct}%</div>
    </div>
  );
}

function FunnelInput() {
  const [step, setStep] = useState<1 | 2>(1);
  const [budget, setBudget] = useState('');
  const [contact, setContact] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 2) setTimeout(() => inputRef.current?.focus(), 100);
  }, [step]);

  const budgetValid = budget.length >= 2;
  const contactValid = contact.length >= 5;

  function handleSubmit() {
    setSubmitted(true);
    setTimeout(() => {
      document.getElementById('new-project')?.scrollIntoView({ behavior: 'smooth' });
    }, 400);
  }

  if (submitted) {
    return (
      <div className="funnel-done">
        <div className="funnel-check">&#10003;</div>
        <div className="funnel-done-text">需求已记录</div>
        <div className="funnel-done-sub">预算: &yen;{budget} &nbsp;&middot;&nbsp; 联系: {contact}</div>
      </div>
    );
  }

  return (
    <div className="funnel-box" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        type="text"
        className="funnel-input"
        value={step === 1 ? budget : contact}
        onChange={e => step === 1 ? setBudget(e.target.value) : setContact(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            if (step === 1 && budgetValid) setStep(2);
            else if (step === 2 && contactValid) handleSubmit();
          }
        }}
        placeholder={step === 1 ? '输入装修预算' : '手机号 / 邮箱'}
        inputMode={step === 1 ? 'decimal' : 'text'}
        aria-label={step === 1 ? '装修预算' : '联系方式'}
      />
      <div className="funnel-display">
        {step === 1 ? (
          <span className={budget ? 'funnel-val' : 'funnel-ph'}>
            {budget ? <>&yen; {budget}</> : 'your budget'}
          </span>
        ) : (
          <span className={contact ? 'funnel-val' : 'funnel-ph'}>{contact || 'your contact'}</span>
        )}
        <span className={'funnel-cursor' + (focused ? ' blink' : '')} />
      </div>
      {((step === 1 && budgetValid) || (step === 2 && contactValid)) && (
        <button
          className="funnel-btn"
          onClick={e => { e.stopPropagation(); if (step === 1) setStep(2); else handleSubmit(); }}
        >
          {step === 1 ? '下一步 →' : '提交 →'}
        </button>
      )}
    </div>
  );
}

export default function LeadHero() {
  const [preloaderDone, setPreloaderDone] = useState(false);
  const handlePreloaderDone = useCallback(() => setPreloaderDone(true), []);
  const [rotationY, setRotationY] = useState(0);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0.12);
  const prevRotRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRot = useRef(0);
  const lastDragX = useRef(0);
  const lastDragTime = useRef(0);
  const targetRotRef = useRef<number | null>(null);

  const animTick = useCallback(() => {
    if (draggingRef.current) {
      // handled by pointer move
    } else if (targetRotRef.current !== null) {
      const diff = targetRotRef.current - rotationRef.current;
      if (Math.abs(diff) < 0.1) {
        rotationRef.current = targetRotRef.current;
        targetRotRef.current = null;
        velocityRef.current = 0;
      } else {
        const s = diff * 0.1;
        rotationRef.current += s;
        velocityRef.current = s;
      }
    } else {
      const autoSpeed = 0.15;
      velocityRef.current += (autoSpeed - velocityRef.current) * 0.02;
      rotationRef.current += velocityRef.current;
    }
    setRotationY(rotationRef.current);
    requestAnimationFrame(animTick);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(animTick);
    return () => cancelAnimationFrame(id);
  }, [animTick]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetRotRef.current = null;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      velocityRef.current = velocityRef.current * 0.5 + (-delta * 0.06) * 0.5;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        targetRotRef.current = rotationRef.current + BASE_ANGLE;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        targetRotRef.current = rotationRef.current - BASE_ANGLE;
      }
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    targetRotRef.current = null;
    dragStartX.current = e.clientX;
    dragStartRot.current = rotationRef.current;
    lastDragX.current = e.clientX;
    lastDragTime.current = Date.now();
    velocityRef.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartX.current;
    rotationRef.current = dragStartRot.current + dx * 0.22;
    const now = Date.now();
    const dt = now - lastDragTime.current;
    if (dt > 0) {
      velocityRef.current = ((e.clientX - lastDragX.current) * 0.22) / (dt / 16.666);
    }
    lastDragX.current = e.clientX;
    lastDragTime.current = now;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    velocityRef.current = Math.max(-12, Math.min(12, velocityRef.current));
  };

  const instantVel = rotationRef.current - prevRotRef.current;
  prevRotRef.current = rotationRef.current;

  return (
    <div className="lead-hero">
      {!preloaderDone && <Preloader onDone={handlePreloaderDone} />}

      <Ticker />

      <div className="lead-hero-content">
        <div className="lead-badge">JUNCTION CHINA 2026 &middot; OPC &middot; 一人公司</div>
        <h1 className="lead-title">
          <KineticWords text="AI 装修智能体" />
          <br />
          <KineticChars text="全链路闭环" delay={0.4} className="serif-italic" />
        </h1>
        <p className="lead-sub">上传户型图 &rarr; AI 出图 &middot; 报价 &middot; 匹配装修队</p>
        <FunnelInput />
      </div>

      <div className="carousel-scene">
        <div
          className="carousel-ring"
          style={{ transform: `rotateY(${rotationY}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {GALLERY.map((item, i) => {
            const angle = i * BASE_ANGLE;
            let diff = (angle + rotationY) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            const visible = Math.abs(diff) <= 90;
            return (
              <div
                key={i}
                className="carousel-card"
                style={{
                  transform: `rotateY(${angle}deg) translateZ(${RADIUS}px) rotateZ(${instantVel * 0.8}deg) skewX(${instantVel * 0.3}deg)`,
                  opacity: visible ? 1 : 0,
                  pointerEvents: visible ? 'auto' : 'none',
                }}
              >
                <img src={item.src} alt={item.label} draggable={false} />
                <div className="card-label">
                  <span className="card-label-cn">{item.label}</span>
                  <span className="card-label-en">{item.en}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="blur-left" />
        <div className="blur-right" />
      </div>

      <div className="lead-cta">
        <button onClick={() => document.querySelector<HTMLButtonElement>('[data-auth="register"]')?.click()} className="btn btn-primary">立即注册</button>
        <button onClick={() => document.querySelector<HTMLButtonElement>('[data-auth="login"]')?.click()} className="btn btn-ghost">已有账号登录</button>
      </div>

      <style>{`
        @keyframes kineticIn {
          from { opacity:0; transform:translateY(20px); filter:blur(6px); }
          to   { opacity:1; transform:translateY(0);    filter:blur(0); }
        }
        @keyframes cursorBlink {
          0%,100% { opacity:1; } 50% { opacity:0; }
        }
        @keyframes tickerScroll {
          from { transform:translateX(0); } to { transform:translateX(-50%); }
        }
        @keyframes preloaderFade {
          to { opacity:0; pointer-events:none; }
        }

        .kinetic-wrap { display:inline-flex; flex-wrap:wrap; justify-content:center; }
        .kinetic-mask  { display:inline-block; overflow:hidden; vertical-align:bottom; padding-bottom:2px; }
        .kinetic-word  { display:inline-block; animation:kineticIn .7s cubic-bezier(.22,1,.36,1) both; will-change:transform; }

        .lead-hero {
          position:relative; min-height:100vh; background:#0a0a1a; color:#fff;
          display:flex; flex-direction:column; align-items:center; overflow:hidden;
          padding-bottom:32px;
        }

        .ticker-strip {
          width:100%; overflow:hidden; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06);
          margin-top:60px;
        }
        .ticker-track {
          white-space:nowrap; font-size:11px; letter-spacing:.18em; text-transform:uppercase;
          color:rgba(255,255,255,.3); animation:tickerScroll 28s linear infinite; display:inline-block;
        }

        .lead-hero-content {
          position:relative; z-index:10; text-align:center; padding:24px 20px 12px;
          max-width:820px; width:100%;
        }
        .lead-badge {
          display:inline-block; font-size:11px; letter-spacing:.14em; text-transform:uppercase;
          padding:5px 16px; border-radius:99px; border:1px solid rgba(255,255,255,.12);
          background:rgba(255,255,255,.06); color:rgba(255,255,255,.55); margin-bottom:18px;
        }
        .lead-title {
          font-size:clamp(2.2rem,5.5vw,4.2rem); font-weight:300; line-height:1.08;
          letter-spacing:-.01em; margin:0 0 10px;
        }
        .serif-italic .kinetic-word { font-family:Georgia,serif; font-style:italic; font-weight:280; }
        .lead-sub {
          font-size:clamp(.95rem,1.6vw,1.15rem); color:rgba(255,255,255,.55);
          margin:0 0 22px; font-weight:300;
        }

        .funnel-box {
          position:relative; max-width:420px; margin:0 auto; cursor:text;
          min-height:60px; display:flex; flex-direction:column; align-items:center;
        }
        .funnel-input {
          position:absolute; inset:0; opacity:0; z-index:2; cursor:text;
          background:transparent; border:none; outline:none; color:transparent;
          font-size:2rem; width:100%; height:100%;
        }
        .funnel-display {
          display:flex; align-items:center; justify-content:center; gap:4px;
          font-size:clamp(1.8rem,4vw,3rem); font-weight:300; letter-spacing:-.015em;
          min-height:56px;
        }
        .funnel-val { color:#fff; }
        .funnel-ph  { color:rgba(255,255,255,.2); }
        .funnel-cursor {
          width:2px; height:.85em; background:#fff; display:inline-block; opacity:0;
        }
        .funnel-cursor.blink { animation:cursorBlink 1s step-end infinite; opacity:1; }
        .funnel-btn {
          margin-top:12px; padding:12px 32px; border-radius:99px; border:none;
          background:rgba(255,255,255,.1); color:#fff; font-size:14px; cursor:pointer;
          backdrop-filter:blur(12px); transition:background .2s;
        }
        .funnel-btn:hover { background:rgba(255,255,255,.18); }
        .funnel-done { text-align:center; padding:12px 0; }
        .funnel-check {
          width:48px; height:48px; border-radius:50%; border:2px solid rgba(255,255,255,.4);
          display:inline-flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:10px;
        }
        .funnel-done-text { font-size:1.4rem; font-weight:300; margin-bottom:6px; }
        .funnel-done-sub  { font-size:.85rem; color:rgba(255,255,255,.45); }

        .carousel-scene {
          position:relative; width:100%; height:55vh; min-height:340px;
          perspective:1200px; display:flex; align-items:center; justify-content:center;
          overflow:hidden; margin-top:8px;
        }
        .carousel-ring {
          position:relative; width:${CARD_W}px; height:${CARD_H}px;
          transform-style:preserve-3d; cursor:grab;
        }
        .carousel-ring:active { cursor:grabbing; }
        .carousel-card {
          position:absolute; inset:0; width:${CARD_W}px; height:${CARD_H}px;
          border-radius:16px; overflow:hidden; backface-visibility:hidden;
          transition:opacity .45s ease;
          box-shadow:0 18px 50px rgba(0,0,0,.55);
        }
        .carousel-card img {
          width:100%; height:100%; object-fit:cover; display:block; user-select:none;
        }
        .card-label {
          position:absolute; bottom:0; left:0; right:0; padding:28px 14px 12px;
          background:linear-gradient(transparent,rgba(0,0,0,.72));
          display:flex; flex-direction:column; gap:2px;
        }
        .card-label-cn { font-size:15px; font-weight:500; }
        .card-label-en { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.55); }

        .blur-left {
          position:absolute; left:0; top:0; bottom:0; width:18%; pointer-events:none;
          background:linear-gradient(to right,#0a0a1a,transparent); z-index:5;
        }
        .blur-right {
          position:absolute; right:0; top:0; bottom:0; width:18%; pointer-events:none;
          background:linear-gradient(to left,#0a0a1a,transparent); z-index:5;
        }

        .lead-cta {
          display:flex; gap:14px; justify-content:center; flex-wrap:wrap;
          margin-top:12px; position:relative; z-index:10;
        }

        .preloader {
          position:fixed; inset:0; z-index:9999; background:#0a0a1a;
          display:flex; align-items:center; justify-content:center; flex-direction:column;
          transition:opacity .5s ease;
        }
        .preloader-img {
          position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:.35;
        }
        .preloader-counter {
          position:relative; z-index:2; font-size:clamp(3rem,8vw,6rem); font-weight:200;
          letter-spacing:-.02em;
        }
      `}</style>
    </div>
  );
}
