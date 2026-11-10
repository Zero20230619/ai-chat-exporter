/*!
 * AI Chat Exporter - content script
 * 负责页面悬浮按钮、消息通信、滚动采集、下载/复制。
 */
(function () {
  'use strict';

  if (window.__ACE_CONTENT_LOADED__) return;
  window.__ACE_CONTENT_LOADED__ = true;

  var X = window.__ACE_EXTRACTOR__;
  if (!X) {
    console.warn('[AI 对话导出] extractor core 未加载');
    return;
  }

  var settings = {
    includeHeader: true,
    floatingButton: true
  };

  var ui = null;
  var busy = false;
  var refreshTimer = null;
  var toastTimer = null;
  var observer = null;
  var started = false;

  /* ------------------------------------------------------------------ *
   * 工具
   * ------------------------------------------------------------------ */

  function hostName() {
    try { return location.hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  function storageGet(defaults, callback) {
    try {
      chrome.storage.sync.get(defaults, function (value) {
        callback(Object.assign({}, defaults, value || {}));
      });
    } catch (e) {
      callback(defaults);
    }
  }

  function saveSetting(key, value) {
    try {
      var patch = {};
      patch[key] = value;
      chrome.storage.sync.set(patch);
    } catch (e) { /* ignore */ }
  }

  function downloadText(text, filename) {
    try {
      var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(function () {
        try { a.remove(); } catch (e) { /* ignore */ }
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
      }, 30000);
    } catch (error) {
      // 极少数页面环境不允许页面内 blob 下载，交给 background 用 data URL 兜底
      try {
        var request = chrome.runtime.sendMessage({
          type: 'ACE_DOWNLOAD_VIA_BACKGROUND',
          text: text,
          filename: filename
        });
        if (request && typeof request.catch === 'function') request.catch(function () {});
      } catch (sendError) {
        throw error;
      }
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return legacyCopy(text);
      });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    (document.body || document.documentElement).appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    try { ta.remove(); } catch (e) { /* ignore */ }
    return ok;
  }

  /* ------------------------------------------------------------------ *
   * 悬浮 UI
   * ------------------------------------------------------------------ */

  function ensureUi() {
    if (ui && ui.host && ui.host.isConnected) return ui;

    var host = document.createElement('div');
    host.id = '__ace_host__';
    var shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = [
      '<style>',
      ':host{all:initial;position:fixed;right:0;bottom:0;width:0;height:0;z-index:2147483647}',
      '*{box-sizing:border-box}',
      '.fab{position:fixed;right:18px;bottom:88px;display:inline-flex;align-items:center;gap:7px;',
      'padding:10px 15px 10px 13px;border:0;border-radius:999px;cursor:pointer;',
      'background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;',
      'font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
      'box-shadow:0 8px 24px rgba(79,70,229,.38),0 2px 6px rgba(0,0,0,.12);',
      'transition:transform .15s ease,box-shadow .15s ease;z-index:2147483647}',
      '.fab:hover{transform:translateY(-1px);box-shadow:0 10px 28px rgba(79,70,229,.45)}',
      '.fab:active{transform:translateY(0)}',
      '.fab svg{width:16px;height:16px;flex:none}',
      '.panel{position:fixed;right:18px;bottom:144px;width:308px;padding:14px;border-radius:15px;',
      'background:#fff;color:#111827;border:1px solid rgba(17,24,39,.08);',
      'box-shadow:0 18px 50px rgba(15,23,42,.22),0 2px 8px rgba(15,23,42,.08);',
      'font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
      'z-index:2147483647}',
      '.panel[hidden]{display:none}',
      '.head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}',
      '.title{font-size:14px;font-weight:700;color:#111827}',
      '.meta{margin-top:3px;font-size:12px;color:#6b7280}',
      '.close{flex:none;width:24px;height:24px;border:0;border-radius:7px;background:#f3f4f6;color:#6b7280;',
      'font:16px/1 sans-serif;cursor:pointer;padding:0}',
      '.close:hover{background:#e5e7eb;color:#111827}',
      '.check{display:flex;align-items:center;gap:8px;font-size:12px;color:#374151;margin:0 0 12px;cursor:pointer;user-select:none}',
      '.check input{width:14px;height:14px;margin:0;accent-color:#4f46e5;cursor:pointer}',
      '.actions{display:flex;gap:8px}',
      '.primary,.ghost{border:0;border-radius:9px;padding:9px 12px;font:600 12.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer}',
      '.primary{flex:1;background:#4f46e5;color:#fff}',
      '.primary:hover{background:#4338ca}',
      '.ghost{background:#eef2ff;color:#4338ca}',
      '.ghost:hover{background:#e0e7ff}',
      '.primary:disabled,.ghost:disabled{opacity:.55;cursor:default}',
      '.hint{margin-top:10px;font-size:11.5px;line-height:1.5;color:#9ca3af}',
      '.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:calc(100vw - 40px);',
      'padding:10px 16px;border-radius:10px;background:rgba(17,24,39,.94);color:#fff;',
      'font:500 12.5px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;',
      'box-shadow:0 10px 30px rgba(0,0,0,.25);white-space:pre-line;z-index:2147483647;pointer-events:none}',
      '.toast[hidden]{display:none}',
      '</style>',
      '<div class="panel" id="ace-panel" hidden>',
      '  <div class="head">',
      '    <div><div class="title" id="ace-title">导出对话</div><div class="meta" id="ace-meta"></div></div>',
      '    <button class="close" id="ace-close" title="收起" aria-label="收起">×</button>',
      '  </div>',
      '  <label class="check"><input type="checkbox" id="ace-header"> 包含标题、来源与导出时间</label>',
      '  <div class="actions">',
      '    <button class="primary" id="ace-export">导出 Markdown</button>',
      '    <button class="ghost" id="ace-copy">复制</button>',
      '  </div>',
      '  <div class="hint">导出时会自动滚动页面，读取全部历史消息。</div>',
      '</div>',
      '<button class="fab" id="ace-fab" title="导出当前 AI 对话为 Markdown">',
      '  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '  <span>导出对话</span>',
      '</button>',
      '<div class="toast" id="ace-toast" hidden></div>'
    ].join('');

    (document.body || document.documentElement).appendChild(host);

    var $ = function (id) { return shadow.getElementById(id); };
    var panel = $('ace-panel');
    var fab = $('ace-fab');
    var headerOpt = $('ace-header');
    var exportBtn = $('ace-export');
    var copyBtn = $('ace-copy');
    var toast = $('ace-toast');

    headerOpt.checked = !!settings.includeHeader;
    headerOpt.addEventListener('change', function () {
      settings.includeHeader = !!headerOpt.checked;
      saveSetting('includeHeader', settings.includeHeader);
    });

    fab.addEventListener('click', function () {
      if (panel.hidden) {
        refreshUi(true);
        panel.hidden = false;
      } else {
        panel.hidden = true;
      }
    });

    $('ace-close').addEventListener('click', function () { panel.hidden = true; });

    exportBtn.addEventListener('click', function () {
      handleExport('download', { includeHeader: settings.includeHeader }).catch(function () {});
    });
    copyBtn.addEventListener('click', function () {
      handleExport('copy', { includeHeader: settings.includeHeader }).catch(function () {});
    });

    ui = {
      host: host,
      shadow: shadow,
      panel: panel,
      fab: fab,
      title: $('ace-title'),
      meta: $('ace-meta'),
      headerOpt: headerOpt,
      exportBtn: exportBtn,
      copyBtn: copyBtn,
      toast: toast
    };
    return ui;
  }

  function removeUi() {
    if (ui && ui.host) {
      try { ui.host.remove(); } catch (e) { /* ignore */ }
    }
    ui = null;
  }

  function showFab(show) {
    if (!ui) return;
    ui.fab.style.display = show ? '' : 'none';
    if (!show) ui.panel.hidden = true;
  }

  function updatePanel(status) {
    if (!ui || !status) return;
    var aiName = status.aiName || 'AI';
    ui.title.textContent = aiName + ' 对话';
    var suffix = status.knownSite ? hostName() : (hostName() + ' · 通用识别');
    ui.meta.textContent = (status.count || 0) + ' 条消息已挂载 · ' + suffix;
    ui.headerOpt.checked = !!settings.includeHeader;
  }

  function showToast(message, sticky) {
    // 用户关闭悬浮按钮时不创建任何页面 UI；popup 自己会显示状态
    if (!settings.floatingButton) return;
    var u = ensureUi();
    u.toast.textContent = message;
    u.toast.hidden = false;
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (!sticky) {
      toastTimer = setTimeout(function () {
        if (ui) ui.toast.hidden = true;
      }, 4200);
    }
  }

  function setBusy(value) {
    busy = value;
    if (!ui) return;
    ui.exportBtn.disabled = value;
    ui.copyBtn.disabled = value;
    ui.exportBtn.textContent = value ? '正在读取…' : '导出 Markdown';
  }

  /* ------------------------------------------------------------------ *
   * 导出与复制
   * ------------------------------------------------------------------ */

  function handleExport(mode, options) {
    if (busy) return Promise.reject(new Error('正在导出中，请稍候'));
    busy = true;
    setBusy(true);
    showToast('正在读取整段对话…', true);

    var includeHeader = options && typeof options.includeHeader === 'boolean'
      ? options.includeHeader
      : settings.includeHeader;

    return X.extractAll({
      deep: true,
      onProgress: function (progress) {
        showToast('正在读取对话… 已发现 ' + progress.count + ' 条', true);
      }
    }).then(function (data) {
      if (!data.messages || !data.messages.length) {
        throw new Error('没有识别到对话消息。请确认页面已经显示出对话内容。');
      }
      var markdown = X.buildMarkdown(data, { includeHeader: includeHeader });
      var filename = X.makeFilename(data);

      if (mode === 'download') {
        downloadText(markdown, filename);
        showToast('已导出 ' + data.messages.length + ' 条消息\n' + filename, false);
      } else {
        return copyText(markdown).then(function (ok) {
          showToast(ok ? '已复制 ' + data.messages.length + ' 条消息到剪贴板' : '复制失败，请改用“导出 Markdown”', false);
          return {
            ok: ok,
            error: ok ? undefined : '复制失败，请改用“导出 Markdown”文件',
            markdown: markdown,
            filename: filename,
            count: data.messages.length,
            aiName: data.aiName
          };
        });
      }
      return { ok: true, markdown: markdown, filename: filename, count: data.messages.length, aiName: data.aiName };
    }).catch(function (err) {
      var message = err && err.message ? err.message : String(err);
      showToast('导出失败：' + message, false);
      throw err;
    }).finally(function () {
      busy = false;
      setBusy(false);
      try { updatePanel(X.quickStatus()); } catch (e) { /* ignore */ }
    });
  }

  /* ------------------------------------------------------------------ *
   * 自动检测
   * ------------------------------------------------------------------ */

  function scheduleRefresh(delay) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      refreshUi(false);
    }, delay == null ? 1200 : delay);
  }

  function refreshUi(force) {
    if (!started) return;
    var status;
    try { status = X.quickStatus(); } catch (e) { return; }

    if (!settings.floatingButton) {
      removeUi();
      return;
    }
    if (!status.hasMessages) {
      if (ui) {
        showFab(false);
      }
      return;
    }
    ensureUi();
    showFab(true);
    updatePanel(status);
    if (force) { /* 面板可见时刷新 */ }
  }

  function start() {
    if (started) return;
    started = true;
    refreshUi(true);
    try {
      observer = new MutationObserver(function () { scheduleRefresh(1400); });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }
    setInterval(function () { refreshUi(false); }, 6000);
    window.addEventListener('popstate', function () { scheduleRefresh(400); });
    window.addEventListener('hashchange', function () { scheduleRefresh(400); });
  }

  /* ------------------------------------------------------------------ *
   * 消息通信（popup 调用）
   * ------------------------------------------------------------------ */

  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('ACE_') !== 0) return;

      if (msg.type === 'ACE_PING' || msg.type === 'ACE_STATUS') {
        var status;
        try { status = X.quickStatus(); } catch (e) { status = { count: 0, hasMessages: false, error: String(e) }; }
        sendResponse(status);
        return false;
      }

      if (msg.type === 'ACE_EXPORT' || msg.type === 'ACE_COPY') {
        handleExport(msg.type === 'ACE_EXPORT' ? 'download' : 'copy', msg.options)
          .then(function (result) { sendResponse(Object.assign({ ok: true }, result)); })
          .catch(function (err) {
            sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
          });
        return true;
      }
    });
  } catch (e) {
    console.warn('[AI 对话导出] 无法注册消息监听', e);
  }

  storageGet(settings, function (value) {
    settings = value;
    start();
  });

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      if (changes.includeHeader) settings.includeHeader = !!changes.includeHeader.newValue;
      if (changes.floatingButton) {
        settings.floatingButton = !!changes.floatingButton.newValue;
        if (!settings.floatingButton) removeUi();
        else refreshUi(true);
      }
      if (ui) ui.headerOpt.checked = !!settings.includeHeader;
    });
  } catch (e) { /* ignore */ }
})();
