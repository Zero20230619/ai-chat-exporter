/*!
 * AI Chat Exporter - background service worker
 * 只做两件事：
 *  1. 首次安装时写入默认设置；
 *  2. 为极少数不支持页面内 blob 下载的环境提供 data URL 下载兜底。
 */
'use strict';

const DEFAULTS = {
  includeHeader: true,
  floatingButton: true
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const current = await chrome.storage.sync.get(DEFAULTS);
    await chrome.storage.sync.set(Object.assign({}, DEFAULTS, current || {}));
  } catch (error) {
    console.warn('[AI 对话导出] 初始化设置失败', error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'ACE_DOWNLOAD_VIA_BACKGROUND') return;

  const filename = String(message.filename || '对话.md');
  const text = String(message.text || '');
  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text);

  chrome.downloads.download({ url: dataUrl, filename, saveAs: false })
    .then((downloadId) => sendResponse({ ok: true, downloadId }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
