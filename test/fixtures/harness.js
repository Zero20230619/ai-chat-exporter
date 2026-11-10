/*
 * 测试夹具通用脚本：在页面里运行 extractor，并把结果写入 <pre id="ACE_TEST_RESULT">。
 * 由 test/fixtures/*.html 在 </body> 前引用。
 */
(async function () {
  'use strict';

  function writeResult(result) {
    var pre = document.createElement('pre');
    pre.id = 'ACE_TEST_RESULT';
    pre.textContent = JSON.stringify(result);
    (document.body || document.documentElement).appendChild(pre);
  }

  try {
    if (!window.__ACE_EXTRACTOR__) throw new Error('extractor not loaded');

    var params = new URLSearchParams(location.search);
    var deep = params.get('deep') === '1';
    var siteTests = ['chat.deepseek.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'example.com']
      .map(function (host) {
        return Object.assign({ host: host }, window.__ACE_EXTRACTOR__._internal.siteInfoForHost(host, ''));
      });

    var data = await window.__ACE_EXTRACTOR__.extractAll({ deep: deep });
    var markdown = window.__ACE_EXTRACTOR__.buildMarkdown(data, { includeHeader: true });
    writeResult({
      ok: true,
      ctx: {
        url: data.url,
        title: data.title,
        aiName: data.aiName,
        userLabel: data.userLabel,
        adapterId: data.adapterId,
        siteId: data.siteId
      },
      count: data.messages.length,
      roles: data.messages.map(function (m) { return m.role; }),
      lengths: data.messages.map(function (m) { return m.markdown.length; }),
      siteTests: siteTests,
      markdown: markdown
    });
  } catch (error) {
    writeResult({ ok: false, error: String(error && error.stack ? error.stack : error) });
  }
})();
