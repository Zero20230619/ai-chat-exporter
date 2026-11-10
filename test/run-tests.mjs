#!/usr/bin/env node
/*
 * 无头 Edge 集成测试：
 *  - 对每个测试页面运行 src/extractor.js
 *  - 解析页面输出的 JSON（pre#ACE_TEST_RESULT）
 *  - 断言消息数量、角色、Markdown 关键内容
 *  - 结果写入 test/results/
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test', 'fixtures');
const RESULTS = path.join(ROOT, 'test', 'results');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

fs.mkdirSync(RESULTS, { recursive: true });
// 只清理本脚本生成的产物，保留 e2e / live 测试结果
for (const name of fs.readdirSync(RESULTS)) {
  const isStaticResult = name.endsWith('-output.md') || name === 'report.json' ||
    (name.endsWith('.json') && !name.startsWith('live-') && !name.startsWith('e2e-'));
  if (isStaticResult) {
    try { fs.unlinkSync(path.join(RESULTS, name)); } catch { /* ignore */ }
  }
}

const CASES = [
  {
    name: 'deepseek',
    file: 'deepseek-share.html',
    deep: true,
    expect: {
      count: 8,
      roles: ['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['# DeepSeek 对话导出', '**用户：**', '**DeepSeek：**', '```text', '参考修正版', '**让权等待**']
    }
  },
  {
    name: 'deepseek-image',
    file: 'deepseek-image.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['![答题照片.png](https://example.com/answer-photo.png)', '满分！']
    }
  },
  {
    name: 'deepseek-think',
    file: 'deepseek-think.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['用户要求停止，我需要保留已经整理好的思路。']
    }
  },
  {
    name: 'chatgpt-real',
    file: 'chatgpt-real.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'ChatGPT',
      contains: ['请解释装饰器', '先说明', '它接收一个函数', '```python', 'def timer', 'functools.wraps'],
      notContains: ['隐藏的旧消息', '\nCopy\n', '\nRun\n']
    }
  },
  {
    name: 'claude-real',
    file: 'claude-real.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'Claude',
      contains: ['## 对比', '| 特性 | 硬链接 | 软链接 |', '```bash', 'ln -s source softlink', '悬空链接'],
      notContains: ['\nbash\n']
    }
  },
  {
    name: 'gemini-real',
    file: 'gemini-real.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'Gemini',
      contains: ['脏读', '```sql', 'SET TRANSACTION ISOLATION LEVEL', '| 隔离级别 | 脏读 | 不可重复读 |'],
      notContains: ['\nsql\n']
    }
  },
  {
    name: 'chatgpt',
    file: 'chatgpt.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'ChatGPT',
      contains: ['# ChatGPT 对话导出', '## 基本步骤', '```python', 'def quick_sort', '> 提示：', '1. 从数列中选择一个基准值']
    }
  },
  {
    name: 'claude',
    file: 'claude.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'Claude',
      contains: ['# Claude 对话导出', '## 遍历顺序', '```javascript', 'function preorder', '*升序序列*']
    }
  },
  {
    name: 'gemini',
    file: 'gemini.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'Gemini',
      contains: ['# Gemini 对话导出', '| 步骤 | 发送方 | 报文 | 关键字段 |', '## 为什么需要三次', '`SYN_RECV`']
    }
  },
  {
    name: 'generic-duplicate',
    file: 'generic-duplicate.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'AI',
      contains: ['**用户：**', '**AI：**', '第一段回答 A。', '第二段回答 B。']
    }
  },
  {
    name: 'claude-duplicate',
    file: 'claude-duplicate.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'Claude',
      contains: ['第一段回答 A。', '第二段回答 B。']
    }
  },
  {
    name: 'deepseek-markdown-only',
    file: 'deepseek-markdown-only.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['**DeepSeek：**', '封装就是隐藏内部实现']
    }
  },
  {
    name: 'chatgpt-image-text',
    file: 'chatgpt-image-text.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'ChatGPT',
      contains: ['请看这张截图', '![截图.png](https://example.com/shot.png)', '浮点数转换']
    }
  },
  {
    name: 'user-fence',
    file: 'user-fence.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['\\`', '\\---', '\\# 这不是标题', '&lt;img src=x onerror=alert(1)&gt;', '这是 AI 回答，不应该被用户的代码围栏吞掉。']
    }
  },
  {
    name: 'list-code',
    file: 'list-code.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['    ```python', '    print(1)', '    print(2)', '    ```']
    }
  },
  {
    name: 'table-pipe',
    file: 'table-pipe.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['| 行内代码 | `a\\|b` |']
    }
  },
  {
    name: 'generic-image',
    file: 'generic-image.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'AI',
      contains: ['![photo.png](https://example.com/only-photo.png)', '这是一张图片。']
    }
  },
  {
    name: 'copilot',
    file: 'copilot.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'Copilot',
      contains: ['栈是后进先出，队列是先进先出。', 'BFS、任务调度']
    }
  },
  {
    name: 'lazy-load',
    file: 'lazy-load.html',
    deep: true,
    expect: {
      count: 30,
      roles: Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 'user' : 'assistant')),
      aiName: 'AI',
      contains: ['用户消息 1', '助手回答 30', '用户消息 11']
    }
  },
  {
    name: 'generic-identical',
    file: 'generic-identical.html',
    deep: true,
    expect: {
      count: 30,
      roles: Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 'user' : 'assistant')),
      aiName: 'AI',
      contains: ['相同内容']
    }
  },
  {
    name: 'lazy-load-batch',
    file: 'lazy-load-batch.html',
    deep: true,
    expect: {
      count: 40,
      roles: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 'user' : 'assistant')),
      aiName: 'AI',
      contains: ['用户消息 1', '助手回答 40', '用户消息 21']
    }
  },
  {
    name: 'generic-streaming',
    file: 'streaming-growth.html',
    deep: true,
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'AI',
      contains: ['回答第一段，补充一，补充二']
    }
  },
  {
    name: 'deepseek-streaming',
    file: 'deepseek-streaming.html',
    deep: true,
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['回答第一段，补充一，补充二']
    }
  },
  {
    name: 'claude-user-fence',
    file: 'claude-user-fence.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'Claude',
      contains: ['\\`', '\\---', '第一行\n第二行', '这是 Claude 的回答，不应被用户的代码围栏吞掉。']
    }
  },
  {
    name: 'deepseek-mixed-keys',
    file: 'deepseek-mixed-keys.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'DeepSeek',
      contains: ['消息 A', '回答 B', '消息 C', '回答 D'],
      containsInOrder: ['消息 A', '回答 B', '消息 C', '回答 D']
    }
  },
  {
    name: 'generic-hidden',
    file: 'generic-hidden.html',
    expect: {
      count: 2,
      roles: ['user', 'assistant'],
      aiName: 'AI',
      contains: ['可见用户 1', '可见回答 1'],
      notContains: ['隐藏用户', '隐藏回答']
    }
  },
  {
    name: 'claude-drift',
    file: 'claude-drift.html',
    expect: {
      ok: false,
      errorIncludes: '无法识别'
    }
  },
  {
    name: 'generic',
    file: 'generic.html',
    expect: {
      count: 4,
      roles: ['user', 'assistant', 'user', 'assistant'],
      aiName: 'AI',
      contains: ['# AI 对话导出', '**用户：**', '**AI：**', '## 四个必要条件']
    }
  }
];

function runEdge(url, tag) {
  return new Promise((resolve, reject) => {
    const outFile = path.join(os.tmpdir(), 'ace_' + tag + '_' + Date.now() + '.html');
    const errFile = path.join(os.tmpdir(), 'ace_' + tag + '_' + Date.now() + '.err');
    const profile = path.join(os.tmpdir(), 'ace_profile_' + tag + '_' + Date.now());
    const outFd = fs.openSync(outFile, 'w');
    const errFd = fs.openSync(errFile, 'w');
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=60000',
      '--dump-dom',
      url
    ];
    const child = spawn(EDGE, args, { stdio: ['ignore', outFd, errFd] });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
    }, 120000);
    child.on('error', (error) => {
      clearTimeout(timer);
      fs.closeSync(outFd);
      fs.closeSync(errFd);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.closeSync(outFd);
      fs.closeSync(errFd);
      resolve({ code, outFile, errFile, profile });
    });
  });
}

function decodeHtml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function readResult(outFile) {
  const html = fs.readFileSync(outFile, 'utf8');
  const match = html.match(/<pre id="ACE_TEST_RESULT">([\s\S]*?)<\/pre>/);
  if (!match) return { error: '页面没有输出 ACE_TEST_RESULT' };
  try {
    return JSON.parse(decodeHtml(match[1]));
  } catch (error) {
    return { error: '结果 JSON 解析失败: ' + error.message };
  }
}

function check(actual, expected) {
  const failures = [];
  if (expected.ok === false) {
    if (!actual || actual.ok !== false) {
      failures.push('预期无法识别，但实际导出成功');
    } else if (expected.errorIncludes && !String(actual.error || '').includes(expected.errorIncludes)) {
      failures.push(`错误信息缺少 ${JSON.stringify(expected.errorIncludes)}，实际: ${actual.error}`);
    }
    return failures;
  }
  if (!actual || actual.ok !== true) {
    failures.push('ok !== true: ' + (actual && actual.error));
    return failures;
  }
  if (actual.count !== expected.count) failures.push(`消息数 ${actual.count} != ${expected.count}`);
  if (expected.roles && JSON.stringify(actual.roles) !== JSON.stringify(expected.roles)) {
    failures.push(`角色序列 ${JSON.stringify(actual.roles)} != ${JSON.stringify(expected.roles)}`);
  }
  if (expected.aiName && actual.ctx.aiName !== expected.aiName) {
    failures.push(`AI 名称 ${actual.ctx.aiName} != ${expected.aiName}`);
  }
  for (const snippet of expected.contains || []) {
    if (!actual.markdown.includes(snippet)) failures.push('Markdown 缺少片段: ' + JSON.stringify(snippet));
  }
  for (const snippet of expected.notContains || []) {
    if (actual.markdown.includes(snippet)) failures.push('Markdown 不应包含片段: ' + JSON.stringify(snippet));
  }
  let lastIndex = -1;
  for (const snippet of expected.containsInOrder || []) {
    const index = actual.markdown.indexOf(snippet);
    if (index === -1) failures.push('Markdown 缺少顺序片段: ' + JSON.stringify(snippet));
    else if (index < lastIndex) failures.push('Markdown 片段顺序错误: ' + JSON.stringify(snippet));
    else lastIndex = index;
  }
  const siteMap = Object.fromEntries((actual.siteTests || []).map((item) => [item.host, item]));
  const siteExpect = [
    ['chat.deepseek.com', 'DeepSeek', '我'],
    ['chatgpt.com', 'ChatGPT', '我'],
    ['claude.ai', 'Claude', '我'],
    ['gemini.google.com', 'Gemini', '我'],
    ['example.com', 'AI', '用户']
  ];
  for (const [host, aiName, userLabel] of siteExpect) {
    const info = siteMap[host];
    if (!info) { failures.push('站点识别缺少: ' + host); continue; }
    if (info.aiName !== aiName) failures.push(`${host} aiName ${info.aiName} != ${aiName}`);
    if (info.userLabel !== userLabel) failures.push(`${host} userLabel ${info.userLabel} != ${userLabel}`);
  }
  return failures;
}

async function main() {
  let passed = 0;
  let failed = 0;
  const report = [];

  for (const testCase of CASES) {
    const filePath = path.join(FIXTURES, testCase.file);
    const url = 'file:///' + filePath.replace(/\\/g, '/') + (testCase.deep ? '?deep=1' : '');
    process.stdout.write(`\n[测试] ${testCase.name} ... `);
    let run;
    try {
      run = await runEdge(url, testCase.name);
    } catch (error) {
      console.log('启动 Edge 失败: ' + error.message);
      failed++;
      report.push({ name: testCase.name, ok: false, failures: ['启动 Edge 失败: ' + error.message] });
      continue;
    }
    const actual = readResult(run.outFile);
    const failures = check(actual, testCase.expect);
    if (actual.ok && actual.markdown) {
      fs.writeFileSync(path.join(RESULTS, testCase.name + '-output.md'), actual.markdown, 'utf8');
    }
    if (failures.length) {
      console.log('失败');
      for (const failure of failures) console.log('  ✗ ' + failure);
      fs.writeFileSync(path.join(RESULTS, testCase.name + '.json'), JSON.stringify(actual, null, 2), 'utf8');
      failed++;
    } else {
      console.log(`通过（${actual.count} 条消息）`);
      passed++;
    }
    report.push({ name: testCase.name, ok: failures.length === 0, failures, count: actual.count, aiName: actual.ctx && actual.ctx.aiName });
  }

  fs.writeFileSync(path.join(RESULTS, 'report.json'), JSON.stringify({ passed, failed, report }, null, 2), 'utf8');
  console.log(`\n========== 结果：${passed} 通过，${failed} 失败 ==========`);
  if (failed > 0) process.exitCode = 1;
}

main();
