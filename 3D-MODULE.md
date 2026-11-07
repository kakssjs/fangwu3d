# 3D 设计模型模块

本模块把户型识别、Agent 设计、装饰效果图、交互预览、材质库和 Blender/Pascal 导出统一到一条 3D 场景链路。

## 唯一数据源

`packages/shared/src/plan.ts` 的 `PlanGeometry` 是墙、门、窗和房间的唯一事实源。

`packages/shared/src/scene3d.ts` 在它之上生成可持久化的场景模型：

```ts
interface SceneModel {
  schema: 'i-renovation-scene3d@1';
  geometry: PlanGeometry;
  materialPresetId: MaterialPresetId;
  materialPreset: MaterialPreset;
  rooms: SceneRoomModel[];
  capabilities: {
    pascalEditorPayload: true;
    blenderCyclesExport: true;
    glbExport: true;
    customMaterialLibrary: true;
  };
}
```

结果保存在项目的 `scene_model` result kind 中。

## 接入点

1. `floor_plan` Agent
   - 用户画板、户型识别和规则引擎生成 `PlanGeometry` 后，立即创建 `scene_model`。

2. `designer` Agent
   - 2D SVG、3D 模型和房间效果图共用同一份 `PlanGeometry`。
   - Agnes 装饰图 prompt 会带入 `scene_model` 的材质描述，保持效果图与 3D 材质一致。

3. Project 页面
   - 优先使用用户手绘几何；没有用户几何时使用 Agent 的 `scene_model.geometry`。
   - 用户点击“按此图生成 3D”时，会立即保存新的 `scene_model`。

4. `Scene3D.tsx`
   - 生成墙体、楼板、门窗、玻璃、门板、家具和灯光。
   - 提供静奢、暖简、自然、现代四套自定义材质库。
   - 提供透视、俯视、顶面、标注、自动漫游。

5. QA Agent
   - 校验 `scene_model` 是否包含有效几何、材质预设和房间模型。

## Blender Cycles 导出

Scene3D 的“导出 Blender / Pascal”按钮会下载：

- `fangwu3d-renovation.glb`：Three.js 场景模型
- `fangwu3d-blender-cycles.py`：导入 GLB 并设置 Cycles、灯光、相机
- `fangwu3d-pascal-editor.json`：Pascal Editor / MCP 可消费的场景 JSON
- `fangwu3d-material-library.json`：自定义装修材质库

推荐流程：

1. 在项目页调整户型、材质、家具和相机。
2. 导出 GLB 与 Blender 脚本。
3. 在 Blender 中运行脚本。
4. 使用 Cycles 256 samples + denoising 渲染最终装修效果图。

## 高质量家具与材质库

- `packages/shared/src/furniture.ts` 定义可替换家具清单：沙发、床、餐桌、橱柜、卫浴、书桌、书架、绿植、灯具等。
- `Scene3D` 使用圆角几何、软包、金属腿、玻璃、石材、木作等分层建模。
- 所有家具都可以后续替换为 GLB/GLTF 商业模型，尺寸和分类保持兼容。
- 导出时会附带 `fangwu3d-furniture-library.json`。

## Blender 批量渲染

- `scripts/blender_batch_render.py` 支持扫描多个导出任务目录。
- 每个目录包含 `scene.glb` 与 `job.json`。
- Blender 脚本自动设置 Cycles、Denoising、灯光、相机并输出 PNG。

运行示例：

```bash
blender --background --python scripts/blender_batch_render.py -- --jobs ./exports --samples 256
```

## Pascal Editor 深度编辑

- `apps/web/lib/pascal-bridge.ts` 提供 Pascal 场景 JSON 和 MCP 工具定义。
- 项目页面的 Pascal Bridge 面板支持下载、导入和保存编辑后的场景。
- MCP 工具覆盖墙体、门窗、家具、材质、相机和 GLB 导出。

### Pascal 编辑接口

`POST /api/pascal/edit` 接收 `projectId`、`sceneModel` 和 `action`，支持：

```json
{ "type": "set_camera", "camera": {} }
{ "type": "set_material_preset", "materialPresetId": "quiet-luxury" }
{ "type": "place_furniture", "roomId": "客厅", "placement": {} }
{ "type": "replace_geometry", "geometry": {} }
```

编辑后的 `scene_model` 会覆盖式保存，页面和后续 Agent 都会使用同一份模型。
