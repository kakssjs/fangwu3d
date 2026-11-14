'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { addressAt, getMapConfig, loadAmap, type PlaceInfo } from '@/lib/amap-client';
import { useLang } from './LanguageProvider';

const EMPTY: PlaceInfo = { province: '', city: '', district: '', community: '', address: '', lng: '', lat: '' };

/** 新建项目表单里的“房屋位置”：高德搜索小区、点地图选点、或使用当前位置；结果写入表单字段。 */
export default function LocationPicker() {
  const { t } = useLang();
  const mapEl = useRef<HTMLDivElement>(null);
  const amap = useRef<{ AMap: any; map: any; marker: any; search: any } | null>(null);
  const [place, setPlace] = useState<PlaceInfo>(EMPTY);
  const [status, setStatus] = useState('正在加载高德地图…');
  const [ready, setReady] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);

  async function choose(name: string, pos: [number, number], fullAddress = '') {
    const a = amap.current; if (!a) return;
    setResults([]);
    a.map.setZoomAndCenter(16, pos);
    if (!a.marker) { a.marker = new a.AMap.Marker({ position: pos }); a.map.add(a.marker); } else a.marker.setPosition(pos);
    const found = await addressAt(a.AMap, pos);
    setPlace({
      ...EMPTY, ...found,
      community: name || found.community || '',
      address: fullAddress || found.address || '',
      lng: pos[0].toFixed(6), lat: pos[1].toFixed(6),
    });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await getMapConfig();
      if (!cfg) { if (!cancelled) setStatus('地图未配置，请直接填写地址。'); return; }
      try {
        const AMap = await loadAmap(cfg);
        if (cancelled || !mapEl.current) return;
        const map = new AMap.Map(mapEl.current, { zoom: 4, center: [104.2, 35.6] });
        amap.current = { AMap, map, marker: null, search: null };
        map.on('click', (e: any) => choose('', [e.lnglat.getLng(), e.lnglat.getLat()]));
        setReady(cfg.searchReady);
        setStatus(cfg.searchReady ? '' : '地图已加载，但搜索未配置安全密钥。');
      } catch {
        if (!cancelled) setStatus('无法连接高德地图，请直接填写地址。');
      }
    })();
    return () => { cancelled = true; amap.current?.map?.destroy(); amap.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const a = amap.current;
    const k = keyword.trim();
    if (!a || !ready || !k) { setResults([]); return; }
    const timer = setTimeout(() => {
      a.search ??= new a.AMap.PlaceSearch({ type: '商务住宅', pageSize: 8, city: '全国', citylimit: false });
      a.search.search(k, (state: string, r: any) => {
        if (state === 'complete' && r.poiList?.pois?.length) { setResults(r.poiList.pois); setStatus(''); }
        else { setResults([]); setStatus(state === 'no_data' ? '没有找到这个小区，换个名字或点地图选点。' : '搜索失败，请稍后再试。'); }
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [keyword, ready]);

  function useMyLocation() {
    if (!navigator.geolocation) { setStatus('当前浏览器不支持定位。'); return; }
    setStatus('正在定位…');
    navigator.geolocation.getCurrentPosition(
      // 浏览器给出 WGS-84 坐标，先由高德转换到其坐标系再选点
      (p) => {
        const a = amap.current; if (!a) return;
        a.AMap.convertFrom([p.coords.longitude, p.coords.latitude], 'gps', (state: string, r: any) => {
          const ll = state === 'complete' && r.locations?.[0];
          setStatus('');
          choose('', ll ? [ll.getLng(), ll.getLat()] : [p.coords.longitude, p.coords.latitude]);
        });
      },
      () => setStatus('无法获取位置：请允许定位，或搜索小区。'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  const region = [place.province, place.city !== place.province ? place.city : '', place.district].filter(Boolean).join(' ');

  return (
    <div className="form-group location-picker">
      <label>{t('房屋位置')}</label>
      <div className="location-tools">
        <input type="search" className="form-input" value={keyword} disabled={!ready} onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('输入小区名称，例如“联洋花园”')} aria-label={t('搜索小区')} autoComplete="off" />
        <button type="button" className="btn btn-ghost" onClick={useMyLocation} disabled={!ready}>{t('使用我的位置')}</button>
      </div>
      {results.length > 0 && (
        <div className="location-results">
          {results.map((poi) => (
            <button type="button" key={poi.id} className="location-result"
              onClick={() => choose(poi.name, [poi.location.lng, poi.location.lat], str(poi.address) ? `${str(poi.pname)}${str(poi.cityname)}${str(poi.adname)}${str(poi.address)}` : '')}>
              <strong>{poi.name}</strong>
              <span>{[poi.pname, poi.cityname, poi.adname, poi.address].map(str).filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
      {status && <p className="location-status" role="status">{t(status)}</p>}
      <div ref={mapEl} className="location-map" aria-label={t('地图：点击选择房屋位置')} />
      {region && <p className="location-chosen">{t('已选择')}: {region}{place.community ? ` · ${place.community}` : ''}</p>}
      <div className="location-fields">
        <input className="form-input" name="community" value={place.community} maxLength={80} placeholder={t('小区名称')}
          onChange={(e) => setPlace({ ...place, community: e.target.value })} />
        <input className="form-input" name="address" value={place.address} maxLength={200} placeholder={t('详细地址（楼栋门牌可不填）')}
          onChange={(e) => setPlace({ ...place, address: e.target.value })} />
      </div>
      {(['province', 'city', 'district', 'lng', 'lat'] as const).map((k) => <input key={k} type="hidden" name={k} value={place[k]} />)}
    </div>
  );
}
