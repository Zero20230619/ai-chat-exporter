/*!
 * AI Chat Exporter - popup
 */
'use strict';

const DEFAULTS = {
  includeHeader: true,
  floatingButton: true
};

const $ = (id) => document.getElementById(id);

const els = {
  statusDot: $('statusDot'),
  statusTitle: $('statusTitle'),
  statusDetail: $('statusDetail'),
  statusCount: $('statusCount'),
  includeHeader: $('includeHeader'),
  floatingButton: $('floatingButton'),
  exportBtn: $('exportBtn'),
  copyBtn: $('copyBtn'),
  previewBox: $('previewBox'),
  preview: $('preview'),
  tip: $('tip')
};

let activeTab = null;
let contentReady = false;
let busy = false;

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(DEFAULTS, (value) => resolve(Object.assign({}, DEFAULTS, value || {})));
    } catch (error) {
      resolve(Object.assign({}, DEFAULTS));
    }
  });
}

function saveSettings(patch) {
  try {
    chrome.storage.sync.set(patch);
  } catch (error) {
    /* ignore */
  }
}

function getActiveTab() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve((tabs && tabs[0]) || null);
      });
    } catch (error) {
      resolve(null);
    }
  });
}

function sendToTab(tabId, message, timeoutMs) {
  return new Promise((resolve) => {
    let finished = false;
    const limit = timeoutMs == null ? 5000 : timeoutMs;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(null);
    }, limit);

    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch (error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (error) { return ''; }
}

function setDot(kind) {
  els.statusDot.className = 'status-dot' + (kind ? ' ' + kind : '');
}

function setCount(text) {
  if (text) {
    els.statusCount.textContent = text;
    els.statusCount.hidden = false;
  } else {
    els.statusCount.textContent = '';
    els.statusCount.hidden = true;
  }
}

function setStatus(kind, title, detail) {
  setDot(kind);
  els.statusTitle.textContent = title;
  els.statusDetail.textContent = detail || '';
}

function setButtonsDisabled(disabled) {
  els.exportBtn.disabled = disabled;
  els.copyBtn.disabled = disabled;
}

function setBusy(value, label) {
  busy = value;
  document.body.classList.toggle('busy', value);
  setButtonsDisabled(value || !contentReady);
  if (value) {
    els.exportBtn.textContent = label || '正在读取整段对话…';
  } else {
    els.exportBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>导出 Markdown 文件</span>';
  }
}

function showPreview(markdown) {
  const limit = 3000;
  const snippet = markdown.length > limit ? markdown.slice(0, limit) + '\n\n…（预览已截断）' : markdown;
  els.preview.textContent = snippet;
  els.previewBox.hidden = false;
  els.previewBox.open = true;
}

function renderStatus(status) {
  const aiName = status.aiName || 'AI';
  const host = hostOf(status.url || '') || (activeTab && hostOf(activeTab.url || ''));
  if (status.hasMessages) {
    setDot('ok');
    els.statusTitle.textContent = aiName + ' 对话';
    els.statusDetail.textContent = (status.knownSite ? '已识别站点：' + (status.siteName || aiName) : '通用识别模式') +
      (host ? ' · ' + host : '');
    setCount((status.count || 0) + ' 条消息已挂载');
    els.tip.textContent = '点击下方按钮即可导出。导出时会自动滚动页面，把全部历史消息写入文件。';
  } else {
    setDot('warn');
    els.statusTitle.textContent = aiName + ' 页面';
    els.statusDetail.textContent = '暂时没有发现对话。如果页面还在加载，请稍等片刻后重新打开扩展。';
    setCount('');
    els.tip.textContent = '打开一段已有的对话后再导出；空白新对话没有内容可导出。';
  }
}

function renderError(message) {
  setDot('err');
  els.statusTitle.textContent = '无法导出';
  els.statusDetail.textContent = message;
  setCount('');
}

function renderSuccess(result, mode) {
  setDot('ok');
  if (mode === 'copy') {
    els.statusTitle.textContent = '已复制到剪贴板';
    els.statusDetail.textContent = '共 ' + result.count + ' 条消息，可直接粘贴到笔记里。';
  } else {
    els.statusTitle.textContent = '导出完成';
    els.statusDetail.textContent = '已保存：' + (result.filename || '对话.md');
  }
  setCount('已导出 ' + result.count + ' 条消息');
  if (result.markdown) showPreview(result.markdown);
}

/* ------------------------------------------------------------------ *
 * 页面连接
 * ------------------------------------------------------------------ */

async function detect(tab) {
  activeTab = tab;
  contentReady = false;

  if (!tab || !tab.id) {
    renderError('没有找到当前标签页。');
    setButtonsDisabled(true);
    return false;
  }

  const url = tab.url || '';
  if (!/^https?:/i.test(url)) {
    renderError('这是浏览器内部页面，扩展无法读取。请在 DeepSeek、ChatGPT 等对话网页中使用。');
    setButtonsDisabled(true);
    return false;
  }

  setStatus('', '正在识别当前页面…', hostOf(url));
  setCount('');

  let status = await sendToTab(tab.id, { type: 'ACE_PING' }, 2500);

  if (!status) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/extractor.js', 'src/content.js']
      });
      await sleep(180);
      status = await sendToTab(tab.id, { type: 'ACE_PING' }, 4000);
    } catch (error) {
      renderError('无法在此页面注入识别脚本：' + (error && error.message ? error.message : String(error)));
      setButtonsDisabled(true);
      return false;
    }
  }

  if (!status) {
    renderError('当前页面没有响应。请刷新页面后重试。');
    setButtonsDisabled(true);
    return false;
  }

  contentReady = true;
  setButtonsDisabled(false);
  renderStatus(status);
  return true;
}

async function ensureReady() {
  if (!activeTab) return false;
  if (!contentReady) return detect(activeTab);
  return true;
}

/* ------------------------------------------------------------------ *
 * 动作
 * ------------------------------------------------------------------ */

async function runExport(mode) {
  if (busy) return;
  setBusy(true, '正在读取整段对话…');
  try {
    const ready = await ensureReady();
    if (!ready) throw new Error('无法连接当前页面，请刷新后重试。');

    const response = await sendToTab(activeTab.id, {
      type: mode === 'copy' ? 'ACE_COPY' : 'ACE_EXPORT',
      options: { includeHeader: !!els.includeHeader.checked }
    }, 180000);

    if (!response) {
      throw new Error('页面没有响应。如果对话很长，请刷新页面后重试。');
    }
    if (!response.ok) {
      throw new Error(response.error || '导出失败');
    }
    renderSuccess(response, mode);
  } catch (error) {
    renderError(error && error.message ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

/* ------------------------------------------------------------------ *
 * 初始化
 * ------------------------------------------------------------------ */

async function init() {
  setButtonsDisabled(true);
  const settings = await getSettings();
  els.includeHeader.checked = !!settings.includeHeader;
  els.floatingButton.checked = !!settings.floatingButton;

  els.includeHeader.addEventListener('change', () => {
    saveSettings({ includeHeader: !!els.includeHeader.checked });
  });
  els.floatingButton.addEventListener('change', () => {
    saveSettings({ floatingButton: !!els.floatingButton.checked });
  });

  els.exportBtn.addEventListener('click', () => { runExport('download'); });
  els.copyBtn.addEventListener('click', () => { runExport('copy'); });

  const tab = await getActiveTab();
  await detect(tab);
}

init();
