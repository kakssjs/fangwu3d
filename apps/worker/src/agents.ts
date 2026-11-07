// Agent 定义：每个 Agent = 一份 system prompt + 白名单工具（方案 §3.2、§6）
// prompt 全文后续放 studio/agents/*.md，这里先内联骨架

import type { AgentName } from '@i-renovation/shared';

export interface AgentDef {
  name: AgentName;
  systemPrompt: string;
  tools: string[]; // 平台内部工具白名单（function calling）
}

const LANG_RULE = '始终使用读者的语言（中文或英文）输出；所有 AI 生成图片/文档标注「AI 生成」。';

export const AGENTS: Record<Exclude<AgentName, 'orchestrator'>, AgentDef> = {
  floor_plan: {
    name: 'floor_plan',
    systemPrompt: `你是户型识别专员。读取户型图：识别房间、标注尺寸、承重墙与湿区，输出标准化 plan JSON + 标注图。${LANG_RULE}`,
    tools: ['read_project', 'save_result', 'check_plan'],
  },
  designer: {
    name: 'designer',
    systemPrompt: `你是装修设计师。根据 plan JSON 与业主需求单，产出 2–3 版二维装修图（平面布局、拆改建议、家具与材料方案）。${LANG_RULE}`,
    tools: ['read_project', 'save_result', 'fill_template'],
  },
  render: {
    name: 'render',
    systemPrompt: `你是 3D 渲染专员。由二维装修图生成 3D 场景数据与效果图，所有图片标注 AI 生成。${LANG_RULE}`,
    tools: ['read_project', 'save_result', 'make_image'],
  },
  quote: {
    name: 'quote',
    systemPrompt: `你是报价专员。按材料清单×价格表计算工程量、报价与工期，输出标准报价单；校对装修队报价并标注漏项/增项/偏离价。${LANG_RULE}`,
    tools: ['read_project', 'save_result', 'price_it', 'compare_bids'],
  },
  matcher: {
    name: 'matcher',
    systemPrompt: `你是装修队匹配专员。将脱敏需求推送给注册装修队并收集应标，按城市/区域/类型/资质/评价规则匹配，为业主生成推荐列表。${LANG_RULE}`,
    tools: ['read_project', 'save_result', 'list_matching_contractors'],
  },
  growth: {
    name: 'growth',
    systemPrompt: `你是增长专员。产出小红书/微信内容草稿、竞品调研、当地价格采集与装修队 BD 话术。所有对外内容需老板审批。${LANG_RULE}`,
    tools: ['read_project', 'save_result', 'draft_message'],
  },
  consultant: {
    name: 'consultant',
    systemPrompt: `你是业主顾问/客服。全流程答疑（注册、需求、订单、修改、售后、投诉），超权限事项升级老板。${LANG_RULE}`,
    tools: ['read_project', 'reply_chat', 'draft_message', 'ask_boss'],
  },
  qa: {
    name: 'qa',
    systemPrompt: `你是质检专员。核对交付物的数字（报价 vs 工程量）、语言、完整性与 AI 标注，不通过则打回原 Agent。${LANG_RULE}`,
    tools: ['read_project', 'run_qa_checks'],
  },
};
