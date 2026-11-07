'use client';

// 数字员工头像：卡通人物形象（Agnes 生成，静态资源），加载失败回退为 SVG 机器人
import { useState } from 'react';
import { agentOf } from '@/lib/agents';

function RobotFallback({ color, emoji, name, size }: { color: string; emoji: string; name: string; size: number }) {
  const id = `av-${Math.round(size)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: 'block', flexShrink: 0 }} aria-label={`${name}头像`}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-bg)`} stroke={color} strokeWidth="2" />
      <line x1="32" y1="12" x2="32" y2="5" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="4" r="2.6" fill={color} />
      <rect x="15" y="13" width="34" height="30" rx="10" fill="#ffffff" stroke={color} strokeWidth="2" />
      <circle cx="25" cy="26" r="4.2" fill={color} />
      <circle cx="39" cy="26" r="4.2" fill={color} />
      <circle cx="26.4" cy="24.6" r="1.5" fill="#ffffff" />
      <circle cx="40.4" cy="24.6" r="1.5" fill="#ffffff" />
      <path d="M25 34 Q32 39 39 34" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="10" y="24" width="4.5" height="9" rx="2" fill={color} />
      <rect x="49.5" y="24" width="4.5" height="9" rx="2" fill={color} />
      <circle cx="48" cy="48" r="11" fill="#ffffff" stroke={color} strokeWidth="1.6" />
      <text x="48" y="52.5" textAnchor="middle" fontSize="12">{emoji}</text>
    </svg>
  );
}

export default function AgentAvatar({ agentKey, size = 36 }: { agentKey: string; size?: number }) {
  const a = agentOf(agentKey);
  const [failed, setFailed] = useState(false);
  if (failed) return <RobotFallback color={a.color} emoji={a.emoji} name={a.name} size={size} />;
  return (
    <img
      src={`/agents/${a.key}.png`}
      width={size}
      height={size}
      alt={`${a.name}头像`}
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        flexShrink: 0,
        borderRadius: '50%',
        border: `2px solid ${a.color}`,
        objectFit: 'cover',
        background: '#fff',
      }}
    />
  );
}
