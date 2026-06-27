# 项目名称
凝时 Zept — 备考生的 AI 专注陪伴 Web 应用。把专注数据翻译成"看见你"的洞察与陪伴，本地优先保护隐私，合规对齐《生成式 AI 办法》《拟人化互动办法》，不诊疗只陪伴。7/15 上线。

## 技术栈
- 构建：Vite 5
- 框架： React 18 + TypeScript
- 组件库：MD3 React
- 样式: CSS Modules + 共享 tokens.css
- 状态管理：Zus1and
- 路由：React Router v6
- 数据管理：Dexie.js
- LLM：DeepSeek-v4-flash API
- 部署：Cloudflare Pages（git push 自动部署）
- LLM 代理：functions/api/llm.ts（Pages Functions，基于 Workers）
- PWA实现：vite-plugin-pwa
- 测试:	Vitest + React Testing Library
- 代码质量：ESLint + Prettier

## 项目结构
- src/
  - components/       # MD3 React 组件（Button/Card/Slider/Chip...）
  - pages/            # 路由页面（Home/Session/Insights/Settings）
  - stores/           # Zustand stores（session/user）
  - lib/              # 业务逻辑（与 UI 解耦，RN 可直接复用）
    - db.ts           # Dexie 初始化 + CRUD
    - llm.ts          # DeepSeek 调用客户端
    - insight.ts      # 洞察生成引擎（规则兜底 + LLM 增强）
    - rules.ts        # 黑名单过滤 + 置信度判定 + 降级链
  - styles/
    - tokens.css      # MD3 设计令牌（颜色/字号/间距/easing）
    - global.css      # 全局重置 + 字体引入
  - types/          # TS 类型定义（session/insight/user）
  - App.tsx
  - main.tsx
- public/
  - manifest.json
- api/                # CF Edge Functions
  - llm.ts            # DeepSeek 代理（脱敏 + 黑名单 + 密钥保护）

## 编码规范
- 使用 `uv` 管理依赖，不使用 pip 直接安装
- 所有函数必须有类型注解
- 字符串一律使用双引号
- 新增 API 路由必须同步添加测试

## 开发约定
- 不迎合用户，做审慎决策，与用户意见相反若有理由可以直接写Rebuttal
- 对话中无法明确用户意思的，使用lark-doc技能查阅凝时 Zept 文件夹下PRD，技评文档与Spec文档
- 不得向远程仓库推送含有API密钥，Key等敏感信息的代码
- 推送远程仓库前审计代码，避免泄露API密钥，Key等敏感信息
- 代码改动并审计后即时Git提交到远程仓库