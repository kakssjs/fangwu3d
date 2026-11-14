'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { getMapConfig, loadAmap } from '@/lib/amap-client';
import { useLang } from './LanguageProvider';

export interface ProjectPlace { province?: string | null; city?: string | null; district?: string | null; community?: string | null; address?: string | null; lng?: string | null; lat?: string | null }

/** 项目详情页的“房屋位置”卡片：地区、小区、地址，以及有坐标时的高德地图。 */
export default function ProjectLocation({ place }: { place: ProjectPlace }) {
  const { t } = useLang();
  const mapEl = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState('');
  const lng = Number(place.lng), lat = Number(place.lat);
  const hasPoint = Boolean(place.lng && place.lat && Number.isFinite(lng) && Number.isFinite(lat));

  useEffect(() => {
    if (!hasPoint) return;
    let map: any;
    let cancelled = false;
    (async () => {
      const cfg = await getMapConfig();
      if (!cfg) { setMapError('地图未配置'); return; }
      try {
        const AMap = await loadAmap(cfg);
        if (cancelled || !mapEl.current) return;
        map = new AMap.Map(mapEl.current, { zoom: 16, center: [lng, lat] });
        map.add(new AMap.Marker({ position: [lng, lat], title: place.community ?? '' }));
      } catch { if (!cancelled) setMapError('无法连接高德地图'); }
    })();
    return () => { cancelled = true; map?.destroy(); };
  }, [hasPoint, lng, lat, place.community]);

  const region = [place.province, place.city !== place.province ? place.city : '', place.district].filter(Boolean).join(' ');
  return (
    <div className="panel location-card">
      <div className="panel-title"><div className="accent-bar" />{t('房屋位置')}</div>
      {!region && !place.community && !place.address && !hasPoint ? (
        <p className="location-status">{t('这个项目还没有填写房屋位置。')}</p>
      ) : (
        <>
          <dl className="location-facts">
            {region && <><dt>{t('所在地区')}</dt><dd>{region}</dd></>}
            {place.community && <><dt>{t('小区')}</dt><dd>{place.community}</dd></>}
            {place.address && <><dt>{t('详细地址')}</dt><dd>{place.address}</dd></>}
          </dl>
          {hasPoint && <div ref={mapEl} className="location-map" aria-label={t('房屋位置地图')} />}
          {mapError && <p className="location-status">{t(mapError)}</p>}
          {hasPoint && (
            <a className="btn btn-ghost" target="_blank" rel="noopener noreferrer"
              href={`https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(place.community || '房屋位置')}&coordinate=gaode&callnative=1`}>
              {t('在高德地图中打开')}
            </a>
          )}
        </>
      )}
    </div>
  );
}
