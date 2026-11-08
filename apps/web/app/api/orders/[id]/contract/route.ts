import { NextResponse } from 'next/server';
import { createContract, getContractByOrder, signContract, getOrder, getProject, getUser } from '@i-renovation/shared';
import { wanToCny } from '@i-renovation/shared/commission';
import { companyCanSeeOrder, forbidden, isOrderParty, requireSession } from '@/lib/auth';

function buildContractText(params: {
  projectName: string;
  homeownerName: string;
  companyName: string;
  amount: string;
  weeks: string;
  signDate: string;
}) {
  return [
    '家庭居室装饰装修工程施工合同',
    '',
    `甲方（发包方/业主）：${params.homeownerName}`,
    `乙方（承包方/装潢公司）：${params.companyName}`,
    '',
    '根据《中华人民共和国民法典》及相关法律法规，甲乙双方在平等、自愿、协商一致的基础上，就家庭居室装饰装修工程达成如下协议：',
    '',
    '第一条  工程概况',
    `1.1  工程地点/项目名称：${params.projectName}`,
    '1.2  工程内容与范围：室内装饰装修施工（详见附件《施工项目清单》）。',
    '1.3  工程结构与面积：以现场实测为准。',
    '',
    '第二条  工程承包方式',
    '2.1  承包方式：由乙方包工、包料（或部分包料）承包施工，具体材料清单见附件。',
    '',
    '第三条  工程价款与工期',
    `3.1  合同价款（人民币）：${params.amount} 元，大写：______________ 元整。`,
    `3.2  施工工期：${params.weeks} 个自然日，自开工之日起计算。`,
    '3.3  付款方式：按进度分期支付（合同签订/隐蔽工程验收/竣工验收等节点），详见附件《付款节点约定》。',
    '',
    '第四条  材料供应',
    '4.1  乙方采购的材料须符合国家质量标准，并向甲方提供材料合格证明。',
    '4.2  甲方自购材料应及时进场，因甲方原因导致工期延误由甲方承担责任。',
    '',
    '第五条  质量与验收',
    '5.1  工程质量执行国家现行《建筑装饰装修工程质量验收规范》及本市相关标准。',
    '5.2  隐蔽工程须经验收合格后方可进入下道工序；竣工验收合格后双方签署《竣工验收单》。',
    '',
    '第六条  双方权利义务',
    '6.1  甲方权利义务：按约支付工程款、办理施工手续、协调邻里关系、参与验收。',
    '6.2  乙方权利义务：按图施工、保证工期与质量、文明施工、做好成品保护与垃圾清运。',
    '',
    '第七条  安全与责任',
    '7.1  乙方施工人员安全由乙方负责；施工现场安全事故责任按法律规定划分。',
    '7.2  因乙方原因造成工程质量问题，乙方应在保修期内无偿维修。',
    '',
    '第八条  违约责任',
    '8.1  因一方原因导致合同无法履行或工期严重延误的，违约方按合同价款的一定比例向守约方支付违约金。',
    '8.2  其他违约情形按法律规定及附件约定处理。',
    '',
    '第九条  争议解决',
    '9.1  本合同履行中发生争议，双方协商解决；协商不成的，可向工程所在地人民法院起诉，或提请仲裁。',
    '',
    '第十条  其他约定',
    `10.1  本合同一式两份，甲乙双方各执一份，自双方签署之日起生效。`,
    '10.2  乙方同意按本项目实际利润的 10% 向平台支付信息服务费；未提供实际成本时，暂按成交金额估算利润，结算时可复核。',
    `10.3  合同签订日期：${params.signDate}`,
    '',
    '附件：《施工项目清单》《材料清单》《付款节点约定》《竣工验收单》',
    '',
    '甲方（签字/盖章）：______________          日期：______________',
    '乙方（签字/盖章）：______________          日期：______________',
  ].join('\n');
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req, ['homeowner', 'company']); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });

    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    if (!isOrderParty(s, order)) return forbidden();

    if (!['confirmed', 'contracted'].includes(order.status)) return NextResponse.json({ error: '请先完成双方确认' }, { status: 409 });

    const body = (await req.json().catch(() => ({}))) as { signer?: string };
    // 签署合同：签署方 = 登录身份；请求里的 signer 只表示这是一次签署请求
    if (body.signer !== undefined) {
      const signer = s.role as 'homeowner' | 'company';
      const contract = await getContractByOrder(id);
      if (!contract) return NextResponse.json({ error: '合同不存在，请先创建合同' }, { status: 404 });
      await signContract(contract.id, signer);
      const updated = await getContractByOrder(id);
      return NextResponse.json(updated);
    }

    // 创建合同（若已存在则直接返回现有合同）
    const existing = await getContractByOrder(id);
    if (existing) return NextResponse.json(existing);

    const [project, homeowner, company] = await Promise.all([
      getProject(order.projectId),
      getUser(order.homeownerId),
      order.companyId ? getUser(order.companyId) : Promise.resolve(null),
    ]);

    const content = buildContractText({
      projectName: project?.name ?? '______________',
      homeownerName: homeowner?.name ?? '______________',
      companyName: company?.companyName ?? company?.name ?? order.bidNote ?? '______________',
      amount: String(wanToCny(order.bidAmount ?? '0')),
      weeks: String(Number(order.bidWeeks) * 7),
      signDate: new Date().toISOString().slice(0, 10),
    });

    const contract = await createContract({ orderId: id, content });
    return NextResponse.json(contract);
  } catch {
    return NextResponse.json({ error: '合同操作失败' }, { status: 400 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession(req); if (s instanceof NextResponse) return s;
    const id = Number((await ctx.params).id);
    if (!Number.isFinite(id)) return NextResponse.json({ error: '缺少有效的 id' }, { status: 400 });
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    if (!isOrderParty(s, order)) return forbidden();

    const contract = await getContractByOrder(id);
    if (!contract) return NextResponse.json({ error: '合同不存在' }, { status: 404 });
    return NextResponse.json(contract);
  } catch {
    return NextResponse.json({ error: '查询合同失败' }, { status: 400 });
  }
}
