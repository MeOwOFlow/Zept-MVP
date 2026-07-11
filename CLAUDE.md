# 项目名称
凝时 Zept — 备考生的 AI 专注陪伴 Web 应用。把专注数据翻译成"看见你"的洞察与陪伴，本地优先保护隐私，合规对齐《生成式 AI 办法》《拟人化互动办法》，不诊疗只陪伴。7/15 上线。

## 技术栈
- 构建：Vite 8
- 框架： React 18 + TypeScript
- 组件库：Apple HIG 风格手写 React 组件（实色分层，双主题）
- 样式：全局 CSS + 共享 tokens.css（CSS Modules 预留）
- 状态管理：Zustand
- 路由：React Router v7
- 数据管理：Dexie.js（IndexedDB）
- LLM：DeepSeek API
- 部署：Cloudflare Pages（git push 自动部署）
- LLM 代理：functions/api/llm.ts（Pages Functions，基于 Workers）
- PWA实现：vite-plugin-pwa
- 测试:	Vitest + React Testing Library
- 代码质量：ESLint + Prettier（待配置）

## 项目结构
- src/
  - components/       # Apple HIG 风格 React 组件（Button/Card/Slider/Chip/Switch...）
  - pages/            # 路由页面（Home/Session/Insights/Settings）
  - stores/           # Zustand stores（session/user）
  - lib/              # 业务逻辑（与 UI 解耦，RN 可直接复用）
    - db.ts           # Dexie 初始化 + CRUD
    - llm.ts          # DeepSeek 调用客户端
    - insight.ts      # 洞察生成引擎（规则兜底 + LLM 增强）
    - rules.ts        # 黑名单过滤 + 置信度判定 + 降级链
  - styles/
    - tokens.css      # 设计令牌（颜色/字号/间距/easing，Apple HIG 双主题）
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
- 对话涉及增加，减少，修改功能相关的，使用lark-doc技能查阅“凝时 Zept”文件夹下PRD，技评文档与Spec文档，给出合理建议，不迎合用户想法，根据实际情况和用户的rebuttal做判断
- 对功能做改动的，即时写进飞书上的PRD/SPEC/技评文档
- 不得向远程仓库推送含有API密钥，Key等敏感信息的代码
- 推送远程仓库前审计代码，避免泄露API密钥，Key等敏感信息
- 代码改动并审计后即时Git提交到远程仓库

## AI CODING八荣八耻
以臆猜接口为耻，以查档求证为荣
以模糊开工为耻，以对齐需求为荣
以脑补业务为耻，以请示规则为荣
以新增冗余为耻，以复用存量为荣
以省略校验为耻，以完备测例为荣
以乱改架构为耻，以恪守规范为荣
以不懂装懂为耻，以坦诚存疑为荣
以批量乱改为耻，以分步迭代为荣