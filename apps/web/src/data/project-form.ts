import { projectFieldLabels, projectTextLimits, type ProjectInput } from '@defense/shared'

type TextField = keyof typeof projectTextLimits
export interface ProjectTextField {
  key: TextField
  label: string
  placeholder: string
  hint: string
  rows: number
  max: number
}
export const projectTextFields: ProjectTextField[] = [
  {
    key: 'description',
    label: projectFieldLabels.description,
    placeholder: '你在解决什么问题？项目目前进展到哪一步？',
    hint: '概括问题、解决思路和当前进展，区分已实现与计划中的功能。',
    rows: 5,
    max: projectTextLimits.description,
  },
  {
    key: 'targetUsers',
    label: projectFieldLabels.targetUsers,
    placeholder: '谁会使用？他们会在什么场景下遇到这个问题？',
    hint: '写出具体人群、场景和痛点。',
    rows: 3,
    max: projectTextLimits.targetUsers,
  },
  {
    key: 'coreFeatures',
    label: projectFieldLabels.coreFeatures,
    placeholder: '列出 3～5 项核心能力，并说明是否已完成。',
    hint: '优先介绍与核心问题直接相关的功能。',
    rows: 4,
    max: projectTextLimits.coreFeatures,
  },
  {
    key: 'technicalPlan',
    label: projectFieldLabels.technicalPlan,
    placeholder: '使用哪些技术？关键方案是什么？有哪些待验证的限制？',
    hint: '说明技术架构、关键实现及尚未解决的问题。',
    rows: 4,
    max: projectTextLimits.technicalPlan,
  },
  {
    key: 'valueProposition',
    label: projectFieldLabels.valueProposition,
    placeholder: '如何产生商业或应用价值？目前有什么数据或证据？',
    hint: '尚无数据时请直接说明，不必把假设写成已验证结论。',
    rows: 4,
    max: projectTextLimits.valueProposition,
  },
]

export const exampleProject: ProjectInput = {
  name: '校园循环 · 二手物品流转平台（示例）',
  description:
    '面向在校学生的校内二手物品流转平台，尝试解决毕业季闲置物品难处理、线下信息分散的问题。目前完成商品发布与搜索原型，尚未开展真实用户试点。',
  projectType: 'innovation',
  targetUsers:
    '校内需要转让闲置物品的毕业生，以及希望低成本购买教材和日用品的在校学生。初期限定同一校区。',
  coreFeatures:
    '已完成原型：物品发布、分类搜索。计划功能：校园身份验证、预约线下面交、交易反馈。线上支付不在首版范围。',
  technicalPlan:
    '计划使用 Vue 3 构建前端，Node.js 提供 API，SQLite 保存物品信息。身份验证、内容审核和个人信息保护方案仍需进一步设计和验证。',
  valueProposition:
    '希望缩短闲置物品的流转时间并降低沟通成本。暂未确定盈利模式，没有真实交易数据；计划通过访谈和小范围试点验证使用意愿。',
  difficulty: 'normal',
}
