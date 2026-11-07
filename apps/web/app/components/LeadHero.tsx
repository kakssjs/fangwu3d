'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * Home opening, in the layout of the 予舍 studio site: a living-room still that
 * closes through a turning circle onto the first video, a round emblem, the title
 * at the bottom, and a second video when the visitor scrolls.
 * The top bar floats over the video until the opening has scrolled past.
 */
const VIDEO_BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/';
const FIRST_VIDEO = VIDEO_BASE + 'hf_20260625_174131_395bc785-bb21-4e65-abf6-27c56f0764b6.mp4';
const SECOND_VIDEO = VIDEO_BASE + 'hf_20260624_055914_ee2b3b56-9a58-4885-989e-5b72a68b630d.mp4';

/**
 * Home-page call to action. Signed out: opens the top bar's register or login form.
 * Signed in (the top bar shows no such button): goes to the visitor's console,
 * using the same role-to-console mapping as AuthNav.
 */
export function openAuth(mode: 'register' | 'login') {
  const button = document.querySelector<HTMLButtonElement>(`.topbar [data-auth="${mode}"]`);
  if (button) { button.click(); return; }
  let role = '';
  try { role = (JSON.parse(localStorage.getItem('user') ?? 'null') as { role?: string } | null)?.role ?? ''; } catch {}
  window.location.assign(role === 'boss' ? '/boss' : role === 'company' ? '/contractor' : '/dashboard');
}

export default function LeadHero() {
  const heroRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLVideoElement>(null);
  const secondRef = useRef<HTMLVideoElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const introImageRef = useRef<HTMLImageElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    const first = firstRef.current;
    const second = secondRef.current;
    const intro = introRef.current;
    const introImage = introImageRef.current;
    const bar = document.querySelector('.topbar');
    if (!hero || !first || !second || !intro || !introImage) return;
    bar?.classList.add('over-hero');

    // Opening stage, as in the studio: once the first video is playing, the
    // living-room still closes through a turning circle to reveal it.
    const reveal = () => intro.classList.add('is-playing');
    const onFirstPlaying = () => {
      if (introImage.complete && introImage.naturalWidth) reveal();
      else introImage.addEventListener('load', reveal, { once: true });
    };
    first.addEventListener('playing', onFirstPlaying, { once: true });

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let isScrolled = false;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;

    const play = (v: HTMLVideoElement) => { v.play().catch(() => {}); };
    const updatePlayback = () => {
      first.pause();
      second.pause();
      if (!document.hidden && !reduced.matches) play(isScrolled ? second : first);
    };
    const onScroll = () => {
      bar?.classList.toggle('scrolled', hero.getBoundingClientRect().bottom < 100);
      const next = window.scrollY > 0;
      if (next === isScrolled || reduced.matches) return;
      isScrolled = next;
      setScrolled(next);
      clearTimeout(pauseTimer);
      if (next) {
        second.currentTime = 0;
        play(second);
        pauseTimer = setTimeout(() => first.pause(), 700);
      } else {
        second.pause();
        play(first);
      }
    };

    updatePlayback();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', updatePlayback);
    reduced.addEventListener('change', updatePlayback);
    return () => {
      clearTimeout(pauseTimer);
      first.removeEventListener('playing', onFirstPlaying);
      introImage.removeEventListener('load', reveal);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', updatePlayback);
      reduced.removeEventListener('change', updatePlayback);
      first.pause();
      second.pause();
      bar?.classList.remove('over-hero', 'scrolled');
    };
  }, []);

  return (
    <section className="landing-hero" ref={heroRef}>
      <div className="landing-sticky">
        <video ref={secondRef} className="landing-video" src={SECOND_VIDEO} muted playsInline preload="metadata" aria-hidden="true" />
        <video
          ref={firstRef}
          className={'landing-video landing-video-first' + (scrolled ? ' is-scrolled' : '')}
          src={FIRST_VIDEO}
          muted
          playsInline
          loop
          aria-hidden="true"
        />
        <div className="landing-intro" ref={introRef} aria-hidden="true">
          <img ref={introImageRef} src="/images/landing-fallback.png" alt="" />
        </div>
        <div className="landing-transition" aria-hidden="true" />
        <div className="landing-shade" />
        <div className="landing-emblem" aria-hidden="true">
          <img src="/brand/icon.png" alt="" />
        </div>
        <div className="landing-copy">
          <p className="landing-eyebrow">I RENOVATION · JUNCTION CHINA 2026 · OPC 一人公司</p>
          <h1>AI 装修智能体</h1>
          <p className="landing-lead">上传户型图 → AI 出图 · 报价 · 匹配装修队，从一张图纸到住进新家。</p>
          <div className="landing-actions">
            <button type="button" className="btn btn-light" onClick={() => openAuth('register')}>立即注册 →</button>
            <button type="button" className="btn btn-outline-light" onClick={() => openAuth('login')}>已有账号登录</button>
          </div>
        </div>
      </div>
    </section>
  );
}
