export interface MarketplaceProduct {
  id: string;
  brand: string;
  category: string;
  subcategory: string;
  name: string;
  description: string;
  features: string[];
  imageUrl: string;
  officialUrl: string;
  priceCny: number | null;
  priceNote: string;
  badge: string;
  roomTags: string[];
  source: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export const XIAOMI_SMART_HOME_PRODUCTS: MarketplaceProduct[] = [
  {
    "id": "xiaomi-smart-door-lock-01",
    "brand": "Xiaomi / 米家",
    "category": "智能门锁",
    "subcategory": "入户安全",
    "name": "Xiaomi Self-Install Smart Lock",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/253_operatorx_operatorx_opx/20/10/2025/5ce0288125a3862e6bebd93490237a61.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-self-install-smart-lock/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "玄关"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-smart-door-lock-02",
    "brand": "Xiaomi / 米家",
    "category": "智能门锁",
    "subcategory": "入户安全",
    "name": "Xiaomi Smart door lock NFC Card",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1673923841.7781291.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-door-lock-nfc-card/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "玄关"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-smart-door-lock-03",
    "brand": "Xiaomi / 米家",
    "category": "智能门锁",
    "subcategory": "入户安全",
    "name": "Xiaomi Automatic Smart Door Lock",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1673923636.67345556.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-automatic-smart-door-lock/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "玄关"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-camera-01",
    "brand": "Xiaomi / 米家",
    "category": "智能摄像",
    "subcategory": "全屋看护",
    "name": "Xiaomi Smart Camera C701 Pro",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/452_operatorx_operatorx_opx/14/04/2026/9bcc2cca67ddffabbd80a14cb55a422f.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-camera-c701-pro/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-camera-02",
    "brand": "Xiaomi / 米家",
    "category": "智能摄像",
    "subcategory": "全屋看护",
    "name": "Xiaomi Smart Camera C302",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/716_operatorx_operatorx_opx/23/10/2025/a441d63fa2189fefc79d2b1759127a4a.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-camera-c302/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-camera-03",
    "brand": "Xiaomi / 米家",
    "category": "智能摄像",
    "subcategory": "全屋看护",
    "name": "Xiaomi Smart Camera C500",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/657_operatorx_operatorx_opx/15/09/2025/96472d77c9af58e7186646f899c9c72d.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-camera-c500/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-camera-04",
    "brand": "Xiaomi / 米家",
    "category": "智能摄像",
    "subcategory": "全屋看护",
    "name": "Xiaomi Smart Camera C701",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/89_operatorx_operatorx_opx/08/09/2025/dd088e43eb770936ffe3bfd42baa0aa3.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-camera-c701/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-camera-05",
    "brand": "Xiaomi / 米家",
    "category": "智能摄像",
    "subcategory": "全屋看护",
    "name": "Xiaomi Smart Camera C201",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/635_operatorx_operatorx_opx/22/08/2025/51c8634f338b2a757b68da87ffa70026.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-camera-c201/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-camera-06",
    "brand": "Xiaomi / 米家",
    "category": "智能摄像",
    "subcategory": "全屋看护",
    "name": "Xiaomi Outdoor Camera CW100 Dual",
    "description": "适用于家庭安防场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "家庭安防",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/955_operatorx_operatorx_opx/20/06/2025/bfa95da1e5c1ffbebcc4b718446e230f.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-outdoor-camera-cw100-dual/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "家庭安防",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-air-purifier-01",
    "brand": "Xiaomi / 米家",
    "category": "空气净化",
    "subcategory": "健康空气",
    "name": "Mijia Smart Pet Care Air Purifier",
    "description": "适用于环境电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "环境电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/690_operatorx_operatorx_opx/14/01/2026/2bc1f9b5161053a87ccbfb67ef63a22f.png",
    "officialUrl": "https://www.mi.com/global/product/mijia-smart-pet-care-air-purifier/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "环境电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-air-purifier-02",
    "brand": "Xiaomi / 米家",
    "category": "空气净化",
    "subcategory": "健康空气",
    "name": "Mijia Smart Air Purifier Max",
    "description": "适用于环境电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "环境电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/465_operatorx_operatorx_opx/31/12/2025/a7be7c1127ce3c660919913d23a05419.png",
    "officialUrl": "https://www.mi.com/global/product/mijia-air-purifier-max/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "环境电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-air-purifier-03",
    "brand": "Xiaomi / 米家",
    "category": "空气净化",
    "subcategory": "健康空气",
    "name": "Mijia Smart Air Purifier 6",
    "description": "适用于环境电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "环境电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/485_operatorx_operatorx_opx/14/08/2025/4a5ba97c319ca03c17727f48d0d177c5.png",
    "officialUrl": "https://www.mi.com/global/product/mijia-smart-air-purifier-6/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "环境电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-air-purifier-04",
    "brand": "Xiaomi / 米家",
    "category": "空气净化",
    "subcategory": "健康空气",
    "name": "Xiaomi Smart Air Purifier Elite",
    "description": "适用于环境电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "环境电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/782_operatorx_operatorx_opx/01/03/2024/382f332f003c402ff6ab7a049e300320.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-air-purifier-elite/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "环境电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-robot-vacuum-01",
    "brand": "Xiaomi / 米家",
    "category": "清洁电器",
    "subcategory": "自动清洁",
    "name": "Xiaomi Robot Vacuum H50",
    "description": "适用于生活电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "生活电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/761_operatorx_operatorx_opx/14/04/2026/6d401d493d014a5d82df3ed01f5cac77.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-robot-vacuum-h50/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "生活电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-robot-vacuum-02",
    "brand": "Xiaomi / 米家",
    "category": "清洁电器",
    "subcategory": "自动清洁",
    "name": "Xiaomi Robot Vacuum H50 Pro",
    "description": "适用于生活电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "生活电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/884_operatorx_operatorx_opx/14/04/2026/7d9a6ee915190300712a279cb7f9889b.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-robot-vacuum-h50-pro/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "生活电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-robot-vacuum-03",
    "brand": "Xiaomi / 米家",
    "category": "清洁电器",
    "subcategory": "自动清洁",
    "name": "Xiaomi Robot Vacuum 5",
    "description": "适用于生活电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "生活电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/547_operatorx_operatorx_opx/08/09/2025/4a302044454e07b98aa58a118780293d.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-robot-vacuum-5/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "生活电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-robot-vacuum-04",
    "brand": "Xiaomi / 米家",
    "category": "清洁电器",
    "subcategory": "自动清洁",
    "name": "Xiaomi Robot Vacuum 5 Pro",
    "description": "适用于生活电器场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "生活电器",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/730_operatorx_operatorx_opx/08/09/2025/7e6334eff221bd9e20fa427c9032f322.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-robot-vacuum-5-pro/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "生活电器",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-smart-bulb-01",
    "brand": "Xiaomi / 米家",
    "category": "智能照明",
    "subcategory": "氛围灯光",
    "name": "Xiaomi Smart LED Bulb (White and Color)",
    "description": "适用于智能家居场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "智能家居",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/539_operatorx_operatorx_opx/20/01/2025/8124c17ec32ef6f0b04812c15411a568.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-led-bulb/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "智能家居",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-smart-bulb-02",
    "brand": "Xiaomi / 米家",
    "category": "智能照明",
    "subcategory": "氛围灯光",
    "name": "Mi Smart LED Bulb (Warm White)",
    "description": "适用于智能家居场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "智能家居",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1666845334.22448296.png",
    "officialUrl": "https://www.mi.com/global/product/mi-smart-led-bulb-warm-white/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "智能家居",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-smart-bulb-03",
    "brand": "Xiaomi / 米家",
    "category": "智能照明",
    "subcategory": "氛围灯光",
    "name": "Mi LED Smart Bulb Essential (White and Color)",
    "description": "适用于智能家居场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "智能家居",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1666845604.88148408.png",
    "officialUrl": "https://www.mi.com/global/product/mi-led-smart-bulb-essential-white-and-color/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "智能家居",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-speakers-01",
    "brand": "Xiaomi / 米家",
    "category": "智能音箱",
    "subcategory": "家庭影音",
    "name": "Xiaomi Sound Play",
    "description": "适用于智能家居场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "智能家居",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/985_operatorx_operatorx_opx/29/05/2026/f4c1185e9c5f3a9f9cef5ccf3d9bd61d.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-sound-play/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "智能家居",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-speakers-02",
    "brand": "Xiaomi / 米家",
    "category": "智能音箱",
    "subcategory": "家庭影音",
    "name": "Xiaomi Bluetooth Speaker Essential",
    "description": "适用于智能家居场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "智能家居",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/619_operatorx_operatorx_opx/09/02/2026/189913b62049a0dd3bff114a45c4518e.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-bluetooth-speaker-essential/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "智能家居",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-speakers-03",
    "brand": "Xiaomi / 米家",
    "category": "智能音箱",
    "subcategory": "家庭影音",
    "name": "Xiaomi Desktop Speaker Pro Set",
    "description": "适用于智能家居场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "智能家居",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/168_operatorx_operatorx_opx/26/01/2026/3fb361e954bce8c211137a6d86e7e479.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-desktop-speaker-pro-set/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "智能家居",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  },
  {
    "id": "xiaomi-plug-01",
    "brand": "Xiaomi / 米家",
    "category": "智能插座",
    "subcategory": "智能控制",
    "name": "Xiaomi Smart Plug 2 (Wifi)",
    "description": "适用于智能家居场景的小米官方智能家居产品，支持通过米家生态进行联动与控制。",
    "features": [
      "智能家居",
      "米家生态",
      "官方产品"
    ],
    "imageUrl": "https://i02.appmifile.com/657_operatorx_operatorx_opx/18/05/2023/4da7716ff772d94c01ac74f1d93eb818.png",
    "officialUrl": "https://www.mi.com/global/product/xiaomi-smart-plug-2-wi-fi/",
    "priceCny": null,
    "priceNote": "价格与库存以小米官方购买页为准",
    "badge": "小米严选",
    "roomTags": [
      "智能家居",
      "客厅",
      "卧室"
    ],
    "source": "Xiaomi Global Product List"
  }
];

export const MARKETPLACE_CATEGORIES = [
  '全部',
  '智能门锁',
  '智能摄像',
  '空气净化',
  '清洁电器',
  '智能照明',
  '智能音箱',
  '智能插座',
] as const;

export function getMarketplaceProduct(id: string) {
  return XIAOMI_SMART_HOME_PRODUCTS.find((item) => item.id === id);
}

export function marketplaceCartCount(items: CartItem[]) {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
}
