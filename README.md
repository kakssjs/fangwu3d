# I Renovation · Monorepo

OPC 装潢设计智能体公司 —— JUNCTION CHINA 2026 · Xiaomi MiMo 赛道。
设计方案见 `../OPC装潢设计智能体系统方案.md`。

## 结构

```
apps/web        Next.js 15（业主端 / 装修队端 / 老板控制台 + REST/SSE API）
apps/worker     Agent 运行时（BullMQ 消费者 + 调度器 + MiMo 客户端）
packages/shared 共享类型：交接协议、异常规则、Agent 图、红线动作
```

## 快速开始

```bash
npm install
cp .env.example apps/web/.env.local  # 填入服务端密钥、SESSION_SECRET 与老板账号
npm run dev                       # Next.js  → http://localhost:3000
```

需要 Node.js 24。当前线上仅运行 `apps/web`，它包含 API、PGlite 数据库和串行 Agent Runner。`apps/worker` 是尚未接入线上流程的独立骨架，不要与内嵌 Runner 同时当作生产任务执行器。当前部署无需 Redis、外置 PostgreSQL 或 OSS。

个人业主免费；企业只开放一人付基础会员 39 元/月。收到付款返回后查询服务端权益，生成购买入口本身不代表付款成功，不自动续费。其他套餐暂不开放。

生产启动与检查：

```bash
npm ci
npm run typecheck
npm test
npm run build
NODE_ENV=production npm run start -w apps/web -- -H 127.0.0.1 -p 3200
```

线上由 systemd 管理，前端需要 HTTPS 才能使用安全登录 Cookie。`IRENO_PGLITE_DIR` 和 `IRENO_UPLOAD_DIR` 应指向绝对路径并备份；不要在多个服务进程中打开同一个 PGlite 目录。MiMo 负责识别，Agnes 负责图像，支付凭证只给服务端读取。邮箱未启用时手机号密码登录仍可使用。

`npm test` 使用临时数据库并在结束后清理。`scripts/acceptance.mjs`、`scripts/media-acceptance.mjs` 和 `scripts/browser-acceptance.cjs` 是本次隔离验收工具，不能直接对生产数据运行。正向企业会员测试的模拟权益仅由验收服务预加载 `scripts/test-payments.cjs`；生产服务禁止加载它。

## 已实现

- [x] Monorepo（npm workspaces + TypeScript）
- [x] shared：TaskRecord 交接协议、异常规则表、HANDOFF_GRAPH、Agent 红线动作
- [x] shared：**2D→3D 重建管线**（`plan.ts`）——plan JSON（墙/门/窗/房间）为唯一事实源，`generatePlanGeometry` 按面积自动布局、`planFromRects` 按用户手绘/识别矩形建模，`planToSvg` 输出二维施工图，Scene3D 同源拉伸 3D
- [x] worker：MiMo 客户端骨架、8 个 Agent 的 prompt/工具白名单、BullMQ 消费者（重试/降级/升级骨架）
- [x] web：Next.js 15 首页 + /api/health + PGlite/Drizzle 数据层
- [x] 业主端设计包：户型识别 → 二维装修图（墙/门/窗/尺寸）→ 3D 交互模型（拖拽环绕/俯视）→ 材料清单+报价+工期 + Agnes 效果图（可对话修改）
- [x] **户型图输入（用户给图）**：上传户型图 / 画板手绘（框房间+自由画笔）→ Agnes 图生图生成标准平面图（i2i 队列）→ MiMo 视觉识别房间矩形 → 按二维图生成 3D；结果持久化（kind=floorplan，覆盖式 upsert）
- [x] **各房间渲染图（有几个生成几个）**：以识别/手绘房间为准（kind=floorplan rects 优先，Agent 房间兜底），全量生成不设上限，3 张并发 + 实时进度；对话改图即改即存（upsert）
- [x] 老板控制台（/boss，实时数据）：审批队列（★红线人工确认）、任务记录（Task Record）、成本看板（Token/图像按 Agent 汇总）、订单（第一单闭环）
- [x] 装修队端（/contractor）：注册、资质提交、应标；老板人工资质审核（★ Agent 不代为认证）
- [x] **匹配流程（确认 → 发布 → 等投标 → 匹配）**：核心链智能体逐个执行（户型识别→二维设计→报价工期→质检交付，matcher 不入链）；业主最终确认后自动发布接单市场，**等待装修公司发布数据（投标）**，投标到达触发匹配智能体「小桥」——按真实投标（报价/工期贴合）+ 公司资质档案（人工审核状态/风格专长/服务范围/执照）打分匹配；无投标不出匹配结果，业主端显示等待状态流（发布·竞标·匹配四步）
- [x] 数字员工体系：花名册（小调/小测/小设/小算/小桥/小检）+ 卡通人物头像（Agnes 文生图统一风格，SVG 兜底）+ 执行日志任务交接链（fromAgent→toAgent）
- [x] 业主最终确认（人工动作）→ 自动发布接单市场 → 装修公司投标 → 智能体匹配推荐 → 业主选定 → 双方确认 → 合同（第一单闭环，Agent 不碰钱不签合同）
- [x] **异常处理落地（EXCEPTION_RULES）**：调度器按规则分派 retry（≤N 次重试）/ degrade（降级交付不断链）/ escalate_boss（升级老板裁决）/ reask_user（反问用户补充）；任务状态扩展 escalated / waiting_user；业主端异常横幅（补充按钮 → resume 续跑）、老板端审批队列按规则名展示
- [x] **QA 质检实现（小检）**：布局规则（墙/门洞/ForgeFloor 告警）+ 报价核对（明细合计=总价、与确定性基准偏离≤30%，超差按红线升级老板）+ 图片完整性（缺失降级不阻塞）；几何不过回退设计智能体 ≤2 轮，超限升级（匹配质检由匹配智能体在投标后单独把关）
- [x] **我的项目删除**：业主工作台/项目页两级确认删除，级联清理任务/结果/订单/投标/合同 + 户型图文件

## 待实现（对照方案 §8）

- [ ] 生产切换阿里云 RDS（现为 PGlite，切换只改 `db.ts` 一行）
- [ ] OSS 上传（MiMo 视觉识别已接入户型识别链路，QA 质检已实现）
- [x] 装修队入驻费、规模分级、会员套餐和客户资源匹配（详见 `MEMBERSHIP.md`）`r`n- [x] 家具与智能家居商城：小米官方产品目录、分类搜索、选购清单与官方购买入口（详见 `MARKETPLACE.md`）`r`n- [x] 3D 模型模块：户型同源重建、自动家具摆放、门窗/玻璃、材质库、自动漫游、GLB/Blender Cycles/Pascal Editor 导出（详见 `3D-MODULE.md`）


