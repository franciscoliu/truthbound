/* Truthbound policy-owner review.
   Live workbench: reads /api/runs/<run>/review and saves with POST.
   Public snapshot: reads window.TB_STATIC and keeps choices in this browser only. */
(function () {
  'use strict';
  var STATIC = window.TB_STATIC || null;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var human = function (s) { return String(s == null ? '' : s).replace(/_/g, ' '); };
  var SRC = {
    customer: ['Customer says', 'rv-src-customer'],
    records: ['Records show', 'rv-src-records'],
    logic: ['Derived', 'rv-src-logic']
  };
  var GOOD = ['allow', 'eligible', 'on_time', 'approve', 'approved', 'yes'];
  var BAD = ['deny', 'not_eligible', 'late', 'reject', 'no'];
  var decisionClass = function (d) {
    return GOOD.indexOf(d) >= 0 ? 'rv-d-good' : BAD.indexOf(d) >= 0 ? 'rv-d-bad' : 'rv-d-neutral';
  };
  var STATUS = { pending: 'Not reviewed', approved: 'Approved', needs_correction: 'Needs correction' };

  var runs = [];
  var run = new URLSearchParams(location.search).get('run') || '';
  var data = null;
  var revealed = false;

  function storeGet(k, fallback) {
    try { var v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function storeSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable: choices last for this visit */ }
  }
  var memoryStore = {};
  function localReview(name) { return storeGet('tb_review_' + name, null) || memoryStore[name] || {}; }
  function saveLocalReview(name, state) { memoryStore[name] = state; storeSet('tb_review_' + name, state); }

  var reviewerInput = $('rv-reviewer');
  if (reviewerInput) {
    reviewerInput.value = storeGet('tb_reviewer', '') || '';
    reviewerInput.addEventListener('change', function () { storeSet('tb_reviewer', reviewerInput.value); });
  }

  function md(text) {
    var lines = String(text || '').split('\n');
    var html = '';
    var inList = false;
    var inline = function (s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); };
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      var li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inline(li[1]) + '</li>';
        return;
      }
      if (inList) { html += '</ul>'; inList = false; }
      if (h) {
        var lvl = Math.min(h[1].length + 2, 6);
        html += '<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>';
      } else if (line.trim()) {
        html += '<p>' + inline(line) + '</p>';
      }
    });
    if (inList) html += '</ul>';
    return html;
  }

  function fmt(v) { return v === true ? 'yes' : v === false ? 'no' : human(v); }
  function factLabel(key) { return human(key.split('.').slice(-2).join(' ')); }
  function pct(x) { var p = x * 100; return (p < 1 ? p.toFixed(1) : Math.round(p)) + '%'; }

  function listRuns() {
    if (STATIC) {
      runs = STATIC.runs.map(function (r) { return { name: r.name, label: r.label, sub: r.sub }; });
      return Promise.resolve(finishRuns());
    }
    return fetch('/api/playground-runs').then(function (res) { return res.json(); }).then(function (j) {
      runs = (j.runs || []).map(function (r) {
        return { name: r.name, label: r.title || r.display_name || r.policy || r.name, sub: r.name + (r.n_cases ? ' · ' + r.n_cases + ' cases' : '') };
      });
      finishRuns();
    });
  }
  function finishRuns() {
    if (!run || !runs.some(function (r) { return r.name === run; })) run = runs.length ? runs[0].name : '';
    renderPicker();
  }

  function renderPicker() {
    var box = $('rv-picker');
    if (!box) return;
    if (STATIC) {
      box.innerHTML = '<div class="rv-tabs" role="tablist" aria-label="Policy">' + runs.map(function (r) {
        return '<button type="button" role="tab" aria-selected="' + (r.name === run) + '" data-run="' + esc(r.name) + '"><span>' + esc(r.label) + '</span><small>' + esc(r.sub || '') + '</small></button>';
      }).join('') + '</div>';
    } else {
      box.innerHTML = '<label class="rv-field"><span>Run</span><select id="rv-run">' + runs.map(function (r) {
        return '<option value="' + esc(r.name) + '"' + (r.name === run ? ' selected' : '') + '>' + esc(r.label) + ' · ' + esc(r.sub) + '</option>';
      }).join('') + '</select></label>';
    }
  }

  function switchRun(name) {
    if (!name || name === run) return;
    run = name;
    revealed = false;
    var u = new URL(location.href);
    u.searchParams.set('run', run);
    history.replaceState(null, '', u);
    renderPicker();
    load();
  }

  function load() {
    var box = $('rv-rules');
    if (!run) { box.innerHTML = '<p class="rv-muted">No run selected.</p>'; return Promise.resolve(); }
    if (STATIC) {
      var src = STATIC.runs.filter(function (r) { return r.name === run; })[0];
      data = JSON.parse(JSON.stringify(src.payload));
      data.callout = src.callout || null;
      var local = localReview(run);
      data.rules.forEach(function (r) { r.review = local[r.rule] || { status: 'pending' }; });
      render();
      return Promise.resolve();
    }
    box.innerHTML = '<p class="rv-muted">Loading rules. The first load of a run writes the plain-language readings and can take up to a minute.</p>';
    return fetch('/api/runs/' + encodeURIComponent(run) + '/review').then(function (res) {
      if (!res.ok) { box.innerHTML = '<p class="rv-muted">Could not load ' + esc(run) + ' (HTTP ' + res.status + ').</p>'; return null; }
      return res.json();
    }).then(function (j) {
      if (!j) return;
      data = j;
      data.callout = null;
      render();
    });
  }

  function counts() {
    var c = { approved: 0, needs_correction: 0, pending: 0 };
    data.rules.forEach(function (r) { var s = (r.review && r.review.status) || 'pending'; c[s] = (c[s] || 0) + 1; });
    return c;
  }

  function renderProgress() {
    var c = counts();
    var n = data.rules.length;
    var w = function (k) { return n ? (c[k] / n * 100) : 0; };
    $('rv-progress').innerHTML =
      '<div class="rv-meter" role="img" aria-label="' + c.approved + ' approved, ' + c.needs_correction + ' need correction, ' + c.pending + ' not reviewed">' +
      '<span class="rv-m-ok" style="width:' + w('approved') + '%"></span><span class="rv-m-fix" style="width:' + w('needs_correction') + '%"></span></div>' +
      '<dl class="rv-stats"><div><dt>Rules</dt><dd>' + n + '</dd></div><div><dt>Approved</dt><dd>' + c.approved + '</dd></div>' +
      '<div><dt>Need correction</dt><dd>' + c.needs_correction + '</dd></div><div><dt>Input combinations</dt><dd>' +
      (data.total_combinations != null ? Number(data.total_combinations).toLocaleString('en-US') : '–') + '</dd></div></dl>';
  }

  function renderCallout() {
    var box = $('rv-callout');
    if (!box) return;
    var c = data && data.callout;
    if (!c) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<div><p class="rv-callout-kicker">Try it</p><p class="rv-callout-q">' + esc(c.question) + '</p></div>' +
      '<button type="button" class="rv-btn rv-btn-ghost" id="rv-reveal" aria-expanded="' + revealed + '">' + (revealed ? 'Hide the answer' : 'Show me') + '</button>';
  }

  function caseHTML(c, k) {
    var fs = data.fact_sources || {};
    var facts = Object.keys(c.facts || {}).map(function (key) {
      var tag = fs[key] === 'customer' ? '<span class="rv-src rv-src-customer rv-src-mini">customer</span>' : '';
      return '<div><dt>' + esc(factLabel(key)) + tag + '</dt><dd>' + esc(fmt(c.facts[key])) + '</dd></div>';
    }).join('');
    var body = '<blockquote class="rv-msg">' + esc(c.message || '') + '</blockquote><dl class="rv-facts">' + facts + '</dl>' +
      '<p class="rv-expected">Expected decision <span class="rv-decision ' + decisionClass(c.expected) + '">' + esc(human(c.expected)) + '</span></p>';
    return k === 0 ? '<div class="rv-case">' + body + '</div>' : '<details class="rv-case"><summary>Case ' + (k + 1) + '</summary>' + body + '</details>';
  }

  function cardHTML(rule, i) {
    var st = (rule.review && rule.review.status) || 'pending';
    var p = rule.plain || null;
    var share = rule.share != null ? pct(rule.share) + ' of input combinations' : '';
    var conds;
    if (p && p.conditions && p.conditions.length) {
      conds = '<p class="rv-label">' + (rule.catch_all ? 'Applies when no other rule does. Reasons it reports' : 'Applies when all of these hold') + '</p><ul class="rv-conds">' +
        p.conditions.map(function (c) {
          var s = SRC[c.source] || SRC.logic;
          return '<li' + (c.unexplained ? ' class="rv-unexplained"' : '') + '><span class="rv-src ' + s[1] + '">' + s[0] + '</span><span>' + esc(c.text) +
            (c.unexplained ? ' <em>Not covered by the reading. Check the compiled rule.</em>' : '') + '</span></li>';
        }).join('') + '</ul>';
    } else {
      conds = '<p class="rv-muted">No plain-language reading for this rule yet. Read the compiled rule below.</p>';
    }
    var flagged = data.callout && revealed && data.callout.rule === rule.rule;
    var finding = flagged ? '<div class="rv-finding"><p class="rv-label">What the policy owner should catch</p><p>' + esc(data.callout.answer) + '</p></div>' : '';
    var cases = (rule.cases || []).map(caseHTML).join('');
    var rv = rule.review || {};
    return '<article class="rv-card rv-st-' + st + (flagged ? ' rv-flagged' : '') + '" id="rv-rule-' + esc(rule.rule) + '" data-rule="' + esc(rule.rule) + '">' +
      '<header class="rv-card-h"><div><p class="rv-kicker">Rule ' + (i + 1) + ' of ' + data.rules.length + (share ? ' · ' + share : '') + '</p><h3>' + esc(human(rule.rule)) + '</h3></div>' +
      '<div class="rv-tags"><span class="rv-decision ' + decisionClass(rule.decision) + '">' + esc(human(rule.decision)) + '</span><span class="rv-status rv-status-' + st + '">' + esc(STATUS[st] || st) + '</span></div></header>' +
      (p && p.summary ? '<p class="rv-summary">' + esc(p.summary) + '</p>' : '') + finding +
      '<div class="rv-when">' + conds + '</div>' +
      '<details class="rv-rego"><summary>Compiled rule</summary><pre>' + esc((rule.rego || []).join('\n\n') || '(no block found)') + '</pre></details>' +
      '<div class="rv-cases"><p class="rv-label">Generated test cases for this rule</p>' + cases + '</div>' +
      '<div class="rv-ctl"><label class="rv-label" for="rv-note-' + i + '">Your review</label>' +
      '<textarea id="rv-note-' + i + '" data-note rows="2" placeholder="If a condition is wrong or missing, say what the policy actually requires and quote the clause.">' + esc(rv.note || '') + '</textarea>' +
      '<div class="rv-actions"><button type="button" class="rv-btn rv-btn-ok" data-act="approved">Approve rule</button>' +
      '<button type="button" class="rv-btn rv-btn-fix" data-act="needs_correction">Needs correction</button>' +
      '<button type="button" class="rv-btn rv-btn-ghost" data-act="pending">Reset</button>' +
      (rv.reviewer ? '<span class="rv-muted">Last saved by ' + esc(rv.reviewer) + '</span>' : '') + '</div></div></article>';
  }

  function render() {
    data.rules.sort(function (a, b) { return (a.catch_all ? 1 : 0) - (b.catch_all ? 1 : 0); });
    var pol = $('rv-policy');
    if (pol) pol.innerHTML = md(data.policy_text || '(no policy text)');
    renderProgress();
    renderCallout();
    $('rv-rules').innerHTML = data.rules.map(cardHTML).join('');
  }

  function replaceCard(name) {
    var i = -1;
    data.rules.forEach(function (r, k) { if (r.rule === name) i = k; });
    var el = document.getElementById('rv-rule-' + name);
    if (i < 0 || !el) return;
    el.outerHTML = cardHTML(data.rules[i], i);
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-run]');
    if (t) { switchRun(t.getAttribute('data-run')); return; }
    if (ev.target.closest('#rv-reveal')) {
      revealed = !revealed;
      renderCallout();
      var c = data && data.callout;
      if (!c) return;
      replaceCard(c.rule);
      if (revealed) {
        var el = document.getElementById('rv-rule-' + c.rule);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (ev.target.closest('#rv-export')) { exportJSON(); return; }
    var b = ev.target.closest('[data-act]');
    if (!b || !data) return;
    var card = b.closest('[data-rule]');
    var name = card.getAttribute('data-rule');
    var rule = data.rules.filter(function (r) { return r.rule === name; })[0];
    var note = card.querySelector('[data-note]').value;
    var reviewer = reviewerInput ? reviewerInput.value : '';
    var status = b.getAttribute('data-act');
    if (STATIC) {
      var local = localReview(run);
      if (status === 'pending') delete local[name];
      else local[name] = { status: status, note: note, reviewer: reviewer, ts: Date.now() / 1000 };
      saveLocalReview(run, local);
      rule.review = status === 'pending' ? { status: 'pending' } : local[name];
      replaceCard(name);
      renderProgress();
      return;
    }
    b.disabled = true;
    fetch('/api/runs/' + encodeURIComponent(run) + '/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: name, status: status, note: note, reviewer: reviewer })
    }).then(function (res) {
      b.disabled = false;
      if (!res.ok) { alert('Save failed: HTTP ' + res.status); return null; }
      return res.json();
    }).then(function (j) {
      if (!j) return;
      rule.review = j.review;
      replaceCard(name);
      renderProgress();
    });
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'rv-run') switchRun(ev.target.value);
  });

  function exportJSON() {
    if (!data) return;
    var out = {
      run: data.run, exported_utc: new Date().toISOString(),
      rules: data.rules.map(function (r) { return { rule: r.rule, decision: r.decision, share: r.share, review: r.review }; })
    };
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'truthbound-review-' + data.run + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  var det = $('rv-policy-details');
  if (det && window.innerWidth < 640) det.open = false;

  listRuns().then(load);
})();
