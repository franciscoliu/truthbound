(function () {
  'use strict';
  var c = window.TRUTHBOUND_CONFIG || {};
  if (c.mode !== 'live') return;
  var home = new URL('./', document.currentScript.src);
  var banner = document.createElement('aside');
  banner.setAttribute('aria-label', 'Current workspace');
  banner.style.cssText = 'padding:14px 5%;background:#e9eddf;color:#253023;font:15px/1.6 sans-serif;display:flex;gap:20px;flex-wrap:wrap;';
  var text = document.createElement('span');
  text.textContent = 'Connected workspace. The demonstration below retains its original archived results.';
  banner.appendChild(text);
  [['Review saved runs', new URL('review/', home).href], ['Open current pipeline', c.workbenchUrl || '/']].forEach(function (item) {
    var a = document.createElement('a'); a.textContent = item[0]; a.href = item[1];
    a.style.cssText = 'color:inherit;text-decoration:underline;font-weight:600;'; banner.appendChild(a);
  });
  document.body.insertBefore(banner, document.body.firstChild);
})();
