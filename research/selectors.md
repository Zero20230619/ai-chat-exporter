# AI 聊天站点 DOM 提取情报（selectors.md）

> 项目：`ai-chat-exporter`（Edge 扩展）· 角色：DOM 侦察研究 · 生成时间：2026-11-09
> 目标：给出可直接用于 `document.querySelector` / `querySelectorAll` 的消息容器、角色判定、内容容器、排序与清洗策略。
> 约束：本文件只描述研究方法与结论，不包含扩展代码；原始样本见 `research/samples/`。

---

## 0. 结论速查

| 站点 | Host 匹配 | 消息条目选择器（首选） | 角色判定 | 内容容器 | 置信度 |
|---|---|---|---|---|---|
| DeepSeek | `chat.deepseek.com` | `[data-virtual-list-item-key]`（容器 `.ds-virtual-list-visible-items`） | 含 `.ds-assistant-message-main-content` 或 `.ds-think-content` → assistant；含 `.fbb737a4` → user | assistant: `.ds-assistant-message-main-content`；user: `.fbb737a4` | **实测高**（3 个公开分享页 + 开源交叉验证） |
| ChatGPT | `chatgpt.com` / `chat.openai.com` | `section[data-testid^="conversation-turn-"]`（可见的） | `section[data-turn="user"/"assistant"]`；兜底 `[data-message-author-role]` | assistant: `.markdown`；user: `.whitespace-pre-wrap` | **开源佐证 + 真实 DOM 转储（中高）**（本机网络不可达，未实测） |
| Claude | `claude.ai` | `[data-testid="user-message"]`、`.font-claude-response`（分享页为扁平兄弟节点） | 命中 `[data-testid="user-message"]` → user；`.font-claude-response` / `[data-testid="assistant-message"]` / 旧版 `.font-claude-message` → assistant | user: 元素本身；assistant: `.standard-markdown`（或 `.font-claude-response` 本身） | **开源佐证（中）**（两套类名并存，分享页另有授权限制） |
| Gemini | `gemini.google.com` | `div.conversation-container` 内的 `user-query` / `model-response` | 标签名：`user-query` → user；`model-response` → assistant | user: `.query-text`；assistant: `.model-response-text .markdown` 或 `message-content .markdown` | **开源佐证（中高）**（含 2026-06 分享页 skill） |
| Copilot（可选） | `copilot.microsoft.com`（另有 `www.copilot.com`） | `.group/user-message`、`.group/ai-message` | 命中 `.group/user-message` → user | user: `[data-content="user-message"]`；assistant: `.group/ai-message-item` | 开源佐证（中低） |

**本机实测限制（必须知道）**：本机位于中国大陆网络，无可用代理，`chatgpt.com` / `claude.ai` / `gemini.google.com` 在无头 Edge 中均为 `net::ERR_CONNECTION_TIMED_OUT`，因此这三家没有本机新鲜 DOM；结论来自 GitHub 上 2025–2026 年的真实 DOM 转储、仍在维护的导出扩展源码与公开分享页 skill。DeepSeek 与 Copilot 的样本为公开仓库中抓取的真实 DOM 转储，非本人实时抓取时会在对应小节注明。未实测项绝不冒充实测。

### 置信度定义

- **实测高**：本机无头 Edge 抓取公开页面并逐项核对 DOM；同时有开源实现佐证。
- **开源佐证（中高/中）**：未本机实测；来自 2 个以上近期（2025-06 之后，最好 2026 年）开源实现/真实 DOM 转储，或 1 个近期实现 + 结构自洽。
- **推测低**：仅凭命名习惯/单一旧来源，扩展落地前必须实测。

---

## 1. DeepSeek（实测高）

### 1.1 Host 与 URL

- Host：`chat.deepseek.com`（唯一）。
- 页面形态：
  - 普通聊天页：`https://chat.deepseek.com/a/chat/s/<conversationId>`（旧版也存在 `/chat/s/<id>`）。
  - 分享页：`https://chat.deepseek.com/share/<shareId>`（本次 3 个样本的 `og:url` 均为该形态）。
- **分享页与普通聊天页可共用选择器：是，高置信度。**
  - 实测：三个分享页（`/share/...`）全部使用同一套 `.ds-message` / `.ds-virtual-list` 结构。
  - 佐证：开源扩展 `sharkymew/DeepSeek-Exporter` 的 `content.js` 明确只在 `/chat/s/` 普通聊天页工作，却使用 `.ds-message`、`.ds-assistant-message-main-content`、`.fbb737a4`、`.ds-think-content .ds-markdown`、`.ds-virtual-list` 作为滚动容器；说明普通聊天页与分享页是同一组 React 组件。
  - 注意：普通聊天页需要登录；匿名访问 `/a/chat/s/<id>` 只得到应用外壳（0 条消息），因此普通页的“登录态 DOM”无法在本机验证，只能靠上述开源实现佐证。

### 1.2 AI 显示名

- 产品名：DeepSeek；建议扩展显示为 `DeepSeek`，assistant 角色名 `DeepSeek`，user 角色名 `我`（或 `User`）。

### 1.3 消息容器（按 DOM 顺序）

```text
.ds-virtual-list                     ← 滚动容器（同时带 .ds-scroll-area 系列类）
└─ .ds-virtual-list-items           ← 撑开总高度（style.minHeight 为整段对话高度）
   └─ .ds-virtual-list-visible-items
      ├─ div[data-virtual-list-item-key="-999"]   ← 免责声明，必须剔除
      ├─ div[data-virtual-list-item-key="1"]      ← user 消息（class 形如 _9663006）
      ├─ div[data-virtual-list-item-key="2"]      ← assistant 消息（class 形如 _4f9bf79 _43c05b5 _448e4c0）
      ├─ div[data-virtual-list-item-key="3"]      ← user
      └─ ...
```

可直接使用的选择器：

```js
// 消息列表根
const list = document.querySelector('.ds-virtual-list');           // 滚动容器
const itemRoot = document.querySelector('.ds-virtual-list-visible-items') || list;

// 所有已挂载消息条目（过滤掉 key=-999 的免责声明与非数字 key）
const items = [...itemRoot.querySelectorAll('[data-virtual-list-item-key]')]
  .filter(el => /^\d+$/.test(el.getAttribute('data-virtual-list-item-key')));

// 逐条判定
for (const item of items) {
  const key = Number(item.dataset.virtualListItemKey);
  const isAssistant = !!item.querySelector('.ds-assistant-message-main-content')
                   || !!item.querySelector('.ds-think-content');
  const isUser = !!item.querySelector('.fbb737a4');
  // ...提取
}
```

要点：

- `data-virtual-list-item-key` 是稳定数据属性，**优先使用**；`_9663006` / `_4f9bf79` 等是 CSS Modules 的 hash 类名，会随构建变化（本样本页面 `<meta name="commit-id" content="ac4432ce">`），**不要作为主判定**。
- 条目内部还有一个 `.ds-message`（同时带 hash 类 `_63c77b1`）作为消息主体包装；用户条目里 `.ds-message` 只包气泡，assistant 条目里 `.ds-message` 包思考块 + 正文。
- 每个条目在 `.ds-message` 之外还有动作条（用户 `._11d6b3a` / `._425ea0b`；AI `.ds-flex._0a3d93b`），转换时应剔除。

### 1.4 角色判定（推荐优先级）

1. 条目包含 `.ds-assistant-message-main-content` → **assistant 正文**；
2. 条目包含 `.ds-think-content`（且没有正文）→ **assistant（仅思考/被中断）**；
3. 条目包含 `.fbb737a4` → **user**；
4. 兜底：`.ds-collapsible-text` → user；`.ds-markdown` → assistant；
5. 最后兜底：按 `data-virtual-list-item-key` 的奇偶性不可靠，不要用。

> 为什么需要第 2 条：实测样本 `deepseek-share-ds1nc31bq7ntyvevzl.html` 的 key=4 是“已停止”的 assistant 消息，只有 `.ds-think-content`、没有 `.ds-assistant-message-main-content`。只按正文容器判定会漏掉它或误判为未知。

### 1.5 内容容器

- **assistant 最终回答**：`.ds-assistant-message-main-content`（本身也是 `.ds-markdown`，段落为 `.ds-markdown-paragraph`）。
- **assistant 思考过程（默认不导出，可选）**：`.ds-think-content .ds-markdown`；外层 `.ds-think-content`（hash `_767406f`）。注意 share 页也会带思考块。
- **user**：`.fbb737a4`（hash 类，稳定性一般）；其内部文本在 `.ds-collapsible-text`，折叠状态下也会保留全文 DOM（`max-height` 只是视觉截断）。更稳的兜底：取 `.ds-message`，先克隆，移除 assistant 内容/思考/动作条/按钮后取剩余文本。
- Markdown 标签：`h1–h6`（样本见到 h2/h3）、`ul/ol/li`、`blockquote`、`hr`、`strong/em`、`a`、`img`、`table`、`pre` 都在 `.ds-markdown` 内，是原生语义标签。

### 1.6 排序 / 虚拟滚动处理

- 列表是虚拟列表：`.ds-virtual-list-items` 的 `min-height` 是整段高度（样本约 18931px），但 DOM 中只挂载当前窗口附近的消息；长对话必须**边滚边收**。
- 收集策略：
  1. 找滚轮容器：`.ds-virtual-list`（兜底：任何 `scrollHeight > clientHeight + 120` 且包含 `.ds-message` 的 `.ds-scroll-area`）；
  2. 先 `scrollTop = 0`，每步 `+ clientHeight * 0.75`，每次滚动后等待 250–350ms；
  3. 每步用 `[data-virtual-list-item-key]` 收集消息，key 为去重键；
  4. 滚到底后按 `Number(key)` **升序排序**（不要相信当前 DOM 顺序，虚拟列表滚动方向可能导致顺序错乱）。
- 兜底：若某天 key 不再是数字，则按“首次出现顺序 + 文本 hash”去重。

### 1.7 代码块与语言提取

实测 DOM（以 `text` 代码块为例）：

```html
<div class="md-code-block md-code-block-light">
  <div class="md-code-block-banner-wrap">
    <div class="md-code-block-banner md-code-block-banner-lite">
      <div class="_121d384">
        <div class="d2a24f03"><span class="d813de27">text</span></div>   <!-- 语言标签 -->
        <div class="d2a24f03 _246a029">
          <div class="efa13877">
            <div role="button" class="ds-button ...">…<span class="code-info-button-text">复制</span></div>
            <div role="button" class="ds-button ...">…<span class="code-info-button-text">下载</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <pre><span>code line 1</span>\n<span>code line 2</span>…</pre>   <!-- 注意：没有 <code> 包裹 -->
</div>
```

- 语言：`.md-code-block-banner` 内第一个 `<span>` 的文本（本样本为 `text`）；该 span 的类 `d813de27` 是 hash，不建议硬编码。可在克隆节点里删掉 `.ds-button` / `.code-info-button-text` 后，取 banner 的 `textContent.trim()`。
- 代码正文：`pre` 内按行是 `<span>`，**没有 `<code>`**。两种取法：
  - 浏览器中：`pre.innerText`（会保留 span 间换行）；
  - 或 `[...pre.children].map(s => s.textContent).join('\n')`（更可控，兼容 `<br>`）。
- 转换时移除 banner（语言已单独取），输出 ```` ```lang ... ``` ````。

### 1.8 表格 / KaTeX / 引用

- **表格（实测）**：表格被 UI 滚动容器包了一层：
  ```html
  <div class="ds-scroll-area ds-scroll-area--show-on-focus-within ds-scroll-area--enabled _1210dd7 c03cafe9">
    <div class="ds-scroll-area__gutters">…滚动条占位…</div>
    <table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr></tbody></table>
  </div>
  ```
  提取时直接拿 `table`；`ds-scroll-area__gutters` 不含正文，剔除即可。单元格内是普通 `span/strong/br`。
- **KaTeX（中置信度）**：
  - 页面加载 `katex.effce08cb3.css`，前端 bundle 中可见 `katex`、`katex-display`、`ds-markdown-math`、`ds-markdown-math-svg`、`ds-markdown-math-display` 类名；渲染分支为 KaTeX 或 WASM(SVG) 兜底。
  - 候选选择器：`span.katex`、`span.katex-display`、`.ds-markdown-math`、`.ds-markdown-math-display`、`.ds-markdown-math-svg`。
  - 取原始 TeX：优先 `annotation[encoding="application/x-tex"]`（标准 KaTeX MathML 输出）；但 DeepSeek 使用 `renderToString` 后裁掉外层包装，且存在 WASM/SVG 渲染分支，**不保证 annotation 一定存在**。拿不到时退回可见文本或 `aria-label`，并在输出中标记 `[math: …]`。
- **引用角标**：assistant 内会出现 `.ds-markdown-cite`（如 `-1`、`-2` 上标链接），可按纯文本保留或去掉。

### 1.9 需要剔除的 UI

| UI | 选择器/特征 |
|---|---|
| 分享免责声明 | `div[data-virtual-list-item-key="-999"]`（文本“该对话来自分享，由 AI 生成，请仔细甄别。”） |
| 用户动作条 | `._11d6b3a`、`._425ea0b`（复制/编辑/重发等按钮） |
| AI 动作条 | `.ds-flex._0a3d93b`（复制/重新生成/点赞等） |
| 思考块（默认不导出） | `.ds-think-content` |
| 状态/工具行 | assistant `.ds-message > div:first-child` 里的“已停止”“搜索到 N 个网页”等（`._74c0879`、`._60aa7fb`、`._5ab5d64` 等 hash 类）；文本匹配 `已停止` / `搜索到 .* 个网页` |
| 代码块工具条 | `.md-code-block-banner-wrap`、`.code-info-button-text`（复制/下载） |
| 表格滚动条 | `.ds-scroll-area__gutters` |
| 折叠按钮 | `.ds-collapsible-text-toggle-button` |
| 通用装饰 | `button`、`svg`、`[role="button"]`（注意不要误删表格/正文中的链接） |

### 1.10 坑点

1. **hash 类名**：`_9663006`、`_4f9bf79`、`fbb737a4`、`d813de27` 等都会变；优先 `data-*`、`ds-*` 语义类和标签名。
2. **虚拟列表只挂载可见项**：不滚动会漏消息；滚动后必须按 key 排序。
3. **只思考、无正文的 assistant**：如“已停止”消息，只有 `.ds-think-content`。
4. **搜索/工具调用行**：assistant 消息可能先出现“搜索到 N 个网页”、引用列表，再出现正文；正文应只取 `.ds-assistant-message-main-content`。
5. **用户消息折叠**：`.ds-collapsible-text` 有 `max-height`，但文本仍在 DOM。
6. **分享页与聊天页共用结构**：不要把 `/share/` 与 `/a/chat/s/` 当成两套 DOM；但分享页有 key=-999 免责声明。
7. **编码坑（本项目已有样本）**：`research/deepseek-share-rendered.html` 是合法 UTF-8 但内容被“UTF-8 字节按 GBK 解读后重存”二次编码，中文是乱码；选择器分析不受影响。后续抓取请 `cmd /c "... > out.html"` 直接重定向原始字节，或用 `Start-Process -RedirectStandardOutput`，避免 PowerShell 管道二次解码。
8. 页面 `<meta name="commit-id">` 可用于给选择器版本打标签（样本为 `ac4432ce`）。

### 1.11 来源

- 本机实测样本（2026-11-09 无头 Edge 抓取公开分享页）：
  - https://chat.deepseek.com/share/ds1nc31bq7ntyvevzl
  - https://chat.deepseek.com/share/gvxewscrd1msi9u7vk
- 既有样本：`research/deepseek-share-rendered.html`（分享页 `https://chat.deepseek.com/share/hap0v75jvcj4ck4iyb`）
- `sharkymew/DeepSeek-Exporter`（普通聊天页 `.ds-*` 选择器与滚动策略）：https://github.com/sharkymew/DeepSeek-Exporter
- `ChinaGodMan/UserScripts`（ChatGPT + DeepSeek 保存脚本，2025-06）：https://github.com/ChinaGodMan/UserScripts/blob/main/chatgpt-save-conversation/chatgpt-save-conversation.user.js
- DeepSeek 前端 bundle（KaTeX 类名证据，来自样本页 script src）：`https://fe-static.deepseek.com/chat/static/main.26d4d4c4fd.js`（已将证据片段存入 `samples/ref-deepseek/katex-selector-evidence.txt`）

---

## 2. ChatGPT（开源佐证 + 真实 DOM 转储，中高）

> 未在本机实测：`chatgpt.com` 在本机无头 Edge 中连接超时（无代理）。以下结论来自 2026-03 维护中的导出脚本源码与其仓库内真实 DOM 转储（`samples/ref-revivalstack/`），以及 `kepano/defuddle`、`pionxzh/chatgpt-exporter` 的现行代码。

### 2.1 Host 与 URL

- Host：`chatgpt.com`、`chat.openai.com`。
- 页面形态：普通 `/c/<uuid>`、项目/分支 `/g/<id>/c/<uuid>`、分享 `/share/<uuid>`（还有 `/share/e/<uuid>`）。
- 分享页 DOM：`pionxzh/chatgpt-exporter` 当前版本优先从 `window.__reactRouterContext.state.loaderData['routes/share.$shareId.($action)'].serverResponse.data` 读取分享页会话 JSON（SSR 数据），而不是抓 DOM。若分享页 DOM 结构未变，`conversation-turn` 选择器同样可用；但**分享页 DOM 未实测**，建议分享页优先走该 SSR 数据兜底。

### 2.2 AI 显示名

- `ChatGPT`。

### 2.3 消息容器（按 DOM 顺序）

```html
<section data-testid="conversation-turn-1" data-turn="user" data-turn-id="…">
  <h4 class="sr-only select-none">You said:</h4>          <!-- 本地化，别用于角色判定 -->
  <div>
    <div class="… group/turn-messages …">
      <div data-message-author-role="user" data-message-id="…" class="text-message …">
        <div class="user-message-bubble-color …">
          <div class="whitespace-pre-wrap">用户文本</div>
        </div>
      </div>
    </div>
    <div aria-label="Your message actions">…按钮…</div>
  </div>
</section>

<section data-testid="conversation-turn-2" data-turn="assistant">
  <h4 class="sr-only select-none">ChatGPT said:</h4>
  <div>
    <div class="… group/turn-messages … agent-turn">
      <div data-message-author-role="assistant" data-turn-start-message="true" class="text-message …">
        <div class="markdown prose dark:prose-invert w-full wrap-break-word light markdown-new-styling">…</div>
      </div>
    </div>
    <div aria-label="Response actions">…复制/点赞/分享…</div>
  </div>
</section>
```

```js
// 只取可见的 turn（ChatGPT 会把旧会话挂在隐藏父节点下，见 pionxzh/page.ts）
const turns = [...document.querySelectorAll('[data-testid^="conversation-turn-"]')]
  .filter(el => el.offsetHeight > 0);

for (const turn of turns) {
  const role = turn.getAttribute('data-turn')                // 'user' | 'assistant'
            || turn.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
  // 一个 assistant turn 可能被拆成多个 [data-message-author-role]，需要全部合并
  const msgEls = [...turn.querySelectorAll('[data-message-author-role]')]
    .filter(el => el.closest('[data-testid^="conversation-turn-"]') === turn);
  const isUser = role === 'user';
  const contentEls = msgEls.flatMap(el => {
    const c = [...el.querySelectorAll(isUser ? '.whitespace-pre-wrap' : '.markdown')];
    return c.length ? c : [el];                              // 兜底：整个消息元素
  });
}
```

### 2.4 角色判定（推荐优先级）

1. `section[data-turn]` 的 `data-turn` 值（`user` / `assistant`）——最稳；
2. `[data-message-author-role]` 属性值（`user` / `assistant`）；
3. 兜底：`h4.sr-only`（或 h5/h6）的文本含 `You said` / `你说` → user；含 `ChatGPT said` / `ChatGPT 说` → assistant。**这是本地化文本，只能兜底**。

### 2.5 内容容器

- user：`[data-message-author-role="user"] .whitespace-pre-wrap`（位于 `.user-message-bubble-color` 内）。
- assistant：`[data-message-author-role="assistant"] .markdown`（类为 `markdown prose dark:prose-invert w-full wrap-break-word light markdown-new-styling`）。
- 兜底：消息元素本身。
- 一个 assistant turn 可能包含“思考/搜索”前后的多段 `[data-message-author-role]`，应合并同 turn 的所有内容片段，再按 DOM 顺序拼接。

### 2.6 排序 / 虚拟滚动处理

- 每个 turn 的 `data-testid` 为 `conversation-turn-<n>`，按 `<n>` 数字升序排序最稳。
- ChatGPT 把旧会话挂在隐藏父节点下，`offsetHeight === 0`；导出前过滤可见 turn。
- 长对话向上滚动会懒加载更早的 turn：先滚到顶部反复触发加载，再向下滚完整收集；以 `data-testid` 为去重键，最后数字排序。
- 流式输出时最后一条 assistant 仍在增长：等待“停止生成”按钮消失或文本 500ms 内稳定后再提取。

### 2.7 代码块与语言提取（实测 DOM 转储）

```html
<pre class="overflow-visible! px-0!">
  <div>…rounded-3xl…">
    <div class="sticky …">
      <div class="flex w-full items-center justify-between …">
        <div class="flex max-w-[75%] … text-sm font-medium … text-token-text-primary">
          <svg …/> Python                                    <!-- 语言标签，textContent = "Python" -->
        </div>
        <div>…<button aria-label="Copy">…</button><button aria-label="Run code">…</button></div>
      </div>
    </div>
    <div class="cm-editor …">
      <div class="cm-content …">print("Hello, World!")</div>  <!-- 代码正文（CodeMirror 6） -->
    </div>
  </div>
</pre>
```

- **没有 `<code>` 元素**：代码由 CodeMirror 6 渲染。
- 代码正文：`pre .cm-content` 的 `innerText`（保留行）；兜底 `pre.innerText` 但会混入语言/按钮文字。
- 语言：`pre .text-token-text-primary` 的 `textContent`（本样本 `Python`）；revivalstack 的兼容写法是 `pre .text-token-text-primary, pre .flex.items-center.text-token-text-secondary, pre .text-xs.font-sans` 取第一个 span。注意要排除 Copy/Run 按钮文字。
- 旧式/普通 markdown 代码块兜底：`pre code[class*="language-"]`，从 `language-xxx` 取语言。

### 2.8 表格 / KaTeX

- 表格：`.markdown` 内原生 `<table><thead><tbody><tr><th><td>`；样本中表格单元格里可能嵌“商品卡片/按钮”，转换前清理 `button/svg`。
- KaTeX：`.markdown` 内 `span.katex` / `span.katex-display`；原始 TeX 优先 `annotation[encoding="application/x-tex"]`。
- 引用：`[data-testid="webpage-citation-pill"]` 是行内引用胶囊（`a[target="_blank"][rel="noopener"]`），可转成 `[n]` 脚注或直接去掉；末尾 “Sources” 按钮区域不属于正文。

### 2.9 需要剔除的 UI

| UI | 选择器 |
|---|---|
| 屏幕阅读器作者标题 | `h4.sr-only, h5.sr-only, h6.sr-only` |
| 回答动作条 | `[aria-label="Response actions"]`、`[data-testid="copy-turn-action-button"]`、`[data-testid="good-response-turn-action-button"]`、`[data-testid="bad-response-turn-action-button"]`、分享/更多按钮 |
| 用户动作条 | `[aria-label="Your message actions"]` |
| 引用胶囊/来源 | `[data-testid="webpage-citation-pill"]`、`span[data-state="closed"]`、含 “Sources” 的按钮 |
| 代码块工具条 | `pre` 内的 toolbar（语言标签要保留后再删）、`button[aria-label="Copy"]`、`button[aria-label="Run code"]` |
| 模型/菜单按钮 | `button[aria-label="Switch model"]`、`button[aria-label="More actions"]` |
| 隐藏旧会话 | `[data-testid^="conversation-turn-"]` 中 `offsetHeight === 0` 的节点 |

### 2.10 坑点

1. **隐藏的旧会话仍在 DOM**：必须 `offsetHeight > 0` 过滤（pionxzh 源码原话：旧会话挂在隐藏祖先下）。
2. **一个 assistant turn 可能拆成多个消息元素**（思考/搜索前后分段），要合并同 turn 的所有 `[data-message-author-role]`。
3. **sr-only 作者文本是本地化文本**（中文界面是“你说：”），不能当主判定，只能兜底。
4. **CodeMirror 没有 `<code>`**：`pre.innerText` 会带语言标签和 Copy/Run 文案；用 `.cm-content`。
5. 分享页：DOM 选择器未实测；优先读 `window.__reactRouterContext` 的 SSR 会话数据（pionxzh 现行实现）。
6. 流式消息：等稳定再取。
7. 引用胶囊/商品卡片：会增加噪声，需按 `data-testid` 清理。

### 2.11 置信度与来源

- 置信度：**开源佐证 + 真实 DOM 转储（中高）**；未本机实测。
- `revivalstack/ai-chat-exporter` v3.1.0（2026-03-23 重构 ChatGPT/Claude/Copilot 选择器）+ 仓库 `reference-html-dom/chatgpt-dom-*.html`：
  - https://github.com/revivalstack/ai-chat-exporter
  - 样本：`samples/ref-revivalstack/chatgpt-dom-1question-ans-pair--with-python-code-response.html`、`chatgpt-dom-2question-ans-pairs.html`
- `kepano/defuddle` `src/extractors/chatgpt.ts`（turn / author / content 选择器，现行 main）：
  - https://github.com/kepano/defuddle/blob/main/src/extractors/chatgpt.ts
- `pionxzh/chatgpt-exporter`（v2.34.0，`src/page.ts` 的可见性判定、分享页 SSR 数据）：
  - https://github.com/pionxzh/chatgpt-exporter
- `ChinaGodMan/UserScripts`（2025-06，`[data-message-id]` + `data-message-author-role` + `.whitespace-pre-wrap`/`.markdown`）：
  - https://github.com/ChinaGodMan/UserScripts/blob/main/chatgpt-save-conversation/chatgpt-save-conversation.user.js

---

## 3. Claude（开源佐证，中）

> 未在本机实测：`claude.ai` 连接超时。结论来自 `kepano/defuddle` 现行 `claude.ts`、revivalstack v3.1.0（2026-03）、browser-use 的 claude.ai 分享页 skill，以及 AI-Exporter 的 DOM 兜底选择器。

### 3.1 Host 与 URL

- Host：`claude.ai`。
- 页面形态：普通聊天 `/chat/<uuid>`、`/new`；分享 `/share/<uuid>`。
- **分享页与普通页 DOM 不同**：
  - 普通聊天页：每条消息有独立包装（assistant `.font-claude-response` / `[data-testid="assistant-message"]`，user `[data-testid="user-message"]`）。
  - 分享页：会话体是一组**扁平兄弟 `<div>`**，没有同时包住 user+assistant 的 turn 包装器；需用“包含首尾 user 消息的最近祖先”作为容器，再遍历其 children。标题用 `[data-testid="page-header"]`，不要用 `document.title`（返回 `Claude`）。
  - ⚠️ 分享页授权限制：browser-harness skill 明确说“分享页只有登录 claude.ai 后才渲染会话 DOM；未登录只看到应用外壳”。该结论来自近期 skill，但未在本机复核；扩展在分享页取不到消息时应提示此原因。

### 3.2 AI 显示名

- `Claude`。

### 3.3 消息容器（按 DOM 顺序）

普通聊天页：

```js
const nodes = [...document.querySelectorAll(
  'div[data-testid="user-message"], div[data-testid="assistant-message"], .font-claude-response, .font-claude-message'
)];
```

- user：`div[data-testid="user-message"]`（内容就是元素本身）。
- assistant（当前）：`.font-claude-response`；其内部正文 `.standard-markdown`。
- assistant（旧版/部分缓存）：`.font-claude-message`；内部是若干 `.grid-cols-1` 内容块；这是真实 DOM 转储中见到的类（样本 `claude-single-user-response-with-artifact-dom.html`）。
- `[data-testid="assistant-message"]` 作为并行兜底（defuddle 现行选择器包含它）。

分享页：

```js
const userMsgs = [...document.querySelectorAll('[data-testid="user-message"]')];
let p = userMsgs[0];
while (p && !p.contains(userMsgs[userMsgs.length - 1])) p = p.parentElement;
const container = p;                         // 分享页的扁平会话容器
for (const child of container.children) {
  const isUser = child.matches('[data-testid="user-message"]') || !!child.querySelector('[data-testid="user-message"]');
  const isAssistant = child.matches('.font-claude-response') || !!child.querySelector('.font-claude-response');
  // 其他子节点（标题/提示）跳过
}
```

### 3.4 角色判定

1. 命中 `[data-testid="user-message"]` → **user**；
2. `.font-claude-response`、`[data-testid="assistant-message"]`、`.font-claude-message` → **assistant**；
3. 兜底：`[data-testid="action-bar-copy"]` 所在块通常为 assistant；但不要用“文本是否在右侧”这种布局判定。

### 3.5 内容容器

- user：元素本身（`[data-testid="user-message"]`）；不要用外层 turn 的 `innerText`，否则会把 “You said: <preview>” 预览文案重复带入。
- assistant（新版）：`.font-claude-response .standard-markdown`；没有 `.standard-markdown` 时用 `.font-claude-response` 本身。
- assistant（旧版）：`.font-claude-message` 下的 `.grid-cols-1` 块；跳过 `div.pt-3.pb-3`（artifact 卡片）和类名含 `transition-all` 的思考块（revivalstack 的判定，较脆弱，作为兜底）。
- `.sr-only` 的 “Claude responded:” 只在屏幕阅读器可见，但 `innerText` 会包含，需剔除或只取内容容器。

### 3.6 排序 / 虚拟滚动

- 普通聊天长会话是虚拟化的：渲染页只保留当前窗口的消息（`agarwalvishal/claude-chat-exporter` 明确因此改用内部 API）。扩展走 DOM 时必须滚动加载并增量收集。
- 没有公开的单一滚动容器选择器；用通用算法：从第一条消息向上找 `scrollHeight > clientHeight + 100` 的最近祖先作为 scroller，先滚到顶再逐步向下，按 “role + 文本 hash” 去重；最后按首次出现顺序或 DOM 顺序排序。
- 分享页是扁平列表，通常整段渲染；仍建议滚动一次确保全部挂载。

### 3.7 代码块与语言提取（真实 DOM 转储）

```html
<div class="relative group/copy bg-bg-000/50 border-0.5 border-border-400 rounded-lg">
  <div class="text-text-500 font-small p-3.5 pb-0">bash</div>       <!-- 语言标签 -->
  <div>
    <pre class="code-block__code !my-0 !rounded-lg !text-sm !leading-relaxed">
      <code class="language-bash"> …<span class="token">…</span>… </code>
    </pre>
  </div>
</div>
```

- 语言：`pre.code-block__code code[class*="language-"]` → 取 `language-` 后缀；同时可用头部 `div.font-small` 文本（本样本 `bash`）。
- 代码正文：`code.textContent`（内部是 token span，textContent 会拼回原文）。
- 兜底：`pre > code` + `language-*` 类。

### 3.8 表格 / KaTeX / Artifact

- 表格/KaTeX：Markdown 原生标签（`table`、`span.katex`）；artifact 是独立面板/iframe，不属于消息文本，导出时只保留 artifact 卡片标题或跳过。
- 行内 `.katex` 的 TeX 源：优先 `annotation[encoding="application/x-tex"]`。

### 3.9 需要剔除的 UI

| UI | 选择器/特征 |
|---|---|
| 动作栏 | `[data-testid="action-bar-copy"]` 及其同级按钮 |
| artifact 卡片 | `div.pt-3.pb-3`、`.artifact-block-cell`、`.artifact-block-cell-preview` |
| 思考块 | 类名含 `transition-all` 的块（revivalstack 经验，非稳定）；页面上的 “Show thinking” 面板 |
| 屏幕阅读器标题 | `.sr-only`（如 “Claude responded:”） |
| 复制按钮/菜单 | `button[aria-label="Copy to clipboard"]`、模型选择器 |
| 附件预览 | 附件卡片/图片预览容器（按需保留文件名） |

### 3.10 坑点

1. **两代 assistant 类名并存**：`.font-claude-response`（当前/分享页）与 `.font-claude-message`（旧/部分页面）。建议两个都试。
2. **分享页没有 turn 包装**：必须做 container-walk；标题用 `[data-testid="page-header"]`。
3. **分享页可能要求登录**：未登录只有外壳；需提示用户。
4. **`document.title` 不可用**：分享页标题固定为 `Claude`。
5. **长会话虚拟化**：不滚动只导出当前窗口。
6. **artifact 面板**：不属于对话正文，不要把它当消息内容；否则会重复。
7. 不要用外层 turn 的 `innerText` 取 user 内容（会重复 “You said” 预览）。

### 3.11 置信度与来源

- 置信度：**开源佐证（中）**；普通页类名有 2+ 近期来源，分享页结论仅 1 个近期 skill。
- `kepano/defuddle` `src/extractors/claude.ts`：
  - https://github.com/kepano/defuddle/blob/main/src/extractors/claude.ts
- `revivalstack/ai-chat-exporter` v3.1.0（2026-03，Claude 选择器重构；DOM 转储 `claude-codeblock-dom.html`、`claude-single-user-response-with-artifact-dom.html`）：
  - https://github.com/revivalstack/ai-chat-exporter
- `browser-use/browser-harness` claude.ai 分享页 skill（扁平 DOM、page-header、登录限制）：
  - https://github.com/browser-use/browser-harness/blob/c24e5072ee66f8499bacd663f4f4bcb089bc4492/agent-workspace/domain-skills/claude-ai/share-export.md
- `agarwalvishal/claude-chat-exporter`（“页面只显示虚拟化窗口”的说明，改用内部 API）：
  - https://github.com/agarwalvishal/claude-chat-exporter
- `sisodiabhumca/AI-Exporter`（DOM 兜底 `[data-testid="assistant-message"]`、`.font-claude-message`）：
  - https://github.com/sisodiabhumca/AI-Exporter

---

## 4. Gemini（开源佐证，中高）

> 未在本机实测：`gemini.google.com` 连接超时。结论来自 `kepano/defuddle` 现行 `gemini.ts`、`jujusharp/gemini-export`（2026-03）、revivalstack v3.1.0 的真实 Gemini DOM 转储，以及 2026-06 的 Gemini 分享页读取 skill。

### 4.1 Host 与 URL

- Host：`gemini.google.com`；短链 `g.co/gemini/share/<id>` 会跳转。
- 页面形态：普通 `/app/<conversationId>`、分享 `/share/<id>`。
- **分享页与普通页共用选择器：是，中高置信度。**
  - 分享页是纯客户端渲染 SPA，必须等 JS 渲染完；等待 `message-content`、`.query-text` 出现（2026-06 skill 的做法）。
  - 分享页无需登录（skill 明确“仅处理公开分享页面（无需登录）”），且提取代码直接用 `div.query-text` + `message-content`，与普通页一致。

### 4.2 AI 显示名

- `Gemini`。

### 4.3 消息容器（按 DOM 顺序）

```html
<chat-window>
  <div class="content-container">
    <div class="chat-container">
      <div class="main-content">
        <chat-window-content>
          <div id="chat-history" class="chat-history-scroll-container">
            <infinite-scroller class="chat-history">
              <div class="conversation-container" id="a90a6a0004767ad3">   <!-- 一轮 = 一个 container -->
                <user-query>
                  <span class="user-query-container right-align-content">
                    <user-query-content class="user-query-container">
                      <div class="query-content" id="user-query-content-0">
                        <span class="user-query-bubble-with-background">
                          <div class="query-text" role="heading" aria-level="2">
                            <p class="query-text-line">用户文本</p>
                          </div>
                        </span>
                      </div>
                    </user-query-content>
                  </span>
                </user-query>

                <model-response>
                  <div>
                    <response-container>
                      <div class="response-container-content">
                        <message-content class="model-response-text" id="message-content-id-r_…">
                          <div class="markdown markdown-main-panel" id="model-response-message-contentr_…">
                            …正文…
                          </div>
                        </message-content>
                      </div>
                    </response-container>
                  </div>
                </model-response>

                <div class="restart-chat-button-scroll-placeholder"></div>
              </div>
            </infinite-scroller>
          </div>
        </chat-window-content>
      </div>
    </div>
  </div>
</chat-window>
```

```js
const turns = [...document.querySelectorAll('#chat-history .conversation-container, .conversation-container')];

for (const turn of turns) {
  const userEl = turn.querySelector('user-query');
  const aiEl = turn.querySelector('model-response');
  const userText = userEl?.querySelector('.query-text')?.innerText || '';
  const aiText = aiEl?.querySelector('.model-response-text .markdown')?.innerText
              || aiEl?.querySelector('message-content .markdown')?.innerText || '';
}
```

### 4.4 角色判定

1. 标签名：`user-query` → user；`model-response` → assistant（最稳）。
2. 兜底：容器内有 `.query-text` → user；有 `message-content` / `.markdown` → assistant。
3. 不要按左右布局或 class 中的 `right-align-content` 判定（样式类）。

### 4.5 内容容器

- user：`user-query .query-text`；逐行是 `p.query-text-line`，合并时用换行连接。
- assistant：`model-response .model-response-text .markdown`（即 `message-content.model-response-text > div.markdown.markdown-main-panel`）。
- 扩展回答（Deep Research 等）：`#extended-response-markdown-content`（defuddle 现行实现优先取它）。
- 表格：Gemini 的表格会带 `.table-content` 类；**注意**它在通用清洗规则里常被当作“目录”误删，在 Gemini 中是真实表格，必须保留（defuddle 专门为此摘掉该类）。

### 4.6 排序 / 虚拟滚动

- 列表容器：`#chat-history`（`div.chat-history-scroll-container`）> `infinite-scroller.chat-history` > `.conversation-container`。
- `infinite-scroller` 是自定义元素，负责懒加载；长对话只渲染部分 `.conversation-container`。
- 收集：从 `#chat-history` 或 `infinite-scroller` 逐步滚动（`clientHeight * 0.8`），每次等待 300–500ms，按 `conversation-container` 的 `id`（或 user+assistant 文本 hash）去重；最终按 DOM 顺序排序。Gemini 的 container id 稳定（如 `a90a6a0004767ad3`），适合做去重键。
- 加载中会出现空白 `.conversation-container`（样本 `gemini-scrollback-loading-dom.html` 中 container 里没有 `user-query`/`model-response`），要等有内容再收。

### 4.7 代码块与语言提取

> 注意：本节的 Gemini 真实 DOM 转储（`gemini-dom.html`）里没有代码块，以下是**开源实现佐证**（revivalstack 的 Gemini 专用代码规则），置信度中。

- 代码块外层为 `.code-block`；语言标签在 `.code-block-decoration span`（revivalstack 的 Gemini 专用逻辑）。
- 代码正文：`.code-block` 内的 `pre`（或 `pre code`）取 `textContent`；没有 `pre` 时退回 `.code-block` 文本并去掉语言标签/按钮。
- 通用兜底：`pre code[class*="language-"]`。

### 4.8 表格 / KaTeX / 来源

- 表格：原生 `<table>`，常见 `.table-content`，必须保留（见 4.5）。
- KaTeX：`span.katex` / `span.katex-display`；原始 TeX 优先 `annotation[encoding="application/x-tex"]`。
- 来源/脚注：`browse-item` 内的 `a[href]`、`.domain`、`.title`，defuddle 把它们作为 footnote；可按需转换。

### 4.9 需要剔除的 UI

| UI | 选择器/特征 |
|---|---|
| 头像栏 | `.avatar-gutter` |
| 回复头/状态 | `.response-container-header`、`.response-container-header-status`、`.response-container-header-controls` |
| 操作栏 | `message-actions`、`.response-container-footer` |
| 思考过程 | `model-thoughts`、`.thoughts-body`、`.thoughts-content`（默认不导出） |
| 文件预览 | `.file-preview-container` |
| 配额/提示 | `freemium-file-upload-near-quota-disclaimer`、`freemium-file-upload-quota-exceeded-disclaimer`、`freemium-rag-disclaimer` |
| 隐藏标题 | `h1.cdk-visually-hidden`（“Conversation with Gemini”） |
| 其他 | `restart-chat-button-scroll-placeholder`、按钮/svg、`response-container-has-multiple-responses` 的切换控件 |

### 4.10 坑点

1. 页面是 Angular 自定义元素；分享页/普通页都是 SPA，必须等 `message-content` / `.query-text` 出现再抓。
2. 长对话 `infinite-scroller` 懒加载；不滚动会漏。
3. 加载中会出现无内容的空 `.conversation-container`。
4. `.table-content` 在 Gemini 是真表格，不能被通用“目录清理”规则误删。
5. 一条模型回复可能有多个版本/多个 draft（`.single-draft-response-container`、`response-container-has-multiple-responses`），只取当前展示的那一份，避免重复。
6. 扩展回答（Deep Research）内容在 `#extended-response-markdown-content`，不要只取 `.model-response-text .markdown`。

### 4.11 置信度与来源

- 置信度：**开源佐证（中高）**；分享页与普通页共用选择器有 2026-06 skill 佐证。
- `kepano/defuddle` `src/extractors/gemini.ts`（conversation-container / query-text / model-response-text / extended-response）：
  - https://github.com/kepano/defuddle/blob/main/src/extractors/gemini.ts
- `jujusharp/gemini-export`（2026-03 多平台计划；`platforms.js`、`conversation_extractor.js` 的 `#chat-history`、`infinite-scroller`、`user-query`、`model-response`、`.model-response-text .markdown`）：
  - https://github.com/jujusharp/gemini-export
- `revivalstack/ai-chat-exporter` v3.1.0 + 真实 DOM 转储：
  - https://github.com/revivalstack/ai-chat-exporter
  - 样本：`samples/ref-revivalstack/gemini-dom.html`、`gemini-scrollback-loading-dom.html`
- `priority3/dotfiles` `gemini-share-reader` skill（2026-06；分享页 SPA、`div.query-text` + `message-content`）：
  - https://github.com/priority3/dotfiles/tree/main/skills/gemini-share-reader
- `sisodiabhumca/AI-Exporter`（DOM 兜底选择器）：
  - https://github.com/sisodiabhumca/AI-Exporter

---

## 5. 可选：Copilot（开源佐证，中低）

- Host：`copilot.microsoft.com`（`AI-Exporter` 的 hosts）；revivalstack 里写的是 `www.copilot.com`，两者都匹配更稳。
- 消息条目：`.group/user-message`、`.group/ai-message`（CSS 中斜杠需转义：`.group\/user-message`、`.group\/ai-message`）。
- 角色：命中 `.group/user-message` → user；`.group/ai-message` → assistant。
- 内容：user 取 `[data-content="user-message"]`；assistant 取 `.group/ai-message-item`。
- 代码块：`pre > code`；语言标签在代码块头部 `span.capitalize`（真实 DOM 转储 `copilot-codeblock-dom.html` 中为 `bash`），代码正文 `pre code` 的 `textContent`。
- UI：语言/复制头部栏、操作按钮。
- 置信度：**开源佐证（中低）**；样本只有代码块片段，没有完整消息容器转储。
- 来源：
  - https://github.com/revivalstack/ai-chat-exporter （v3.1.0，Copilot 选择器重构）
  - https://github.com/sisodiabhumca/AI-Exporter

---

## 6. 未覆盖站点（明确未实测）

- Kimi、通义千问、豆包、智谱清言：本次未调研、未抓取，不提供臆测选择器。若后续要支持，建议先用无头浏览器抓公开分享页，再按第 7 节通用流程补适配。
- ChatGPT / Claude / Gemini 的普通聊天页（登录态）本机无法实测；上文选择器来自开源实现/真实 DOM 转储，落地后必须做一次真机回归。

---

## 7. 通用 fallback 建议（所有站点）

### 7.1 适配器决策顺序

1. 按 `location.hostname` 命中站点适配器；
2. 适配器选择器返回 0 条 → 走通用启发式（7.3）；
3. 仍为 0 条 → 提示用户“页面未加载完/未登录/站点改版”，并记录 `commit-id` / 页面标题 / host 便于更新。

### 7.2 消息提取契约（建议）

```js
// 统一中间结构
{
  role: 'user' | 'assistant' | 'thinking',
  authorName: '…',
  contentHtml: '<p>…</p>',   // 已清洗的 DOM 片段（不含按钮/工具条）
  contentText: '…',
  index: 0,
  key: 'site-specific stable id',  // 用于去重/排序
  timestamp: null
}
```

### 7.3 通用启发式（适配器失效时）

1. 候选节点：`[data-message-author-role]`、`[data-testid*="message"]`、`[data-role]`、`article`、`[class*="message"]`、`[class*="chat"] > div`。
2. 角色：
   - 属性优先：`data-role` / `data-author` / `data-message-author-role` / `aria-label`；
   - 类名其次：`/user|human|prompt/` → user；`/assistant|bot|ai|model|response/` → assistant；
   - 都不可用 → 按位置交替（第一条通常 user），并允许用户手动纠正。
3. 内容节点：候选节点内“文本长度最大且按钮数最少”的子元素；克隆后删掉 `button, svg, script, style, [role="button"], .sr-only`。
4. 排序：优先稳定数值 key（`data-testid` 数字、`data-virtual-list-item-key`、`conversation-container` id）；否则按首次出现顺序。
5. 去重：`role + normalizeText(contentText)` 的 hash；同一消息在滚动中重复出现时丢弃。

### 7.4 滚动加载通用算法

```js
async function collectWithScroll(scroller, collect, {step = 0.75, wait = 320, maxSteps = 250} = {}) {
  const all = new Map();                       // key -> message
  scroller.scrollTop = 0;
  await sleep(wait);
  collect(all);
  let stable = 0, prev = -1;
  for (let i = 0; i < maxSteps; i++) {
    const m = measure(scroller);
    if (m.scrollTop + m.clientHeight >= m.scrollHeight - 8) break;
    scroller.scrollTop = Math.min(m.scrollTop + Math.max(320, m.clientHeight * step), m.scrollHeight);
    await sleep(wait);
    collect(all);
    if (Math.abs(scroller.scrollTop - prev) < 2) { if (++stable >= 4) break; } else stable = 0;
    prev = scroller.scrollTop;
  }
  return [...all.values()];
}
```

- 找 scroller：从第一条消息向上找 `scrollHeight > clientHeight + 100 && clientHeight > 150` 的最近祖先；DeepSeek 用 `.ds-virtual-list`，Gemini 用 `#chat-history`/`infinite-scroller`，ChatGPT 用主会话滚动区，Claude 用最近可滚动祖先。
- 先滚到顶触发“加载更早消息”，再向下收集；长列表可提高 `maxSteps`。
- 收藏品用 `data-*` id 作为 Map key，避免文本重复导致误去重。

### 7.5 清洗与 Markdown 转换

1. **先克隆再清洗**，绝不改动页面原 DOM。
2. 删除块级 UI：`button, svg, script, style, .sr-only, [role="button"]`；但**保留** `<a>`、表格、代码。
3. 代码块：先取语言和代码文本，再整体替换为 markdown fence；不要先删工具条再取 `pre.innerText`（会混入语言/按钮文字）。
4. 表格：原生 `table` 直接转换；忽略滚动条占位容器（DeepSeek `.ds-scroll-area__gutters`）。
5. KaTeX：优先 `annotation[encoding="application/x-tex"]`；其次 `data-math` / `data-latex` / `aria-label`；最后才用可见文本（会丢失语义）。
6. 图片：`img.src`（注意懒加载 `data-src`/`srcset`）。
7. 输出前 normalize：去 `\u200B`、连续空行、行尾空格。
8. HTML 注入：导出 HTML 时必须移除 `script/style/on*` 属性（扩展 side panel 内渲染时尤其重要）。

### 7.6 流式/加载状态

- 最后一条 assistant 可能仍在流式输出：等待“停止生成”按钮消失，或连续两次采样文本一致（间隔 500ms）。
- OpenAI/Claude/Gemini 的“思考中”占位不属于正文，等最终内容容器出现。
- 页面刚打开时消息可能未渲染：先等适配器选择器出现（`waitForSelector` 轮询 200ms，超时 20s）。

### 7.7 选择器健康检查（发布前跑）

```js
function healthCheck(selectorMap) {
  const report = {};
  for (const [name, sel] of Object.entries(selectorMap)) {
    try { report[name] = document.querySelectorAll(sel).length; }
    catch (e) { report[name] = 'INVALID: ' + e.message; }
  }
  console.table(report);
  return report;
}
// DeepSeek 示例
healthCheck({
  list: '.ds-virtual-list',
  items: '[data-virtual-list-item-key]',
  assistant: '.ds-assistant-message-main-content',
  user: '.fbb737a4',
  code: '.md-code-block',
});
```

- 每个站点至少检查“条目数 > 0”“user/assistant 都能命中”“代码块能命中”。
- 站点改版时，用 `meta[name=commit-id]`（DeepSeek）或页面标题 + 日期记录版本。

---

## 8. 样本清单与验证

详见 `research/samples/README.md`。核心样本：

- DeepSeek（本机实测）：
  - `samples/deepseek-share-ds1nc31bq7ntyvevzl.html`：9 个 virtual item，含表格、思考块、“已停止”无正文 assistant。
  - `samples/deepseek-share-gvxewscrd1msi9u7vk.html`：7 个 item，含 5 个表格、思考块、引用角标。
  - `samples/deepseek-share-rendered.original.html`：任务给定的原始样本（注意中文乱码，见 1.10）。
  - `samples/deepseek-chat-s-path-test.html`：匿名访问 `/a/chat/s/` 的空壳页（0 消息，佐证普通页需登录）。
- ChatGPT / Claude / Gemini / Copilot 真实 DOM 转储（来自 revivalstack 仓库，见各节来源）：
  - `samples/ref-revivalstack/chatgpt-dom-*.html`
  - `samples/ref-revivalstack/claude-*.html`
  - `samples/ref-revivalstack/gemini-*.html`
  - `samples/ref-revivalstack/copilot-codeblock-dom.html`
  - `samples/ref-revivalstack/ai-chat-exporter.user.js`（其源码含全部选择器常量）
- DeepSeek 渲染器证据：`samples/ref-deepseek/katex.effce08cb3.css`、`katex-selector-evidence.txt`。

### 样本级选择器验证

`samples/tools/verify_selectors.py` 用 lxml 把本文关键 CSS 选择器转成等价 XPath，对上述样本逐项核对；当前结果 **33/33 PASS**，覆盖 DeepSeek 条目/角色/思考-only/免责声明/表格/代码块、ChatGPT turn/角色/内容/CodeMirror/语言、Claude 代码块语言、Gemini 轮次/内容/滚动容器、Copilot 代码块。复跑：

```powershell
& "<DSH 自带 python>" research/samples/tools/verify_selectors.py
```

---

## 9. 来源汇总（按访问日期 2026-11-09）

### 一手实测
- DeepSeek 分享页 1：https://chat.deepseek.com/share/ds1nc31bq7ntyvevzl
- DeepSeek 分享页 2：https://chat.deepseek.com/share/gvxewscrd1msi9u7vk
- DeepSeek 分享页 3（任务给定）：https://chat.deepseek.com/share/hap0v75jvcj4ck4iyb
- DeepSeek 普通页路径（匿名空壳）：https://chat.deepseek.com/a/chat/s/ds1nc31bq7ntyvevzl

### 开源实现（选择器/行为）
- revivalstack/ai-chat-exporter（v3.1.0，2026-03-23；ChatGPT/Claude/Copilot/Gemini 选择器 + 真实 DOM 转储）：
  https://github.com/revivalstack/ai-chat-exporter
- kepano/defuddle（现行 main 的 conversation extractors）：
  https://github.com/kepano/defuddle
- pionxzh/chatgpt-exporter（v2.34.0；可见性判定、分享页 SSR 数据）：
  https://github.com/pionxzh/chatgpt-exporter
- sharkymew/DeepSeek-Exporter（DeepSeek 普通页选择器、滚动策略）：
  https://github.com/sharkymew/DeepSeek-Exporter
- ChinaGodMan/UserScripts（ChatGPT/DeepSeek，2025-06）：
  https://github.com/ChinaGodMan/UserScripts
- jujusharp/gemini-export（2026-03；Gemini 选择器/滚动配置）：
  https://github.com/jujusharp/gemini-export
- browser-use/browser-harness（claude.ai 分享页 DOM skill）：
  https://github.com/browser-use/browser-harness
- agarwalvishal/claude-chat-exporter（Claude 虚拟化说明）：
  https://github.com/agarwalvishal/claude-chat-exporter
- sisodiabhumca/AI-Exporter（多站点 DOM 兜底选择器）：
  https://github.com/sisodiabhumca/AI-Exporter
- priority3/dotfiles `gemini-share-reader`（2026-06；Gemini 分享页 SPA/选择器）：
  https://github.com/priority3/dotfiles/tree/main/skills/gemini-share-reader

### 前端证据
- DeepSeek 渲染页 `<meta name="commit-id" content="ac4432ce">`；KaTeX CSS：
  https://fe-static.deepseek.com/chat/static/katex.effce08cb3.css
- DeepSeek 主 bundle（已提取片段，原文件未保留）：
  https://fe-static.deepseek.com/chat/static/main.26d4d4c4fd.js
