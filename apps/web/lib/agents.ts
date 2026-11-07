// 数字员工花名册：每个子智能体一个名字、岗位、颜色（头像见 AgentAvatar 组件）
export interface AgentProfile {
  key: string;
  name: string;
  role: string;
  color: string;
  emoji: string;
}

export const AGENTS: Record<string, AgentProfile> = {
  orchestrator: { key: 'orchestrator', name: '小调', role: '调度总管', color: '#6c5ce7', emoji: '📋' },
  floor_plan: { key: 'floor_plan', name: '小测', role: '户型识别师', color: '#00b894', emoji: '📐' },
  designer: { key: 'designer', name: '小设', role: '设计师', color: '#0984e3', emoji: '🎨' },
  quote: { key: 'quote', name: '小算', role: '报价师', color: '#e17055', emoji: '🧮' },
  matcher: { key: 'matcher', name: '小桥', role: '匹配师', color: '#00cec9', emoji: '🤝' },
  qa: { key: 'qa', name: '小检', role: '质检员', color: '#fdcb6e', emoji: '✅' },
};

export const AGENT_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(AGENTS).map(a => [a.key, `${a.name} · ${a.role}`]),
);

export function agentOf(key: string): AgentProfile {
  return AGENTS[key] ?? { key, name: key, role: '智能体', color: '#636e72', emoji: '🤖' };
}
