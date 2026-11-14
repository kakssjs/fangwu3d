'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { EN } from '@/lib/i18n-en';

// 中英文切换。页面文字原本直接写成中文；英文模式下按 lib/i18n-en.ts 的词典替换页面上的文字、
// placeholder、title 和 aria-label，切回中文时还原。新组件也可直接用 useLang().t('中文')。
export type Lang = 'zh' | 'en';
const STORAGE_KEY = 'ir-lang';
const ATTRS = ['placeholder', 'title', 'aria-label'] as const;
const HAN = /[一-鿿]/;
// 片段替换只用两个字以上的词条，按长度从长到短，避免短词拆坏长句
const FRAGMENTS = Object.keys(EN).filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);

function translate(text: string): string | null {
  const key = text.replace(/\s+/g, ' ').trim();
  if (!key || !HAN.test(key)) return null;
  if (key in EN) return text.replace(text.trim(), EN[key]);
  let out = text;
  for (const k of FRAGMENTS) {
    if (!HAN.test(out)) break;
    if (out.includes(k)) out = out.split(k).join(EN[k]);
  }
  // 只在整段都能译成英文时才采用片段替换，避免出现中英混杂的半句
  return out === text || HAN.test(out) ? null : out;
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (zh: string) => string }>({
  lang: 'zh', setLang: () => {}, t: (zh) => zh,
});
export const useLang = () => useContext(LangContext);

export default function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh');

  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_KEY) === 'en') setLangState('en'); } catch {}
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const t = useCallback((zh: string) => (lang === 'en' ? EN[zh] ?? zh : zh), [lang]);

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    if (lang !== 'en') return;
    // 记住每个被替换节点的原文，以便切回中文（React 重新渲染时也会写回中文，再被重新翻译）
    const originals = new Map<Node, string>();
    const attrOriginals = new Map<Element, Record<string, string>>();
    let busy = false;
    const doText = (node: Text) => {
      const next = translate(node.data);
      if (next !== null) { if (!originals.has(node)) originals.set(node, node.data); node.data = next; }
    };
    const doElement = (el: Element) => {
      if (el.closest('[data-no-translate], script, style, textarea')) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const next = translate(v);
        if (next !== null) {
          const saved = attrOriginals.get(el) ?? {};
          if (!(a in saved)) saved[a] = v;
          attrOriginals.set(el, saved);
          el.setAttribute(a, next);
        }
      }
    };
    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        const parent = root.parentElement;
        if (parent && !parent.closest('[data-no-translate], script, style, textarea')) doText(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      doElement(root as Element);
      const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = it.nextNode(); n; n = it.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
          const parent = n.parentElement;
          if (parent && !parent.closest('[data-no-translate], script, style, textarea')) doText(n as Text);
        } else doElement(n as Element);
      }
    };
    const title = document.title;
    const translatedTitle = translate(title);
    if (translatedTitle) document.title = translatedTitle;
    walk(document.body);
    const observer = new MutationObserver((records) => {
      if (busy) return;
      busy = true;
      for (const r of records) {
        if (r.type === 'characterData') walk(r.target);
        else if (r.type === 'attributes') doElement(r.target as Element);
        else r.addedNodes.forEach(walk);
      }
      observer.takeRecords();
      busy = false;
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
    return () => {
      observer.disconnect();
      originals.forEach((text, node) => { if (node.isConnected) (node as Text).data = text; });
      attrOriginals.forEach((saved, el) => Object.entries(saved).forEach(([a, v]) => el.setAttribute(a, v)));
      if (translatedTitle) document.title = title;
    };
  }, [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

/** 顶栏里的语言切换按钮 */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button type="button" className="btn btn-ghost lang-toggle" data-no-translate
      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} aria-label={lang === 'en' ? '切换到中文' : 'Switch to English'}>
      {lang === 'en' ? '中文' : 'English'}
    </button>
  );
}
