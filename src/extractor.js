/*!
 * AI Chat Exporter - extractor core
 * 纯 DOM 逻辑，不依赖 chrome.* API，便于单元测试与注入执行。
 * 暴露：window.__ACE_EXTRACTOR__
 */
(function () {
  'use strict';

  if (window.__ACE_EXTRACTOR__ && window.__ACE_EXTRACTOR__.version) return;

  var VERSION = '1.0.0';

  var UI_SKIP_SELECTOR = [
    'button',
    '[role="button"]',
    '.ds-button',
    '[class*="ds-button"]',
    '[data-testid*="copy"]',
    '[data-testid*="feedback"]',
    '[data-testid*="thumbs"]',
    '[aria-label*="复制"]',
    '[aria-label*="Copy"]',
    '[aria-label*="下载"]',
    '[aria-label*="Download"]',
    '[aria-label*="重新生成"]',
    '[aria-label*="Regenerate"]',
    '[class*="sr-only"]',
    '[class*="visually-hidden"]',
    '.md-code-block-banner-wrap',
    '.md-code-block-banner',
    '.code-block-banner',
    '.code-block-decoration',
    '[class*="code-block-header"]',
    '[class*="code-info-button"]',
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'video',
    'audio',
    'iframe',
    'input',
    'textarea',
    'select'
  ].join(',');

  /* ------------------------------------------------------------------ *
   * 站点识别
   * ------------------------------------------------------------------ */

  var SITES = [
    { id: 'deepseek', name: 'DeepSeek', aiName: 'DeepSeek', adapter: 'deepseek', hosts: ['chat.deepseek.com', 'deepseek.com'] },
    { id: 'chatgpt', name: 'ChatGPT', aiName: 'ChatGPT', adapter: 'chatgpt', hosts: ['chatgpt.com', 'chat.openai.com'] },
    { id: 'claude', name: 'Claude', aiName: 'Claude', adapter: 'claude', hosts: ['claude.ai'] },
    { id: 'gemini', name: 'Gemini', aiName: 'Gemini', adapter: 'gemini', hosts: ['gemini.google.com'] },
    { id: 'copilot', name: 'Copilot', aiName: 'Copilot', adapter: 'copilot', hosts: ['copilot.microsoft.com', 'www.copilot.com', 'copilot.com'] },
    { id: 'kimi', name: 'Kimi', aiName: 'Kimi', adapter: 'auto', hosts: ['kimi.com', 'kimi.moonshot.cn', 'moonshot.cn'] },
    { id: 'tongyi', name: '通义千问', aiName: '通义千问', adapter: 'auto', hosts: ['tongyi.aliyun.com', 'tongyi.com'] },
    { id: 'qwen', name: 'Qwen', aiName: 'Qwen', adapter: 'auto', hosts: ['chat.qwen.ai', 'qwen.ai'] },
    { id: 'doubao', name: '豆包', aiName: '豆包', adapter: 'auto', hosts: ['doubao.com'] },
    { id: 'chatglm', name: '智谱清言', aiName: '智谱清言', adapter: 'auto', hosts: ['chatglm.cn'] },
    { id: 'zai', name: 'Z.ai', aiName: 'Z.ai', adapter: 'auto', hosts: ['chat.z.ai', 'z.ai'] },
    { id: 'yuanbao', name: '腾讯元宝', aiName: '腾讯元宝', adapter: 'auto', hosts: ['yuanbao.tencent.com'] },
    { id: 'mistral', name: 'Mistral', aiName: 'Mistral', adapter: 'auto', hosts: ['chat.mistral.ai', 'mistral.ai'] },
    { id: 'grok', name: 'Grok', aiName: 'Grok', adapter: 'auto', hosts: ['grok.com'] }
  ];

  var BRANDS = ['DeepSeek', 'ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Kimi', '通义千问', 'Qwen', '豆包', '智谱清言', 'Grok', 'Mistral', '腾讯元宝'];

  function detectSite(hostname) {
    var host = String(hostname == null ? (location.hostname || '') : hostname).toLowerCase();
    for (var i = 0; i < SITES.length; i++) {
      var site = SITES[i];
      for (var j = 0; j < site.hosts.length; j++) {
        var h = site.hosts[j];
        if (host === h || host.slice(-(h.length + 1)) === '.' + h) return site;
      }
    }
    return null;
  }

  function inferAiName(site, docTitle, hostname) {
    if (site && site.aiName) return site.aiName;
    var title = docTitle == null ? (document.title || '') : String(docTitle);
    for (var i = 0; i < BRANDS.length; i++) {
      if (title.indexOf(BRANDS[i]) !== -1) return BRANDS[i];
    }
    // 未识别的站点保持通用标签，避免把域名误当成 AI 名称
    return 'AI';
  }

  function getContext() {
    var site = detectSite();
    return {
      siteId: site ? site.id : 'unknown',
      siteName: site ? site.name : '',
      knownSite: !!site,
      aiName: inferAiName(site),
      userLabel: site ? '我' : '用户',
      adapterId: site ? site.adapter : 'auto',
      url: location.href,
      title: document.title
    };
  }

  /* ------------------------------------------------------------------ *
   * 通用小工具
   * ------------------------------------------------------------------ */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function formatDateTime(value) {
    var d = value instanceof Date && !isNaN(value.getTime()) ? value : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function compareDom(a, b) {
    if (!a || !b || a === b) return 0;
    var pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function isVisibleElement(el) {
    if (!el || !el.isConnected) return false;
    try {
      if (el.getClientRects && el.getClientRects().length > 0) return true;
      return el.offsetWidth > 0 || el.offsetHeight > 0;
    } catch (e) {
      return true;
    }
  }

  function hashText(s) {
    var h = 2166136261;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function settle(ms) {
    return new Promise(function (resolve) {
      var delay = ms == null ? 80 : ms;
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        setTimeout(resolve, delay);
      }
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          requestAnimationFrame(finish);
        });
        // 后台标签页/无头环境下 rAF 可能被节流，给一个定时器兜底
        setTimeout(finish, delay + 150);
      } else {
        setTimeout(resolve, delay + 40);
      }
    });
  }

  function findScrollable(el) {
    var node = el || null;
    while (node && node !== document.documentElement && node !== document.body) {
      if (node.nodeType === 1) {
        try {
          var cs = getComputedStyle(node);
          if (/(auto|scroll|overlay)/.test(cs.overflowY || '') && node.scrollHeight > node.clientHeight + 20) {
            return node;
          }
        } catch (e) { /* ignore */ }
      }
      node = node.parentElement;
    }
    var se = document.scrollingElement || document.documentElement;
    try {
      if (se && se.scrollHeight > se.clientHeight + 20) return se;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * HTML -> Markdown
   * ------------------------------------------------------------------ */

  function escapeHtmlText(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 用户消息按“纯文本”导出：只做最小转义，避免用户输入 ```、---、# 等破坏整个 Markdown 文件结构。
  function escapeUserPlainText(value) {
    return String(value || '').split('\n').map(function (line) {
      var out = escapeHtmlText(line).replace(/`/g, '\\`');
      var match = out.match(/^(\s{0,3})(#{1,6}\s|>|[-+*]\s|\d+[.)]\s|---+\s*$|===+\s*$)/);
      if (match) {
        var prefix = match[1];
        out = prefix + '\\' + out.slice(prefix.length);
      }
      return out;
    }).join('\n');
  }

  function htmlToMarkdown(rootEl) {
    if (!rootEl) return '';

    var codeStore = [];
    var inlineStore = [];

    function codePlaceholder(value) {
      var i = codeStore.push(value) - 1;
      return '\u0001C' + i + '\u0001';
    }
    function inlinePlaceholder(value) {
      var i = inlineStore.push(value) - 1;
      return '\u0001I' + i + '\u0001';
    }

    function restoreInline(text) {
      return String(text || '').replace(/\u0001I(\d+)\u0001/g, function (m, idx) {
        return inlineStore[Number(idx)] || '';
      });
    }

    function restoreAll(text) {
      return String(text || '')
        .replace(/\u0001C(\d+)\u0001/g, function (m, idx) { return codeStore[Number(idx)] || ''; })
        .replace(/\u0001I(\d+)\u0001/g, function (m, idx) { return inlineStore[Number(idx)] || ''; });
    }

    function renderText(node) {
      var text = String(node.nodeValue || '').replace(/\u00a0/g, ' ');
      text = text.replace(/[ \t\r\n]+/g, ' ');
      return escapeHtmlText(text);
    }

    function renderChildren(el) {
      var out = '';
      var children = el.childNodes || [];
      for (var i = 0; i < children.length; i++) out += render(children[i]);
      return out;
    }

    function wrapInline(inner, marker) {
      if (inner == null || inner === '') return '';
      var core = inner.trim();
      if (!core) return inner;
      var lead = (inner.match(/^\s*/) || [''])[0];
      var trail = (inner.match(/\s*$/) || [''])[0];
      return lead + marker + core + marker + trail;
    }

    function formatInlineCode(code) {
      var clean = String(code || '').replace(/\u00a0/g, ' ').replace(/\n/g, ' ');
      if (!clean.trim()) return '';
      var runs = clean.match(/`+/g) || [];
      var max = 0;
      for (var i = 0; i < runs.length; i++) max = Math.max(max, runs[i].length);
      var fence = new Array(max + 2).join('`');
      var needPad = clean.charAt(0) === '`' || clean.charAt(clean.length - 1) === '`';
      return fence + (needPad ? ' ' : '') + clean + (needPad ? ' ' : '') + fence;
    }

    function detectCodeLanguage(pre) {
      var lang = '';
      var codeEl = pre.querySelector('code');
      if (codeEl) {
        var cls = codeEl.className || '';
        var m = String(cls).match(/(?:language|lang)-([A-Za-z0-9_+#.-]+)/);
        if (m) lang = m[1];
      }
      if (!lang) lang = pre.getAttribute('data-language') || '';
      if (!lang) {
        // ChatGPT CodeMirror：语言标签在 pre 头部的 span 中
        var chatgptLang = pre.querySelector('.text-token-text-primary');
        if (chatgptLang) lang = (chatgptLang.textContent || '').trim();
      }
      if (!lang) {
        // Gemini：语言标签在 .code-block-decoration
        var codeBlock = pre.closest ? pre.closest('.code-block') : null;
        if (codeBlock) {
          var decoration = codeBlock.querySelector('.code-block-decoration span, .code-block-decoration');
          if (decoration) lang = (decoration.textContent || '').trim();
        }
      }
      if (!lang) {
        var block = pre.closest ? pre.closest('.md-code-block, [class*="code-block"]') : null;
        if (block) {
          var spans = block.querySelectorAll('.md-code-block-banner-wrap span, .md-code-block-banner span, [class*="code-block-banner"] span');
          for (var i = 0; i < spans.length; i++) {
            var t = (spans[i].textContent || '').trim();
            if (t && t.length <= 24 && !/^(复制|下载|copy|download|run|运行)$/i.test(t)) { lang = t; break; }
          }
        }
      }
      if (!lang) {
        var host = pre.parentElement;
        if (host) {
          var label = host.querySelector ? host.querySelector('[class*="language"], [data-language]') : null;
          if (label) lang = (label.getAttribute('data-language') || label.textContent || '').trim();
        }
      }
      return String(lang || '').replace(/[^A-Za-z0-9_+#.-]/g, '');
    }

    function getPreText(pre) {
      // ChatGPT CodeMirror 6：不能直接取 pre.textContent，否则会混入语言标签/Copy/Run
      var cmLines = pre.querySelectorAll('.cm-line');
      if (cmLines.length) {
        var cmParts = [];
        for (var c = 0; c < cmLines.length; c++) cmParts.push(cmLines[c].textContent || '');
        return cmParts.join('\n');
      }
      var cmContent = pre.querySelector('.cm-content');
      if (cmContent) return cmContent.innerText != null ? cmContent.innerText : (cmContent.textContent || '');
      var code = pre.querySelector('code');
      if (code) return code.textContent || '';
      // DeepSeek：pre 内每行一个 <span>，没有 <code>
      var lineSpans = [];
      for (var i = 0; i < pre.children.length; i++) {
        if (pre.children[i].tagName === 'SPAN') lineSpans.push(pre.children[i]);
      }
      if (lineSpans.length) {
        var parts = [];
        for (var j = 0; j < lineSpans.length; j++) parts.push(lineSpans[j].textContent || '');
        return parts.join('\n');
      }
      return pre.innerText != null ? pre.innerText : (pre.textContent || '');
    }

    function formatCodeBlock(code, lang) {
      code = String(code || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
      code = code.replace(/^\n+/, '').replace(/\n+$/, '');
      var runs = code.match(/`{3,}/g) || [];
      var max = 0;
      for (var i = 0; i < runs.length; i++) max = Math.max(max, runs[i].length);
      var fence = new Array(Math.max(3, max + 1) + 1).join('`');
      var tag = String(lang || '').toLowerCase().replace(/[^a-z0-9_+#.-]/g, '');
      return fence + tag + '\n' + code + '\n' + fence;
    }

    function renderList(listEl, ordered) {
      var items = [];
      for (var c = 0; c < listEl.children.length; c++) {
        if (listEl.children[c].tagName === 'LI') items.push(listEl.children[c]);
      }
      if (!items.length) return '';
      var lines = [];
      for (var i = 0; i < items.length; i++) {
        var li = items[i];
        var marker = ordered ? (i + 1) + '. ' : '- ';
        var inner = '';
        var nested = [];
        for (var j = 0; j < li.childNodes.length; j++) {
          var child = li.childNodes[j];
          if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) nested.push(child);
          else inner += render(child);
        }
        inner = inner.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        inner = restoreAll(inner);
        var innerLines = inner.split('\n').map(function (line) { return line.replace(/[ \t]+$/, ''); });
        while (innerLines.length && !innerLines[0].trim()) innerLines.shift();
        while (innerLines.length && !innerLines[innerLines.length - 1].trim()) innerLines.pop();
        if (!innerLines.length) innerLines.push('');
        lines.push(marker + innerLines[0]);
        for (var k = 1; k < innerLines.length; k++) {
          lines.push('    ' + innerLines[k]);
        }
        for (var n = 0; n < nested.length; n++) {
          var subLines = renderList(nested[n], nested[n].tagName === 'OL').split('\n').filter(function (line) { return line !== ''; });
          for (var s = 0; s < subLines.length; s++) lines.push('    ' + subLines[s]);
        }
      }
      return '\n\n' + lines.join('\n') + '\n\n';
    }

    function renderTable(table) {
      var rows = table.querySelectorAll('tr');
      if (!rows.length) return '';
      var matrix = [];
      for (var r = 0; r < rows.length; r++) {
        var cells = [];
        for (var c = 0; c < rows[r].children.length; c++) {
          var cell = rows[r].children[c];
          if (cell.tagName !== 'TH' && cell.tagName !== 'TD') continue;
          var cellText = restoreInline(renderChildren(cell));
          var text = cellText.replace(/\s*\n\s*/g, ' ').trim().replace(/\|/g, '\\|');
          cells.push(text);
        }
        if (cells.length) matrix.push(cells);
      }
      if (!matrix.length) return '';
      var cols = 0;
      for (var i = 0; i < matrix.length; i++) cols = Math.max(cols, matrix[i].length);
      var normalize = function (row) {
        var out = row.slice();
        while (out.length < cols) out.push('');
        return out;
      };
      var header = normalize(matrix[0]);
      var lines = [
        '| ' + header.join(' | ') + ' |',
        '| ' + header.map(function () { return '---'; }).join(' | ') + ' |'
      ];
      for (var m = 1; m < matrix.length; m++) {
        lines.push('| ' + normalize(matrix[m]).join(' | ') + ' |');
      }
      return lines.join('\n');
    }

    function render(node) {
      if (!node) return '';
      if (node.nodeType === 3) return renderText(node);
      if (node.nodeType !== 1) return '';

      var el = node;
      var tag = el.tagName;

      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG' || tag === 'CANVAS' ||
          tag === 'VIDEO' || tag === 'AUDIO' || tag === 'IFRAME' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return '';
      }
      if (el.matches && el.matches(UI_SKIP_SELECTOR)) return '';

      /* KaTeX / DeepSeek math：优先取 TeX 源码，避免 MathML 重复 */
      var isKatex = el.classList && (el.classList.contains('katex') || el.classList.contains('katex-display'));
      var isDsMath = el.classList && (el.classList.contains('ds-markdown-math') ||
        el.classList.contains('ds-markdown-math-display') || el.classList.contains('ds-markdown-math-svg'));
      if (isKatex || isDsMath) {
        var annotation = el.querySelector('annotation[encoding="application/x-tex"]');
        var tex = '';
        if (annotation && annotation.textContent) tex = annotation.textContent.trim();
        if (!tex) tex = (el.getAttribute('data-math') || el.getAttribute('data-latex') || el.getAttribute('data-tex') || '').trim();
        if (!tex) tex = (el.getAttribute('aria-label') || '').trim();
        var display = (el.classList && el.classList.contains('katex-display')) ||
          (el.classList && el.classList.contains('ds-markdown-math-display')) ||
          !!el.closest('.katex-display, .ds-markdown-math-display');
        if (tex) {
          return display ? '\n\n$$' + tex + '$$\n\n' : '$' + tex + '$';
        }
        var visibleMath = (el.innerText != null ? el.innerText : (el.textContent || '')).replace(/\s+/g, ' ').trim();
        if (visibleMath) {
          return display ? '\n\n[math: ' + visibleMath + ']\n\n' : '[math: ' + visibleMath + ']';
        }
        return '';
      }

      if (el.getAttribute('aria-hidden') === 'true') return '';

      // Claude / Gemini 等站点的代码块语言标签：位于 pre 之前的小字块，避免混入正文
      if ((tag === 'DIV' || tag === 'SPAN' || tag === 'SMALL') &&
          /(?:font-small|text-text-500|code-block|capitalize)/.test(String(el.className || '')) &&
          el.parentElement && el.parentElement.querySelector('pre') && !el.querySelector('pre')) {
        var langLabel = (el.textContent || '').trim();
        if (langLabel && /^[A-Za-z0-9_+#.-]{1,24}$/.test(langLabel)) return '';
      }

      if (tag === 'BR') return '\n';
      if (tag === 'HR') return '\n\n---\n\n';

      if (tag === 'CODE') return inlinePlaceholder(formatInlineCode(el.textContent || ''));
      if (tag === 'PRE') {
        return '\n\n' + codePlaceholder(formatCodeBlock(getPreText(el), detectCodeLanguage(el))) + '\n\n';
      }

      if (/^H[1-6]$/.test(tag)) {
        var level = Number(tag.charAt(1));
        var heading = renderChildren(el).trim();
        if (!heading) return '';
        return '\n\n' + new Array(level + 1).join('#') + ' ' + heading + '\n\n';
      }

      if (tag === 'P') {
        var para = renderChildren(el).trim();
        return para ? '\n\n' + para + '\n\n' : '';
      }

      if (tag === 'STRONG' || tag === 'B') return wrapInline(renderChildren(el), '**');
      if (tag === 'EM' || tag === 'I') return wrapInline(renderChildren(el), '*');
      if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return wrapInline(renderChildren(el), '~~');

      if (tag === 'A') {
        var href = el.getAttribute('href') || '';
        var label = renderChildren(el).trim();
        if (!label) return '';
        if (!href || href === '#' || /^(javascript|data):/i.test(href)) return label;
        var abs = href;
        try { abs = new URL(href, document.baseURI).href; } catch (e) { /* ignore */ }
        var dest = /[\s()<>]/.test(abs) ? '<' + abs + '>' : abs;
        return '[' + label + '](' + dest + ')';
      }

      if (tag === 'IMG') {
        var alt = el.getAttribute('alt') || '图片';
        var src = el.getAttribute('src') || '';
        if (/search-providers|\/favicon|favicon\./i.test(src)) return '';
        var imgW = Number(el.getAttribute('width'));
        var imgH = Number(el.getAttribute('height'));
        if (imgW && imgH && imgW <= 24 && imgH <= 24) return '';
        if (!src || /^(data|blob):/i.test(src)) return '[' + alt + ']';
        var imgUrl = src;
        try { imgUrl = new URL(src, document.baseURI).href; } catch (e) { /* ignore */ }
        return '![' + alt + '](' + imgUrl + ')';
      }

      if (tag === 'UL' || tag === 'OL') return renderList(el, tag === 'OL');

      if (tag === 'BLOCKQUOTE') {
        var quote = renderChildren(el).trim();
        if (!quote) return '';
        return '\n\n' + quote.split('\n').map(function (line) { return '> ' + line; }).join('\n') + '\n\n';
      }

      if (tag === 'TABLE') {
        var table = renderTable(el);
        return table ? '\n\n' + table + '\n\n' : '';
      }

      if (tag === 'DETAILS') {
        var summaryEl = null;
        for (var d = 0; d < el.children.length; d++) {
          if (el.children[d].tagName === 'SUMMARY') { summaryEl = el.children[d]; break; }
        }
        var summary = summaryEl ? renderChildren(summaryEl).trim() : '详情';
        var body = '';
        for (var b = 0; b < el.children.length; b++) {
          if (el.children[b] !== summaryEl) body += render(el.children[b]);
        }
        return '\n\n**' + (summary || '详情') + '**\n\n' + body.trim() + '\n\n';
      }

      if (tag === 'SUMMARY') return '';

      if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'MAIN' || tag === 'HEADER' ||
          tag === 'FOOTER' || tag === 'ASIDE' || tag === 'FIGURE' || tag === 'FIGCAPTION' || tag === 'FORM' ||
          tag === 'FIELDSET' || tag === 'DD' || tag === 'DT' || tag === 'LI') {
        var block = renderChildren(el);
        return block + '\n\n';
      }

      return renderChildren(el);
    }

    var result = renderChildren(rootEl);
    result = result.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
    return restoreAll(result).trim();
  }

  function normalizePlainText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .split('\n').map(function (line) { return line.replace(/[ \t]+$/, ''); }).join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractUserMarkdown(el) {
    if (!el) return '';

    // 裸 <img> 作为消息根节点时，htmlToMarkdown 不会渲染根元素本身，需要直接处理
    if (el.tagName === 'IMG') {
      var rootAlt = el.getAttribute('alt') || '图片';
      var rootSrc = el.getAttribute('src') || '';
      if (!rootSrc || /^(data|blob):/i.test(rootSrc)) return '[' + rootAlt + ']';
      var rootUrl = rootSrc;
      try { rootUrl = new URL(rootSrc, document.baseURI).href; } catch (e) { /* ignore */ }
      return '![' + rootAlt + '](' + rootUrl + ')';
    }

    var imageMarkers = [];
    var attachmentMarkers = [];
    try {
      var images = el.querySelectorAll('img');
      for (var i = 0; i < images.length; i++) {
        var alt = (images[i].getAttribute('alt') || '').trim();
        imageMarkers.push(alt && !/^(image|图片|avatar|头像)$/i.test(alt) ? '[图片：' + alt + ']' : '[图片]');
      }
    } catch (e) { /* ignore */ }

    try {
      var fileEls = el.querySelectorAll('a[download], [class*="file-item"], [class*="file-card"], [class*="attachment"], [class*="upload-item"]');
      for (var f = 0; f < fileEls.length; f++) {
        var fileEl = fileEls[f];
        var name = (fileEl.getAttribute('title') || fileEl.getAttribute('download') || fileEl.innerText || '').trim();
        if (name && name.length < 200 && attachmentMarkers.indexOf('[附件：' + name + ']') === -1) {
          attachmentMarkers.push('[附件：' + name + ']');
        }
      }
    } catch (e2) { /* ignore */ }

    // 用户消息按纯文本处理：保留 innerText 的换行，避免 HTML 路径压平换行，
    // 也避免用户输入的 Markdown/HTML 破坏整个导出文件。

    var text = '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') text = el.value || '';
    else text = el.innerText != null ? el.innerText : (el.textContent || '');
    text = normalizePlainText(text);

    if (text) {
      text = escapeUserPlainText(text);
      var extras = imageMarkers.concat(attachmentMarkers);
      return extras.length ? text + '\n\n' + extras.join('\n') : text;
    }

    var fallback = htmlToMarkdown(el).trim();
    if (fallback) return fallback;
    var markers = imageMarkers.concat(attachmentMarkers);
    return markers.join('\n');
  }

  function extractAssistantMarkdown(el) {
    if (!el) return '';
    return htmlToMarkdown(el);
  }

  /* ------------------------------------------------------------------ *
   * 站点适配器
   * ------------------------------------------------------------------ */

  function collectDeepSeek() {
    var out = [];
    var seen = new Set();
    var domIndex = 0;
    var items = document.querySelectorAll('[data-virtual-list-item-key]');

    function push(msgEl, key) {
      if (!msgEl || seen.has(msgEl)) return;
      seen.add(msgEl);
      var main = msgEl.querySelector('.ds-assistant-message-main-content');
      var think = msgEl.querySelector('.ds-think-content');
      var userContent = msgEl.querySelector('.fbb737a4, .ds-collapsible-text');
      var markdown = msgEl.querySelector('.ds-markdown');
      // 优先级：最终回答 → 思考过程 → 用户内容 → 纯 .ds-markdown（旧版/流式早期兜底为 assistant）
      var assistant = main || think || (!userContent ? markdown : null);
      var role = assistant ? 'assistant' : 'user';
      var contentEls = [];
      if (assistant) {
        contentEls.push(assistant);
      } else {
        contentEls.push(userContent || msgEl);
      }
      var num = Number(key);
      out.push({
        id: 'ds:' + key,
        role: role,
        order: Number.isFinite(num) ? num : 1e9 + domIndex,
        orderStable: Number.isFinite(num),
        contentEl: contentEls[0],
        contentEls: contentEls,
        containerEl: msgEl
      });
      domIndex++;
    }

    for (var i = 0; i < items.length; i++) {
      var key = items[i].getAttribute('data-virtual-list-item-key');
      if (!key) continue;
      var keyNum = Number(key);
      if (Number.isFinite(keyNum) && keyNum < 0) continue; // 分享页免责声明等特殊项
      push(items[i].querySelector('.ds-message'), key);
    }

    if (!out.length) {
      var fallback = document.querySelectorAll('.ds-message');
      for (var j = 0; j < fallback.length; j++) push(fallback[j], 'dom-' + j);
    }
    return out;
  }

  function collectChatGPT() {
    var out = [];

    function collectUserContent(node, scopeEl) {
      var els = [];
      var blocks = node.querySelectorAll('.whitespace-pre-wrap');
      for (var b = 0; b < blocks.length; b++) els.push(blocks[b]);
      // 文本与图片/附件在 ChatGPT DOM 中可能是同级分块；有些图片甚至挂在
      // [data-message-author-role] 节点外层，因此同时扫描整个 turn。
      var roots = [node];
      if (scopeEl && scopeEl !== node) roots.push(scopeEl);
      for (var r = 0; r < roots.length; r++) {
        var media = roots[r].querySelectorAll('img, [data-testid*="attachment"], [class*="attachment"], [data-testid*="image"]');
        for (var m = 0; m < media.length; m++) {
          var item = media[m];
          if (item.querySelector && item.querySelector('.whitespace-pre-wrap')) continue;
          if (els.indexOf(item) === -1) els.push(item);
        }
      }
      if (!els.length) els.push(node);
      return els;
    }

    // 新版 ChatGPT：一个 section[data-testid="conversation-turn-N"] 是一轮，
    // 一轮里 assistant 可能被拆成多个 [data-message-author-role] 片段，需要合并。
    var turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    for (var i = 0; i < turns.length; i++) {
      var turn = turns[i];
      if (!isVisibleElement(turn)) continue; // 旧会话可能挂在 display:none 的祖先下
      var nodes = turn.querySelectorAll('[data-message-author-role]');
      if (!nodes.length) continue;
      var role = turn.getAttribute('data-turn');
      if (role !== 'user' && role !== 'assistant') {
        role = nodes[0].getAttribute('data-message-author-role');
      }
      if (role !== 'user' && role !== 'assistant') continue;

      var contentEls = [];
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        var nodeRole = node.getAttribute('data-message-author-role');
        if (nodeRole && nodeRole !== role) continue;
        if (role === 'assistant') {
          var mds = node.querySelectorAll('.markdown');
          if (mds.length) {
            for (var m2 = 0; m2 < mds.length; m2++) contentEls.push(mds[m2]);
          } else {
            contentEls.push(node);
          }
        } else {
          var userEls = collectUserContent(node, turn);
          for (var u = 0; u < userEls.length; u++) contentEls.push(userEls[u]);
        }
      }
      if (!contentEls.length) continue;

      var testId = turn.getAttribute('data-testid') || '';
      var numMatch = testId.match(/(\d+)\s*$/);
      var mid = nodes[0].getAttribute('data-message-id') || turn.getAttribute('data-turn-id') || testId || ('turn-' + i);
      out.push({
        id: 'cg:' + mid,
        role: role,
        order: numMatch ? Number(numMatch[1]) : i,
        orderStable: true,
        contentEl: contentEls[0],
        contentEls: contentEls,
        containerEl: turn
      });
    }

    // 兼容旧版 ChatGPT DOM / 测试夹具：没有 section 包裹时按消息元素收集
    if (!out.length) {
      var seenTurns = new Set();
      var nodes2 = document.querySelectorAll('[data-message-author-role]');
      for (var j = 0; j < nodes2.length; j++) {
        var el = nodes2[j];
        var role2 = el.getAttribute('data-message-author-role');
        if (role2 !== 'user' && role2 !== 'assistant') continue;
        var turn2 = (el.closest && (el.closest('[data-testid^="conversation-turn"], article'))) || el;
        if (seenTurns.has(turn2) || !isVisibleElement(turn2)) continue;
        seenTurns.add(turn2);
        var contentEls2 = [];
        if (role2 === 'assistant') {
          var mds2 = el.querySelectorAll('.markdown');
          if (mds2.length) {
            for (var k = 0; k < mds2.length; k++) contentEls2.push(mds2[k]);
          } else {
            contentEls2.push(el);
          }
        } else {
          var userEls2 = collectUserContent(el, turn2);
          for (var q = 0; q < userEls2.length; q++) contentEls2.push(userEls2[q]);
        }
        var order2 = out.length;
        var testId2 = turn2.getAttribute('data-testid') || '';
        var num2 = testId2.match(/(\d+)\s*$/);
        if (num2) order2 = Number(num2[1]);
        var mid2 = el.getAttribute('data-message-id') || testId2 || ('idx-' + j);
        out.push({
          id: 'cg:' + mid2,
          role: role2,
          order: order2,
          orderStable: true,
          contentEl: contentEls2[0],
          contentEls: contentEls2,
          containerEl: turn2
        });
      }
    }
    return out;
  }

  function collectClaude() {
    var pairs = [];
    var users = document.querySelectorAll('[data-testid="user-message"]');
    var rawAssistants = Array.prototype.slice.call(
      document.querySelectorAll('.font-claude-response, .font-claude-message, [data-testid="assistant-message"]')
    );
    // 新版/旧版类名可能互相嵌套，只保留最内层，避免同一条回复重复
    var assistants = rawAssistants.filter(function (el) {
      return !rawAssistants.some(function (other) {
        return other !== el && el.contains(other);
      });
    });

    var i;
    for (i = 0; i < users.length; i++) pairs.push({ el: users[i], role: 'user' });
    for (i = 0; i < assistants.length; i++) pairs.push({ el: assistants[i], role: 'assistant' });
    pairs = pairs.filter(function (pair) { return isVisibleElement(pair.el); });
    pairs.sort(function (a, b) { return compareDom(a.el, b.el); });

    var out = [];
    for (i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var el = pair.el;
      var content = el;
      if (pair.role === 'assistant') {
        content = el.querySelector('.standard-markdown, .markdown, [class*="markdown"]') || el;
      }
      var msgId = el.getAttribute('data-message-id') || el.id || null;
      out.push({
        id: msgId ? 'cl:' + msgId : null,
        role: pair.role,
        order: i,
        contentEl: content,
        contentEls: [content],
        containerEl: el
      });
    }
    return out;
  }

  function collectGemini() {
    var nodes = document.querySelectorAll('user-query, model-response');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isVisibleElement(el)) continue;
      var isUser = el.tagName === 'USER-QUERY';
      var content;
      if (isUser) {
        content = el.querySelector('.query-text, .query-content, [class*="query-text"]') || el;
      } else {
        content = el.querySelector('#extended-response-markdown-content, .model-response-text .markdown, message-content .markdown, .markdown') || el;
      }
      var turn = el.closest ? el.closest('.conversation-container') : null;
      var turnId = turn && turn.id ? turn.id : (el.id || '');
      out.push({
        id: turnId ? 'gm:' + turnId + ':' + (isUser ? 'u' : 'a') : null,
        role: isUser ? 'user' : 'assistant',
        order: i,
        contentEl: content,
        contentEls: [content],
        containerEl: el
      });
    }
    return out;
  }

  function collectCopilot() {
    var selector = [
      '[data-content="user-message"]',
      '[data-content="ai-message"]',
      'cib-message[type="user"]',
      'cib-message[type="ai"]',
      '[class*="group/user-message"]',
      '[class*="group/ai-message"]',
      '[class*="user-message"]',
      '[class*="ai-message"]'
    ].join(',');
    var raw = Array.prototype.slice.call(document.querySelectorAll(selector));
    var out = [];

    for (var i = 0; i < raw.length; i++) {
      var el = raw[i];
      if (!isVisibleElement(el)) continue;
      var cls = String(el.className || '');
      var roleAttr = (el.getAttribute('data-content') || el.getAttribute('type') || '').toLowerCase();
      var isUser = /user/.test(roleAttr) || /user-message/.test(cls);
      // 去掉同角色的外层包装，只保留最内层消息
      var containsSame = false;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] === el) continue;
        var otherCls = String(raw[j].className || '');
        var otherAttr = (raw[j].getAttribute('data-content') || raw[j].getAttribute('type') || '').toLowerCase();
        var otherUser = /user/.test(otherAttr) || /user-message/.test(otherCls);
        if (otherUser === isUser && el.contains(raw[j])) { containsSame = true; break; }
      }
      if (containsSame) continue;

      var content = el;
      if (isUser) {
        content = el.querySelector('[data-content="user-message"]') || el;
      } else {
        content = el.querySelector('.group\\/ai-message-item, [class*="ai-message-item"], .markdown, [class*="markdown"]') || el;
      }
      var msgId = el.getAttribute('data-message-id') || el.id || null;
      out.push({
        id: msgId ? 'cp:' + msgId : null,
        role: isUser ? 'user' : 'assistant',
        order: i,
        contentEl: content,
        contentEls: [content],
        containerEl: el
      });
    }
    return out;
  }

  var USER_SELECTOR = [
    '[data-message-author-role="user"]',
    '[data-role="user"]',
    '[data-message-role="user"]',
    '[data-testid*="user-message"]',
    '[data-content="user-message"]',
    '[class*="user-message"]',
    '[class*="userMessage"]'
  ].join(',');

  var AI_SELECTOR = [
    '[data-message-author-role="assistant"]',
    '[data-role="assistant"]',
    '[data-message-role="assistant"]',
    '[data-testid*="assistant-message"]',
    '[data-content="ai-message"]',
    '[class*="assistant-message"]',
    '[class*="assistantMessage"]',
    '[class*="ai-message"]'
  ].join(',');

  function collectGeneric() {
    var all = [];
    var seen = new Set();
    var selectors = [USER_SELECTOR, AI_SELECTOR];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (seen.has(el)) continue;
        seen.add(el);
        if (el.closest && el.closest('nav, aside, header, footer, [role="navigation"]')) continue;
        if (!isVisibleElement(el)) continue;
        var text = (el.innerText || el.textContent || '').trim();
        var hasMedia = !!(el.querySelector && el.querySelector('img, [class*="attachment"], [class*="file-item"], [class*="file-card"]'));
        if (!text && !hasMedia) continue;
        if (text && text.length < 2 && !hasMedia) continue;
        var role = el.matches(USER_SELECTOR) ? 'user' : 'assistant';
        all.push({ el: el, role: role });
      }
    }
    if (all.length < 2) return [];

    var filtered = all.filter(function (item) {
      for (var i = 0; i < all.length; i++) {
        if (all[i] === item) continue;
        if (all[i].role === item.role && item.el.contains(all[i].el)) return false;
      }
      return true;
    });
    filtered.sort(function (a, b) { return compareDom(a.el, b.el); });

    var hasUser = false;
    var hasAssistant = false;
    var out = [];
    for (var j = 0; j < filtered.length; j++) {
      var entry = filtered[j];
      var content = entry.el;
      if (entry.role === 'assistant') {
        content = entry.el.querySelector('.markdown, .prose, [class*="markdown"], [class*="message-content"]') || entry.el;
      } else {
        content = entry.el.querySelector('[class*="whitespace-pre-wrap"]') || entry.el;
      }
      if (entry.role === 'user') hasUser = true; else hasAssistant = true;
      out.push({
        id: null,
        role: entry.role,
        order: j,
        contentEl: content,
        containerEl: entry.el
      });
    }
    if (!hasUser || !hasAssistant) return [];
    return out;
  }

  var ADAPTERS = {
    deepseek: { id: 'deepseek', sortMode: 'order', dedupe: 'id', detect: function () { return collectDeepSeek().length > 0; }, getMessages: collectDeepSeek },
    chatgpt: { id: 'chatgpt', sortMode: 'order', dedupe: 'id', detect: function () { return collectChatGPT().length > 0; }, getMessages: collectChatGPT },
    claude: { id: 'claude', sortMode: 'dom', dedupe: 'sequence', detect: function () { return collectClaude().length > 0; }, getMessages: collectClaude },
    gemini: { id: 'gemini', sortMode: 'dom', dedupe: 'id', detect: function () { return collectGemini().length > 0; }, getMessages: collectGemini },
    copilot: { id: 'copilot', sortMode: 'dom', dedupe: 'sequence', detect: function () { return collectCopilot().length > 0; }, getMessages: collectCopilot },
    generic: { id: 'generic', sortMode: 'dom', dedupe: 'sequence', detect: function () { return collectGeneric().length > 0; }, getMessages: collectGeneric }
  };

  function adapterIsUsable(adapter) {
    if (!adapter) return false;
    var messages = [];
    try { messages = adapter.getMessages() || []; } catch (e) { return false; }
    if (!messages.length) return false;
    if (messages.length === 1) return true;
    var hasUser = false;
    var hasAssistant = false;
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') hasUser = true;
      else if (messages[i].role === 'assistant') hasAssistant = true;
    }
    return hasUser && hasAssistant;
  }

  function resolveAdapter(context) {
    var preferred = ADAPTERS[context.adapterId];
    if (adapterIsUsable(preferred)) return preferred;
    var order = ['chatgpt', 'gemini', 'claude', 'copilot', 'deepseek'];
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      if (id === context.adapterId) continue;
      if (adapterIsUsable(ADAPTERS[id])) return ADAPTERS[id];
    }
    if (adapterIsUsable(ADAPTERS.generic)) return ADAPTERS.generic;
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 扫描与快照
   * ------------------------------------------------------------------ */

  function getContentEls(message) {
    if (message && message.contentEls && message.contentEls.length) return message.contentEls;
    if (message && message.contentEl) return [message.contentEl];
    return [];
  }

  function messageKey(message) {
    if (message.id) return message.id;
    var els = getContentEls(message);
    var text = els.map(function (el) {
      return el ? (el.innerText || el.textContent || '') : '';
    }).join(' ');
    return message.role + ':' + hashText(String(text).replace(/\s+/g, ' ').trim().slice(0, 800));
  }

  function snapshotMessage(message, encounter, scrollEl) {
    var els = getContentEls(message);
    var parts = [];
    var used = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el || used.indexOf(el) !== -1) continue;
      used.push(el);
      var part = '';
      try {
        part = message.role === 'user' ? extractUserMarkdown(el) : extractAssistantMarkdown(el);
      } catch (e) {
        part = normalizePlainText(el.innerText != null ? el.innerText : (el.textContent || ''));
      }
      part = String(part || '').trim();
      if (part) parts.push(part);
    }
    var md = parts.join('\n\n').trim();
    if (!md) return null;
    return {
      id: messageKey(message),
      role: message.role,
      order: message.order,
      orderStable: message.orderStable !== false,
      encounter: encounter,
      absPos: scrollEl ? getAbsolutePosition(message.containerEl || message.contentEl, scrollEl) : null,
      markdown: md
    };
  }

  function sameSnapshot(a, b) {
    return !!a && !!b && a.role === b.role && a.markdown === b.markdown;
  }

  function getAbsolutePosition(el, scrollEl) {
    if (!el || !scrollEl || !el.getBoundingClientRect || !scrollEl.getBoundingClientRect) return null;
    try {
      var rect = el.getBoundingClientRect();
      var scrollRect = scrollEl.getBoundingClientRect();
      return scrollEl.scrollTop + rect.top - scrollRect.top;
    } catch (e) {
      return null;
    }
  }

  function mergeByPosition(existing, incoming, preferredOffset) {
    var tol = 2;
    var positions = [];
    for (var e = 0; e < existing.length; e++) {
      if (!Number.isFinite(existing[e].absPos)) return null;
      positions.push(existing[e].absPos);
    }
    for (var i = 0; i < incoming.length; i++) {
      if (!Number.isFinite(incoming[i].absPos)) return null;
    }
    if (!positions.length || !incoming.length) return null;

    function countMatches(d) {
      var total = 0;
      for (var m = 0; m < incoming.length; m++) {
        var target = incoming[m].absPos - d;
        for (var p = 0; p < positions.length; p++) {
          if (Math.abs(positions[p] - target) <= tol) { total++; break; }
        }
      }
      return total;
    }

    // 尝试寻找“全局位移量” d：incoming 的位置 = 已有位置 + d（顶部懒加载插入时会整体下移）。
    // 已知方向时优先使用 preferredOffset，避免“内容完全相同”时纯匹配数选错偏移。
    var bestOffset = 0;
    var bestMatches = -1;
    if (Number.isFinite(preferredOffset)) {
      var preferredMatches = countMatches(preferredOffset);
      if (preferredMatches >= Math.min(2, incoming.length)) {
        bestOffset = preferredOffset;
        bestMatches = preferredMatches;
      }
    }
    if (bestMatches < 0) {
      var candidates = [0];
      var sampleExisting = positions.slice(0, 8);
      var sampleIncoming = incoming.slice(0, 8);
      for (var a = 0; a < sampleIncoming.length; a++) {
        for (var b = 0; b < sampleExisting.length; b++) {
          candidates.push(Math.round(sampleIncoming[a].absPos - sampleExisting[b]));
        }
      }
      for (var c = 0; c < candidates.length; c++) {
        var d = candidates[c];
        var matches = countMatches(d);
        if (matches > bestMatches) {
          bestMatches = matches;
          bestOffset = d;
        }
      }
    }
    if (bestMatches < Math.min(2, incoming.length)) return null;

    // 先对已有记录整体应用位移
    if (bestOffset !== 0) {
      for (var s = 0; s < existing.length; s++) existing[s].absPos += bestOffset;
    }

    var byPos = new Map();
    for (var r = 0; r < existing.length; r++) byPos.set(Math.round(existing[r].absPos), existing[r]);

    for (var q = 0; q < incoming.length; q++) {
      var snap = incoming[q];
      var key = Math.round(snap.absPos);
      var found = null;
      for (var k = key - tol; k <= key + tol; k++) {
        if (byPos.has(k)) { found = byPos.get(k); break; }
      }
      if (found) {
        // 同一位置，内容可能仍在流式增长：用最新快照替换
        found.markdown = snap.markdown;
        found.role = snap.role;
        found.absPos = snap.absPos;
      } else {
        byPos.set(key, snap);
        existing.push(snap);
      }
    }

    existing.sort(function (x, y) { return x.absPos - y.absPos; });
    return existing;
  }

  // 对没有稳定消息 id 的站点，按“滚动快照序列重叠”去重：
  // 优先用消息在滚动内容中的绝对位置对齐（可处理窗口内重复文本），
  // 位置不可用时回退为后缀/前缀序列匹配。
  // 位置信息不可用时的保底序列合并：用相邻快照的后缀/前缀重叠判断。
  function mergeSnapshotSequence(existing, incoming) {
    if (!incoming.length) return existing;
    if (!existing.length) return incoming.slice();
    var max = Math.min(existing.length, incoming.length);

    for (var k = max; k >= 1; k--) {
      var appendOk = true;
      for (var i = 0; i < k; i++) {
        if (!sameSnapshot(existing[existing.length - k + i], incoming[i])) { appendOk = false; break; }
      }
      if (appendOk) return existing.concat(incoming.slice(k));
    }

    for (var n = max; n >= 1; n--) {
      var prependOk = true;
      for (var j = 0; j < n; j++) {
        if (!sameSnapshot(existing[j], incoming[incoming.length - n + j])) { prependOk = false; break; }
      }
      if (prependOk) return incoming.slice(0, incoming.length - n).concat(existing);
    }

    return existing.concat(incoming);
  }

  function mergeSnapshots(existing, incoming, preferredOffset) {
    if (!incoming.length) return existing;
    if (!existing.length) return incoming.slice();
    var byPosition = mergeByPosition(existing, incoming, preferredOffset);
    if (byPosition) return byPosition;
    return mergeSnapshotSequence(existing, incoming);
  }

  async function deepScan(adapter, scrollEl, onProgress) {
    var stableIds = adapter.dedupe !== 'sequence';
    var seen = new Map();
    var records = [];

    function collect(preferredOffset) {
      var messages = [];
      try { messages = adapter.getMessages() || []; } catch (e) { return 0; }
      var added = 0;

      if (stableIds) {
        for (var i = 0; i < messages.length; i++) {
          var id = messageKey(messages[i]);
          var snapStable = snapshotMessage(messages[i], records.length, scrollEl);
          if (!snapStable) continue;
          if (seen.has(id)) {
            // 流式输出/异步渲染：同一条消息内容增长时更新，而不是保留旧截断快照
            var oldRecord = seen.get(id);
            if (oldRecord.markdown !== snapStable.markdown) {
              oldRecord.markdown = snapStable.markdown;
              oldRecord.absPos = snapStable.absPos;
            }
            continue;
          }
          seen.set(id, snapStable);
          records.push(snapStable);
          added++;
        }
      } else {
        var incoming = [];
        for (var j = 0; j < messages.length; j++) {
          var item = snapshotMessage(messages[j], incoming.length, scrollEl);
          if (item) incoming.push(item);
        }
        var before = records.length;
        records = mergeSnapshots(records, incoming, preferredOffset);
        added = records.length - before;
      }

      if (added && typeof onProgress === 'function') {
        try { onProgress({ count: records.length }); } catch (e) { /* ignore */ }
      }
      return added;
    }

    var originalTop = scrollEl.scrollTop;
    // 先到顶部并等待异步加载稳定。采用“墙钟静默期”：最后一次 scrollHeight 变化后
    // 至少静默 2 秒才结束（最多 7 秒），避免站点分批懒加载时提前退出。
    var lastHeight = scrollEl.scrollHeight;
    var lastRecordedHeight = lastHeight;
    var lastChange = Date.now();
    var deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      scrollEl.scrollTop = 0;
      await settle(200);
      var currentHeight = scrollEl.scrollHeight;
      collect(currentHeight - lastRecordedHeight);
      lastRecordedHeight = currentHeight;
      if (currentHeight !== lastHeight) {
        lastHeight = currentHeight;
        lastChange = Date.now();
      }
      if (Date.now() - lastChange >= 2000) break;
      await settle(150);
    }

    var viewport = Math.max(180, Math.floor((scrollEl.clientHeight || 600) * 0.7));
    var top = 0;
    var idle = 0;
    var scanHeight = scrollEl.scrollHeight;
    var beforeDownHeight = scanHeight;

    for (var loop = 0; loop < 600; loop++) {
      var maxTop = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (maxTop <= 0) break;
      var next = Math.min(top + viewport, maxTop);
      scrollEl.scrollTop = next;
      await settle(90);
      var actualTop = scrollEl.scrollTop;
      var added = collect(0);
      idle = added ? 0 : idle + 1;
      if (scrollEl.scrollHeight !== scanHeight) {
        scanHeight = scrollEl.scrollHeight;
        idle = 0;
      }
      if (actualTop >= maxTop - 2) {
        await settle(120);
        collect(0);
        break;
      }
      if (idle >= 8) break;
      top = actualTop;
    }

    // 向下扫描期间总高度仍增长，说明站点又懒加载了更早的消息：回顶部补采
    if (scrollEl.scrollHeight > beforeDownHeight + 4) {
      scrollEl.scrollTop = 0;
      await settle(900);
      collect(0);
      await settle(300);
      collect(0);
    }

    scrollEl.scrollTop = originalTop;
    await settle(60);
    return records;
  }

  async function extractAll(options) {
    options = options || {};
    var context = getContext();
    var adapter = resolveAdapter(context);
    if (!adapter) {
      throw new Error('无法识别当前页面的对话结构。请确认页面已显示对话内容，或换一个支持的站点。');
    }

    var initial = [];
    try { initial = adapter.getMessages() || []; } catch (e) { initial = []; }

    var scrollEl = null;
    if (initial.length) {
      scrollEl = findScrollable(initial[0].containerEl || initial[0].contentEl);
    }

    var records = [];
    if (options.deep !== false && scrollEl && initial.length) {
      try {
        records = await deepScan(adapter, scrollEl, options.onProgress);
      } catch (e) {
        records = [];
      }
    }
    if (!records.length) {
      records = [];
      for (var i = 0; i < initial.length; i++) {
        var snap = snapshotMessage(initial[i], i);
        if (snap) records.push(snap);
      }
    }

    var unique = records;
    if (adapter.dedupe !== 'sequence') {
      unique = [];
      var seen = new Set();
      for (var j = 0; j < records.length; j++) {
        if (seen.has(records[j].id)) continue;
        seen.add(records[j].id);
        unique.push(records[j]);
      }
    }

    if (adapter.sortMode === 'order') {
      var allOrdered = unique.every(function (r) {
        return r.orderStable !== false && Number.isFinite(r.order);
      });
      if (allOrdered) unique.sort(function (a, b) { return a.order - b.order; });
    }

    var roleCounts = { user: 0, assistant: 0 };
    for (var r = 0; r < unique.length; r++) {
      if (roleCounts[unique[r].role] != null) roleCounts[unique[r].role]++;
    }
    if (unique.length >= 2 && (roleCounts.user === 0 || roleCounts.assistant === 0)) {
      throw new Error('只识别到一种角色的消息，当前站点的对话结构可能已经变化。请刷新页面后重试，或反馈该站点。');
    }

    var messages = unique.map(function (r) {
      return { role: r.role, markdown: r.markdown };
    });

    return {
      siteId: context.siteId,
      siteName: context.siteName,
      knownSite: context.knownSite,
      aiName: context.aiName,
      userLabel: context.userLabel,
      adapterId: adapter.id,
      url: location.href,
      title: document.title,
      exportedAt: new Date(),
      messages: messages
    };
  }

  function quickStatus() {
    var context = getContext();
    var adapter = null;
    var count = 0;
    try {
      adapter = resolveAdapter(context);
      if (adapter) count = (adapter.getMessages() || []).length;
    } catch (e) { /* ignore */ }
    return {
      siteId: context.siteId,
      siteName: context.siteName,
      knownSite: context.knownSite,
      aiName: context.aiName,
      userLabel: context.userLabel,
      adapterId: adapter ? adapter.id : 'none',
      detected: !!adapter,
      count: count,
      hasMessages: count > 0,
      url: location.href,
      title: document.title
    };
  }

  function buildMarkdown(data, options) {
    if (!data || !Array.isArray(data.messages)) throw new Error('没有可导出的对话数据');
    var opts = Object.assign({ includeHeader: true }, options || {});
    var messages = data.messages.filter(function (m) { return m && m.markdown && String(m.markdown).trim(); });
    if (!messages.length) throw new Error('页面中没有可导出的对话内容');

    var aiName = data.aiName || 'AI';
    var parts = [];
    if (opts.includeHeader) {
      parts.push('# ' + aiName + ' 对话导出');
      parts.push([
        '> **来源**：' + (data.url || ''),
        '> **导出时间**：' + formatDateTime(data.exportedAt),
        '> **消息数**：' + messages.length
      ].join('  \n'));
    }

    for (var i = 0; i < messages.length; i++) {
      var role = messages[i].role;
      var label = role === 'user' ? (data.userLabel || '我') : aiName;
      parts.push('---');
      parts.push('**' + label + '：**');
      parts.push(String(messages[i].markdown).trim());
    }
    parts.push('---');
    return parts.join('\n\n') + '\n';
  }

  function makeFilename(data) {
    var d = data && data.exportedAt instanceof Date && !isNaN(data.exportedAt.getTime()) ? data.exportedAt : new Date();
    var stamp = '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
    var ai = (data && data.aiName ? data.aiName : 'AI').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '');
    return (ai || 'AI') + '对话_' + stamp + '.md';
  }

  window.__ACE_EXTRACTOR__ = {
    version: VERSION,
    getContext: getContext,
    quickStatus: quickStatus,
    extractAll: extractAll,
    buildMarkdown: buildMarkdown,
    makeFilename: makeFilename,
    htmlToMarkdown: htmlToMarkdown,
    _internal: {
      ADAPTERS: ADAPTERS,
      resolveAdapter: resolveAdapter,
      messageKey: messageKey,
      normalizePlainText: normalizePlainText,
      siteInfoForHost: function (hostname, docTitle) {
        var site = detectSite(hostname);
        return {
          siteId: site ? site.id : 'unknown',
          knownSite: !!site,
          aiName: inferAiName(site, docTitle, hostname),
          userLabel: site ? '我' : '用户'
        };
      }
    }
  };
})();
