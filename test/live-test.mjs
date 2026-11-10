#!/usr/bin/env node
/*
 * 真实站点测试（可选，需要联网）：
 * 用生产 manifest 加载扩展，打开 DeepSeek 公开分享页，验证自动识别、悬浮按钮、
 * 导出下载与 Markdown 内容，并保存截图到 docs/。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PUPPETEER_DIR = process.env.ACE_PUPPETEER_DIR || path.join(os.tmpdir(), 'ace-e2e');
const requireFromE2E = createRequire(path.join(PUPPETEER_DIR, 'package.json'));
const puppeteer = requireFromE2E('puppeteer-core');

const SHARE_URL = process.env.ACE_LIVE_URL || 'https://chat.deepseek.com/share/hap0v75jvcj4ck4iyb';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-live-'));
const PROFILE = path.join(WORK, 'profile');
const DOWNLOADS = path.join(WORK, 'downloads');
const DOCS = path.join(ROOT, 'docs');
fs.mkdirSync(DOWNLOADS, { recursive: true });
fs.mkdirSync(DOCS, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForDownload(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = fs.readdirSync(DOWNLOADS).filter((name) => name.endsWith('.md'));
    if (files.length) {
      const file = path.join(DOWNLOADS, files[0]);
      const stat = fs.statSync(file);
      if (stat.size > 0) return { file, name: files[0], size: stat.size };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

async function main() {
  console.log('[Live] 打开:', SHARE_URL);
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    userDataDir: PROFILE,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1280,900'
    ]
  });

  try {
    const workerTarget = await browser.waitForTarget(
      (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
      { timeout: 20000 }
    );
    const extensionId = new URL(workerTarget.url()).host;
    console.log('[Live] 扩展 ID:', extensionId);

    const browserClient = await browser.target().createCDPSession();
    await browserClient.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS,
      eventsEnabled: true
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => console.log('[Live] pageerror:', error.message));

    await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    console.log('[Live] 页面已打开，等待对话渲染与悬浮按钮…');

    await page.waitForFunction(() => {
      const host = document.getElementById('__ace_host__');
      const fab = host && host.shadowRoot && host.shadowRoot.getElementById('ace-fab');
      return !!(fab && fab.style.display !== 'none');
    }, { timeout: 60000, polling: 500 });

    const info = await page.evaluate(() => {
      const sr = document.getElementById('__ace_host__').shadowRoot;
      return {
        title: sr.getElementById('ace-title').textContent,
        meta: sr.getElementById('ace-meta').textContent,
        bodyText: document.body.innerText.slice(0, 300)
      };
    });
    console.log('[Live] 识别:', info.title, '|', info.meta);

    await page.screenshot({ path: path.join(DOCS, 'screenshot-chat.png') });
    await page.evaluate(() => {
      document.getElementById('__ace_host__').shadowRoot.getElementById('ace-fab').click();
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await page.screenshot({ path: path.join(DOCS, 'screenshot-panel.png') });

    await page.evaluate(() => {
      document.getElementById('__ace_host__').shadowRoot.getElementById('ace-export').click();
    });
    await page.waitForFunction(() => {
      const sr = document.getElementById('__ace_host__').shadowRoot;
      const toast = sr.getElementById('ace-toast');
      return toast && !toast.hidden && toast.textContent.indexOf('已导出') !== -1;
    }, { timeout: 120000, polling: 500 });

    const download = await waitForDownload();
    assert(download, '没有下载到 Markdown 文件');
    const markdown = fs.readFileSync(download.file, 'utf8');
    console.log('[Live] 已下载:', download.name, download.size, 'bytes');

    assert(markdown.includes('# DeepSeek 对话导出'), 'Markdown 缺少标题');
    assert(markdown.includes('**我：**'), 'Markdown 缺少“我：”标签');
    assert(markdown.includes('**DeepSeek：**'), 'Markdown 缺少“DeepSeek：”标签');
    assert(markdown.includes('让权等待'), 'Markdown 缺少“让权等待”正文');
    const countMatch = markdown.match(/消息数\*\*：(\d+)/);
    assert(countMatch, 'Markdown 缺少消息数');
    const messageCount = Number(countMatch[1]);
    assert(messageCount >= 8, '消息数过少: ' + messageCount);
    const labels = [...markdown.matchAll(/^\*\*(我|DeepSeek)：\*\*$/gm)].map((match) => match[1]);
    assert(labels.length === messageCount, `标签数 ${labels.length} 与消息数 ${messageCount} 不一致`);
    for (let i = 1; i < labels.length; i++) {
      assert(labels[i] !== labels[i - 1], `第 ${i} 条消息与前一条角色重复（${labels[i]}）`);
    }
    console.log('[Live] 消息数:', messageCount, '用户/AI 标签:', labels.filter((x) => x === '我').length, '/', labels.filter((x) => x === 'DeepSeek').length);
    fs.copyFileSync(download.file, path.join(DOCS, 'sample-deepseek-export.md'));
    fs.copyFileSync(download.file, path.join(ROOT, 'test', 'results', 'live-deepseek-export.md'));

    const popup = await browser.newPage();
    await popup.setViewport({ width: 360, height: 560, deviceScaleFactor: 1 });
    const popupErrors = [];
    popup.on('pageerror', (error) => popupErrors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert(popupErrors.length === 0, 'popup 脚本错误: ' + popupErrors.join('; '));

    fs.writeFileSync(path.join(ROOT, 'test', 'results', 'live-report.json'), JSON.stringify({
      ok: true,
      url: SHARE_URL,
      extensionId,
      info,
      download: { name: download.name, size: download.size },
      popupErrors
    }, null, 2), 'utf8');
    console.log('[Live] 全部通过 ✅');
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[Live] 失败:', error && error.stack ? error.stack : error);
  try {
    fs.writeFileSync(path.join(ROOT, 'test', 'results', 'live-report.json'), JSON.stringify({
      ok: false,
      error: String(error && error.stack ? error.stack : error)
    }, null, 2), 'utf8');
  } catch { /* ignore */ }
  process.exitCode = 1;
});
