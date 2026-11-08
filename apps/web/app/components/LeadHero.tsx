'use client';

import { useEffect, useRef, useState } from 'react';

/*
 * Home opening, in the layout of the 予舍 studio site: a living-room still that
 * closes through a turning circle onto the first video, a round emblem, the title
 * at the bottom, and a second video when the visitor scrolls.
 * The top bar floats over the video until the opening has scrolled past.
 */
// Served from our own server (public/videos): the overseas CDN copies were 15 MB and 43 MB (4K) and often
// too slow in mainland China, so the second video never appeared. These are 1080p H.264, 4.3 MB and 6.4 MB,
// with the index at the front so playback can start before the whole file has arrived.
const FIRST_VIDEO = '/videos/landing-first.mp4';
const SECOND_VIDEO = '/videos/landing-second.mp4';

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

    // Opening stage, as in the studio: once a video is actually playing, the living-room
    // still closes through a turning circle to reveal it. Either video counts, so a page that
    // loads already scrolled down doesn't stay stuck behind the still.
    const reveal = () => intro.classList.add('is-playing');
    const onPlaying = () => {
      if (introImage.complete && introImage.naturalWidth) reveal();
      else introImage.addEventListener('load', reveal, { once: true });
    };
    first.addEventListener('playing', onPlaying, { once: true });
    second.addEventListener('playing', onPlaying, { once: true });

    // Start downloading the second video as soon as the first plays, so it is ready by the time
    // the visitor scrolls (it used to start loading only on scroll).
    const preloadSecond = () => {
      if (second.paused && second.readyState < 3) { second.preload = 'auto'; second.load(); }
    };
    first.addEventListener('playing', preloadSecond, { once: true });

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let isScrolled = false;
    let switchId = 0;       // a newer scroll cancels an older switch still waiting for its video
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;

    const play = (v: HTMLVideoElement) => { v.play().catch(() => {}); };
    // Fade to the second video only once it is really playing; until then the first stays on
    // screen, so a slow connection never leaves a blank opening.
    const showSecond = () => {
      const id = ++switchId;
      const shown = () => {
        if (id !== switchId || !isScrolled) return;
        setScrolled(true);
        clearTimeout(pauseTimer);
        pauseTimer = setTimeout(() => first.pause(), 700);
      };
      if (!second.paused && second.readyState >= 3) { shown(); return; }
      second.addEventListener('playing', shown, { once: true });
      second.currentTime = 0;
      play(second);
    };
    const showFirst = () => {
      switchId++;
      clearTimeout(pauseTimer);
      setScrolled(false);
      second.pause();
      play(first);
    };
    const updatePlayback = () => {
      if (document.hidden || reduced.matches) { first.pause(); second.pause(); return; }
      play(first);
      if (isScrolled) showSecond();
    };
    const onScroll = () => {
      bar?.classList.toggle('scrolled', hero.getBoundingClientRect().bottom < 100);
      const next = window.scrollY > 0;
      if (next === isScrolled || reduced.matches) return;
      isScrolled = next;
      if (next) showSecond(); else showFirst();
    };

    updatePlayback();
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', updatePlayback);
    reduced.addEventListener('change', updatePlayback);
    return () => {
      switchId++;
      clearTimeout(pauseTimer);
      first.removeEventListener('playing', onPlaying);
      second.removeEventListener('playing', onPlaying);
      first.removeEventListener('playing', preloadSecond);
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
        <video ref={secondRef} className="landing-video" src={SECOND_VIDEO} muted playsInline loop preload="metadata" aria-hidden="true" />
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
