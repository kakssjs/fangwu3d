'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  MARKETPLACE_CATEGORIES,
  XIAOMI_SMART_HOME_PRODUCTS,
  getMarketplaceProduct,
  marketplaceCartCount,
  type CartItem,
  type MarketplaceProduct,
} from '@i-renovation/shared/marketplace';

export default function FurnitureMarketplace() {
  const [category, setCategory] = useState<string>('全部');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<MarketplaceProduct | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('furniture-cart');
      const saved = raw ? JSON.parse(raw) : [];
      // 只恢复仍在目录里、数量为正整数的条目，避免旧数据或手改数据让页面出错
      if (Array.isArray(saved)) setCart(saved.filter((item): item is CartItem =>
        !!item && !!getMarketplaceProduct(item.productId) && Number.isInteger(item.quantity) && item.quantity > 0));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem('furniture-cart', JSON.stringify(cart)); } catch {}
  }, [cart]);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return XIAOMI_SMART_HOME_PRODUCTS.filter((item) => {
      const matchCategory = category === '全部' || item.category === category;
      const matchQuery = !q || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(q);
      return matchCategory && matchQuery;
    });
  }, [category, query]);

  function addToCart(productId: string) {
    setCart((prev) => {
      const exists = prev.find((item) => item.productId === productId);
      return exists
        ? prev.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...prev, { productId, quantity: 1 }];
    });
    setMessage('已加入选购清单');
    setTimeout(() => setMessage(''), 1800);
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) => prev
      .map((item) => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  }

  function copyCart() {
    const text = cart.map((item) => {
      const p = getMarketplaceProduct(item.productId);
      return `${p?.name ?? item.productId} × ${item.quantity}\n${p?.officialUrl ?? ''}`;
    }).join('\n\n');
    const done = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 1800); };
    if (!navigator.clipboard) { done('浏览器不支持自动复制，请手动记录清单'); return; }
    navigator.clipboard.writeText(`予舍家具与智能家居选购清单\n\n${text}`)
      .then(() => done('选购清单已复制'), () => done('复制失败，请检查浏览器权限'));
  }

  return (
    <main className="container" style={{ paddingTop: 24 }}>
      <section className="market-hero">
        <div className="role-hero-content">
          <span className="role-kicker"><i /> XIAOMI SMART LIVING MARKET</span>
          <h1 className="role-title">把好产品，放进理想的家</h1>
          <p className="role-subtitle">
            精选小米家具生态与智能家居产品，从智能门锁、安防摄像到清洁电器、灯光和家庭影音，为装修方案补充真正可用的生活设备。
          </p>
        </div>
      </section>

      <div className="market-toolbar">
        <select className="btn btn-ghost market-search" value={category} onChange={(e) => setCategory(e.target.value)}>
          {MARKETPLACE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <input
          className="form-input market-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索智能门锁、空气净化器、扫地机器人……"
        />
        <button className="btn btn-primary" onClick={() => setCartOpen(true)}>
          选购清单（{marketplaceCartCount(cart)}）
        </button>
      </div>

      <div className="section-label">
        <h2>小米智能家居严选</h2>
        <div className="line" />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{products.length} ITEMS</span>
      </div>

      {products.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-dim)' }}>
          <p style={{ marginBottom: 14 }}>没有找到符合条件的产品，换个关键词或品类试试。</p>
          <button className="btn btn-ghost" onClick={() => { setQuery(''); setCategory('全部'); }}>清除筛选</button>
        </div>
      )}

      <div className="market-grid">
        {products.map((item) => (
          <article className="market-card" key={item.id}>
            <div className="market-image">
              <img src={item.imageUrl} alt={item.name} loading="lazy" />
            </div>
            <div className="market-body">
              <div className="market-eyebrow">{item.category} · {item.brand}</div>
              <h3 className="market-name">{item.name}</h3>
              <p className="market-desc">{item.description}</p>
              <div className="market-tags">
                {item.features.slice(0, 3).map((tag) => <span className="tag tag-cyan" key={tag}>{tag}</span>)}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 12 }}>{item.priceNote}</div>
              <div className="market-actions">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => addToCart(item.id)}>加入清单</button>
                <button className="btn btn-ghost" onClick={() => setDetail(item)}>详情</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {message && (
        <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 60, padding: '10px 16px', borderRadius: 999, background: 'var(--accent)', color: '#fffdf8', fontSize: 12 }}>
          {message}
        </div>
      )}

      <button className="cart-fab" onClick={() => setCartOpen(true)}>🛒</button>

      {cartOpen && (
        <>
          <div className="cart-overlay" onClick={() => setCartOpen(false)} />
          <aside className="cart-drawer">
            <div className="panel-title"><div className="accent-bar" />选购清单</div>
            {cart.length === 0 ? (
              <p style={{ color: 'var(--text-dim)', marginTop: 28 }}>还没有加入产品。可以先把装修需要的智能设备加入清单。</p>
            ) : (
              <>
                {cart.map((item) => {
                  const product = getMarketplaceProduct(item.productId);
                  if (!product) return null;
                  return (
                    <div key={item.productId} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <img src={product.imageUrl} alt="" style={{ width: 68, height: 68, objectFit: 'contain', background: '#eeeae2', borderRadius: 10 }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: 12 }}>{product.name}</strong>
                        <small style={{ color: 'var(--text-dim)' }}>{product.category}</small>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8 }}>
                          <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => changeQuantity(item.productId, -1)}>−</button>
                          <span>{item.quantity}</span>
                          <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => changeQuantity(item.productId, 1)}>＋</button>
                        </div>
                      </div>
                      <a className="btn btn-ghost" href={product.officialUrl} target="_blank" rel="noreferrer" style={{ alignSelf: 'center', fontSize: 10 }}>官方页</a>
                    </div>
                  );
                })}
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 18 }} onClick={copyCart}>复制选购清单</button>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.7, marginTop: 14 }}>
                  购买、支付和售后通过小米官方购买页完成；平台负责装修方案中的产品搭配与选购建议。
                </p>
              </>
            )}
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 18 }} onClick={() => setCartOpen(false)}>关闭</button>
          </aside>
        </>
      )}

      {detail && (
        <div className="cart-overlay" onClick={() => setDetail(null)} style={{ zIndex: 50 }}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 92vw)', margin: '8vh auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, maxHeight: '84vh', overflowY: 'auto' }}>
            <div style={{ background: '#eeeae2', borderRadius: 16, minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={detail.imageUrl} alt={detail.name} style={{ width: '100%', height: 320, objectFit: 'contain', padding: 22 }} />
            </div>
            <div>
              <div className="market-eyebrow">{detail.category} · {detail.subcategory}</div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1.2, margin: '12px 0' }}>{detail.name}</h2>
              <p style={{ color: 'var(--text-dim)', lineHeight: 1.8, fontSize: 13 }}>{detail.description}</p>
              <div className="market-tags">{detail.features.map((tag) => <span className="tag tag-cyan" key={tag}>{tag}</span>)}</div>
              <p style={{ color: 'var(--accent)', fontSize: 12, margin: '18px 0' }}>{detail.priceNote}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => { addToCart(detail.id); setDetail(null); }}>加入选购清单</button>
                <a className="btn btn-ghost" href={detail.officialUrl} target="_blank" rel="noreferrer">前往官方购买</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
