# Zept-MVP
TRAE创作者大赛参赛产品 · Zept 凝时

## 核心特性

- 番茄钟专注计时 + 中断检测 + 休息情绪采样
- LLM 洞察生成（规则兜底 + DeepSeek + 黑名单过滤 + 下一轮参数建议）
- 关怀门（mood ≤ 2 触发专业资源出口，硬隔离不走参数建议分支）
- 趋势分析（跨会话情绪/专注/离开方向性描述，注入 LLM 上下文）
- 洞察反馈闭环（useful/useless 标记回流 LLM）
- 日报/周报（LLM 编排 + 连续专注文案）
- 本地优先（IndexedDB + 单次脱敏注入，用户可一键导出/清空）
- PWA + Apple HIG 双主题
- 为复赛预留：用户长期画像接口（UserProfilePattern），MVP 不实现积累
