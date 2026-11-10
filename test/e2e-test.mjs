#!/usr/bin/env node
/*
 * 端到端测试：
 *  1. 复制扩展到临时目录，把 content_scripts 指向 http://chat.deepseek.com/*（测试用）；
 *  2. 启动无头 Edge，加载扩展；
 *  3. 用 --host-resolver-rules 把 chat.deepseek.com 映射到本地 HTTP 服务器；
 *  4. 打开真实 DeepSeek 分享页 DOM，等待悬浮按钮，点击导出；
 *  5. 验证下载的 Markdown 文件；
 *  6. 打开 popup.html 验证 popup 脚本可正常执行。
 *
 * 依赖：puppeteer-core 安装在 %TEMP%\ace-e2e（由 test/setup-e2e.ps1 安装）。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PUPPETEER_DIR = process.env.ACE_PUPPETEER_DIR || path.join(os.tmpdir(), 'ace-e2e');
const requireFromE2E = createRequire(path.join(PUPPETEER_DIR, 'package.json'));
const puppeteer = requireFromE2E('puppeteer-core');

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-e2e-run-'));
const EXT_DIR = path.join(WORK, 'extension');
const PROFILE = path.join(WORK, 'profile');
const DOWNLOADS = path.join(WORK, 'downloads');
fs.mkdirSync(DOWNLOADS, { recursive: true });

function copyExtension() {
  fs.cpSync(ROOT, EXT_DIR, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(ROOT, src);
      if (!rel) return true;
      if (rel.startsWith('test' + path.sep) || rel.startsWith('research' + path.sep) ||
          rel.startsWith('dist' + path.sep) || rel === 'test' || rel === 'research' || rel === 'dist') return false;
      return true;
    }
  });
  const manifestPath = path.join(EXT_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push('http://chat.deepseek.com/*', 'http://127.0.0.1/*');
  manifest.content_scripts[0].matches = ['http://chat.deepseek.com/*', 'http://127.0.0.1/*'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8'
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(content);
    } catch (error) {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function listDownloads() {
  try {
    return fs.readdirSync(DOWNLOADS).filter((name) => !name.endsWith('.crdownload'));
  } catch { return []; }
}

async function waitForDownload(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = listDownloads();
    const md = files.find((name) => name.endsWith('.md'));
    if (md) {
      const full = path.join(DOWNLOADS, md);
      const stat = fs.statSync(full);
      if (stat.size > 0) return { file: full, name: md, size: stat.size };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('[E2E] 准备扩展副本…');
  copyExtension();

  const server = await startServer();
  const port = server.address().port;
  const pageUrl = `http://chat.deepseek.com:${port}/test/e2e/deepseek-page.html`;
  console.log('[E2E] 测试页面:', pageUrl);

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    userDataDir: PROFILE,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--host-resolver-rules=MAP chat.deepseek.com 127.0.0.1',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1400,1000'
    ]
  });

  const errors = [];
  try {
    const workerTarget = await browser.waitForTarget(
      (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
      { timeout: 20000 }
    );
    const extensionId = new URL(workerTarget.url()).host;
    console.log('[E2E] 扩展已加载，ID:', extensionId);

    const browserClient = await browser.target().createCDPSession();
    await browserClient.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS,
      eventsEnabled: true
    });

    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push('console: ' + message.text());
    });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('[E2E] 等待悬浮导出按钮…');
    await page.waitForFunction(() => {
      const host = document.getElementById('__ace_host__');
      const fab = host && host.shadowRoot && host.shadowRoot.getElementById('ace-fab');
      return !!(fab && fab.style.display !== 'none');
    }, { timeout: 30000 });

    const initial = await page.evaluate(() => {
      const sr = document.getElementById('__ace_host__').shadowRoot;
      return {
        title: sr.getElementById('ace-title').textContent,
        meta: sr.getElementById('ace-meta').textContent
      };
    });
    console.log('[E2E] 识别结果:', initial.title, '|', initial.meta);
    assert(initial.title.includes('DeepSeek'), '悬浮面板标题应包含 DeepSeek，实际: ' + initial.title);

    await page.evaluate(() => {
      document.getElementById('__ace_host__').shadowRoot.getElementById('ace-fab').click();
    });
    await page.waitForFunction(() => {
      const sr = document.getElementById('__ace_host__').shadowRoot;
      return sr.getElementById('ace-panel').hidden === false;
    }, { timeout: 5000 });

    console.log('[E2E] 点击“导出 Markdown”…');
    await page.evaluate(() => {
      const sr = document.getElementById('__ace_host__').shadowRoot;
      sr.getElementById('ace-export').click();
    });

    await page.waitForFunction(() => {
      const sr = document.getElementById('__ace_host__').shadowRoot;
      const toast = sr.getElementById('ace-toast');
      return toast && !toast.hidden && toast.textContent.indexOf('已导出') !== -1;
    }, { timeout: 90000, polling: 300 });

    const download = await waitForDownload(60000);
    assert(download, '没有找到下载的 Markdown 文件');

    const markdown = fs.readFileSync(download.file, 'utf8');
    console.log('[E2E] 已下载:', download.name, download.size, 'bytes');
    assert(download.name.endsWith('.md'), '下载文件名应以 .md 结尾');
    assert(markdown.includes('# DeepSeek 对话导出'), 'Markdown 缺少标题');
    assert(markdown.includes('**我：**'), 'Markdown 缺少用户标签（应为“我”）');
    assert(markdown.includes('**DeepSeek：**'), 'Markdown 缺少 AI 标签');
    assert(markdown.includes('**让权等待**'), 'Markdown 缺少 DeepSeek 回答正文');
    assert(markdown.includes('消息数**：8'), 'Markdown 消息数应为 8');
    const separators = (markdown.match(/^---$/gm) || []).length;
    assert(separators >= 9, '轮次分割线数量不足，实际: ' + separators);
    console.log('[E2E] Markdown 校验通过，分割线:', separators);
    // 把第一次下载的文件改名，避免 popup 阶段同名文件被浏览器覆盖/复用
    fs.renameSync(download.file, path.join(DOWNLOADS, 'first-download.md'));

    console.log('[E2E] 打开 popup.html 检查脚本…');
    const popup = await browser.newPage();
    const popupErrors = [];
    popup.on('pageerror', (error) => popupErrors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const popupState = await popup.evaluate(() => ({
      title: document.getElementById('statusTitle').textContent,
      hasExport: !!document.getElementById('exportBtn'),
      hasStyle: getComputedStyle(document.body).width
    }));
    console.log('[E2E] popup:', JSON.stringify(popupState), 'errors:', popupErrors.length);
    assert(popupState.hasExport, 'popup 缺少导出按钮');
    assert(popupErrors.length === 0, 'popup 出现脚本错误: ' + popupErrors.join('; '));

    // ---- popup 完整流程：把 active tab 指向对话页，模拟用户点击扩展图标 ----
    console.log('[E2E] 模拟 popup 真实目标标签页并导出…');
    const worker = await workerTarget.worker();
    const tabList = await worker.evaluate(async () => await chrome.tabs.query({}));
    const chatTab = tabList.find((tab) => (tab.url || '').includes('deepseek-page.html'));
    assert(chatTab, '没有找到对话标签页');

    const popup2 = await browser.newPage();
    const popupErrors2 = [];
    popup2.on('pageerror', (error) => popupErrors2.push(error.message));
    await popup2.setViewport({ width: 360, height: 560, deviceScaleFactor: 2 });
    await popup2.evaluateOnNewDocument((tabId, tabUrl) => {
      const originalQuery = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = function (query, callback) {
        if (query && query.active) {
          const result = [{ id: tabId, url: tabUrl, active: true, windowId: 1 }];
          if (typeof callback === 'function') { callback(result); return; }
          return Promise.resolve(result);
        }
        return originalQuery(query, callback);
      };
    }, chatTab.id, chatTab.url);

    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    await popup2.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await popup2.waitForFunction(
      () => document.getElementById('statusTitle').textContent.indexOf('DeepSeek') !== -1,
      { timeout: 20000 }
    );
    const popupDetected = await popup2.evaluate(() => ({
      title: document.getElementById('statusTitle').textContent,
      count: document.getElementById('statusCount').textContent
    }));
    console.log('[E2E] popup 识别:', JSON.stringify(popupDetected));
    assert(popupDetected.count.indexOf('8') !== -1, 'popup 消息数应为 8，实际: ' + popupDetected.count);
    fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
    await popup2.screenshot({ path: path.join(ROOT, 'docs', 'screenshot-popup.png') });

    const beforeFiles = new Set(listDownloads());
    await popup2.click('#exportBtn');
    await popup2.waitForFunction(
      () => document.getElementById('statusTitle').textContent === '导出完成',
      { timeout: 90000, polling: 300 }
    );
    const popupResult = await popup2.evaluate(() => ({
      title: document.getElementById('statusTitle').textContent,
      count: document.getElementById('statusCount').textContent,
      preview: document.getElementById('preview').textContent.slice(0, 2000)
    }));
    assert(popupResult.preview.includes('**我：**'), 'popup 预览缺少用户标签');
    assert(popupResult.preview.includes('**DeepSeek：**'), 'popup 预览缺少 AI 标签');
    const newFiles = await (async () => {
      const start = Date.now();
      while (Date.now() - start < 15000) {
        const files = listDownloads().filter((name) => !beforeFiles.has(name) && name.endsWith('.md'));
        if (files.length) return files;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return [];
    })();
    assert(newFiles.length >= 1, 'popup 导出没有产生新的 Markdown 文件');
    assert(popupErrors2.length === 0, 'popup 流程出现脚本错误: ' + popupErrors2.join('; '));
    console.log('[E2E] popup 导出成功:', popupResult.count, '新文件:', newFiles.join(', '));

    console.log('[E2E] 页面脚本错误数:', errors.length);
    if (errors.length) console.log('[E2E] 错误列表:\n' + errors.join('\n'));
    assert(errors.filter((item) => item.startsWith('pageerror')).length === 0, '页面出现未捕获异常');

    fs.writeFileSync(path.join(ROOT, 'test', 'results', 'e2e-download.md'), markdown, 'utf8');
    fs.writeFileSync(path.join(ROOT, 'test', 'results', 'e2e-report.json'), JSON.stringify({
      ok: true,
      extensionId,
      download: { name: download.name, size: download.size },
      initial,
      separators,
      popupState,
      pageErrors: errors
    }, null, 2), 'utf8');
    console.log('[E2E] 全部通过 ✅');
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

main().catch((error) => {
  console.error('[E2E] 失败:', error && error.stack ? error.stack : error);
  try {
    fs.writeFileSync(path.join(ROOT, 'test', 'results', 'e2e-report.json'), JSON.stringify({
      ok: false,
      error: String(error && error.stack ? error.stack : error)
    }, null, 2), 'utf8');
  } catch { /* ignore */ }
  process.exitCode = 1;
});
