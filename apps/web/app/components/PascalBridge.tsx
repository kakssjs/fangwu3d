'use client';
import { useRef, useState } from 'react';
import type { SceneModel } from '@i-renovation/shared/scene3d';
import { buildPascalMcpTools, buildPascalScene, parsePascalScene, type PascalScenePayload } from '@/lib/pascal-bridge';
import { downloadText } from '@/lib/scene-export';

interface Props {
  projectId: number;
  sceneModel?: SceneModel;
  onImported?: (sceneModel: SceneModel) => void;
}

export default function PascalBridge({ projectId, sceneModel, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  function downloadScene() {
    if (!sceneModel) return;
    downloadText(JSON.stringify(buildPascalScene(sceneModel), null, 2), 'fangwu3d-pascal-editor.json', 'application/json');
    downloadText(JSON.stringify(buildPascalMcpTools(), null, 2), 'fangwu3d-pascal-mcp-tools.json', 'application/json');
    setStatus('已下载 Pascal Editor 场景和 MCP 工具配置');
  }

  async function importScene(file: File) {
    try {
      const payload = JSON.parse(await file.text()) as PascalScenePayload;
      const imported = parsePascalScene(payload);
      if (!imported) {
        setStatus('文件格式不是 pascal-editor-scene@1');
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'scene_model', upsert: true, content: imported }),
      });
      if (!res.ok) throw new Error('save failed');
      onImported?.(imported);
      setStatus('Pascal Editor 场景已导入并保存');
    } catch {
      setStatus('导入失败，请检查 JSON 文件');
    }
  }

  return (
    <div className="panel" style={{ marginTop: 12, padding: '12px 14px' }}>
      <div className="panel-title" style={{ marginBottom: 8 }}>
        <div className="accent-bar" />
        Pascal Editor / MCP 桥接
        <small>可编辑墙体、门窗、家具、材质和相机</small>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={downloadScene} disabled={!sceneModel}>
          下载 Pascal 场景
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => fileRef.current?.click()}>
          导入 Pascal JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importScene(file);
            e.currentTarget.value = '';
          }}
        />
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{status || '支持 pascal-editor-scene@1 场景 JSON'}</span>
      </div>
    </div>
  );
}
