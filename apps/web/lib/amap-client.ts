'use client';
// 高德地图在浏览器端的加载：Key 来自 /api/map-config；搜索与逆地理经 /amap-service 由服务器附加安全密钥。
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AmapConfig { key: string; searchReady: boolean; serviceHost: string }

let configPromise: Promise<AmapConfig | null> | undefined;
let amapPromise: Promise<any> | undefined;

export function getMapConfig(): Promise<AmapConfig | null> {
  configPromise ??= fetch('/api/map-config').then((r) => r.json()).then((d) => d.amap ?? null).catch(() => null);
  return configPromise;
}

export function loadAmap(cfg: AmapConfig): Promise<any> {
  amapPromise ??= new Promise((resolve, reject) => {
    const w = window as any;
    if (w.AMap) return resolve(w.AMap);
    w._AMapSecurityConfig = cfg.searchReady ? { serviceHost: `${location.origin}${cfg.serviceHost}` } : {};
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(cfg.key)}&plugin=AMap.PlaceSearch,AMap.Geocoder`;
    script.onload = () => (w.AMap ? resolve(w.AMap) : reject(new Error('AMap did not load')));
    script.onerror = () => { amapPromise = undefined; reject(new Error('AMap could not be reached')); };
    document.head.append(script);
  });
  return amapPromise;
}

export interface PlaceInfo { province: string; city: string; district: string; community: string; address: string; lng: string; lat: string }

/** 逆地理编码：坐标 → 省/市/区/街道地址 */
export function addressAt(AMap: any, position: [number, number]): Promise<Partial<PlaceInfo>> {
  return new Promise((resolve) => {
    new AMap.Geocoder().getAddress(position, (state: string, result: any) => {
      if (state !== 'complete' || !result.regeocode) return resolve({});
      const p = result.regeocode.addressComponent;
      const city = Array.isArray(p.city) || !p.city ? p.province : p.city;
      resolve({
        province: p.province || '', city, district: p.district || '',
        community: p.neighborhood?.name || '',
        address: result.regeocode.formattedAddress || '',
      });
    });
  });
}
