/* Truthbound policy-owner review.
   Live workbench: reads /api/runs/<run>/review and saves with POST.
   Public snapshot: reads window.TB_STATIC and keeps choices in this browser only. */
(function () {
  'use strict';
  var CONFIG = window.TRUTHBOUND_CONFIG || {};
  var STATIC = CONFIG.mode === 'live' ? null : (window.TB_STATIC || null);
  var API = String(CONFIG.apiBase || '').replace(/\/+$/, '');
  var loadVersion = 0;
  var saving = false;
  var api = function (path) { return API + path; };
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
    logic: ['Derived', 'rv-src-logic'],
    unresolved: ['Unresolved', 'rv-src-unresolved']
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

  function showError(message) {
    var box = $('rv-error');
    if (box) { box.hidden = false; box.textContent = message; }
  }
  function readJSON(res) {
    return res.json().catch(function () { throw new Error('The backend returned an unreadable response.'); }).then(function (j) {
      if (!res.ok) throw new Error(typeof j.detail === 'string' ? j.detail : 'Request failed (HTTP ' + res.status + ').');
      return j;
    });
  }

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
    return fetch(api('/api/playground-runs'), { cache: 'no-store', credentials: 'same-origin' }).then(readJSON).then(function (j) {
      runs = (j.runs || []).map(function (r) {
        return { name: r.name, label: r.title || r.display_name || r.policy || r.name, mtime: r.mtime,
          sub: r.name + (r.n_cases != null ? ' · ' + r.n_cases + ' candidate cases' : '') };
      });
      finishRuns();
    });
  }
  function finishRuns() {
    if (!run || (STATIC && !runs.some(function (r) { return r.name === run; }))) run = runs.length ? runs[0].name : '';
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
      box.innerHTML = '<label class="rv-field"><span>Run</span><select id="rv-run">' +
        (run && !runs.some(function (r) { return r.name === run; }) ? '<option selected value="' + esc(run) + '">' + esc(run) + ' · not in saved history</option>' : '') + runs.map(function (r) {
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
    var version = ++loadVersion;
    data = null;
    if ($('rv-error')) $('rv-error').hidden = true;
    var box = $('rv-rules');
    $('rv-progress').innerHTML = '';
    if ($('rv-run-status')) $('rv-run-status').innerHTML = '';
    if ($('rv-policy')) $('rv-policy').textContent = '';
    if ($('rv-callout')) { $('rv-callout').hidden = true; $('rv-callout').innerHTML = ''; }
    if (!run) { box.innerHTML = '<p class="rv-muted">No saved runs yet. Open the current pipeline to create one.</p>'; return Promise.resolve(); }
    if (STATIC) {
      var src = STATIC.runs.filter(function (r) { return r.name === run; })[0];
      data = JSON.parse(JSON.stringify(src.payload));
      data.callout = src.callout || null;
      var local = localReview(run);
      data.rules.forEach(function (r) { r.review = local[r.rule] || { status: 'pending' }; });
      render();
      return Promise.resolve();
    }
    box.innerHTML = '<p class="rv-muted">Loading saved rules and cases…</p>';
    return fetch(api('/api/runs/' + encodeURIComponent(run) + '/review'), { cache: 'no-store', credentials: 'same-origin' }).then(readJSON).then(function (j) {
      if (version !== loadVersion) return;
      data = j;
      data.callout = null;
      render();
    }).catch(function (error) {
      if (version !== loadVersion) return;
      box.innerHTML = '<p class="rv-muted">This run could not be loaded.</p>';
      showError(error.message + ' Refresh to try again. Archived examples are not substituted for live data.');
    });
  }

  function renderRunStatus() {
    var box = $('rv-run-status');
    if (!box || STATIC) return;
    var s = data.summary || {};
    var scored = s.n_agent_scored;
    var agreement = typeof scored === 'number' && scored > 0 && typeof s.n_correct === 'number'
      ? s.n_correct + ' / ' + scored + ' scored cases' : 'No scored cases';
    function value(x) { return typeof x === 'number' ? String(x) : 'Not recorded'; }
    var workbench = CONFIG.workbenchUrl || '/';
    var resultUrl = api('/api/runs/' + encodeURIComponent(run) + '/result');
    var links = '<a href="' + esc(workbench) + '">Open current pipeline</a>';
    if (data.has_result) links += ' · <a href="' + esc(workbench + (workbench.indexOf('?') < 0 ? '?' : '&') + 'result=' + encodeURIComponent(resultUrl)) + '">Full saved report</a>';
    var selected = runs.filter(function (r) { return r.name === run; })[0];
    box.innerHTML = '<p><strong>Saved run: ' + esc(run) + '</strong>' + (selected && selected.mtime ? ' · ' + esc(new Date(selected.mtime * 1000).toLocaleString()) : '') + '</p>' +
      '<dl class="rv-run-stats"><div><dt>Candidate cases</dt><dd>' + value(data.n_cases) + '</dd></div>' +
      '<div><dt>Generated questions</dt><dd>' + value(data.n_generated_questions) + '</dd></div>' +
      '<div><dt>Agent evaluated</dt><dd>' + value(s.n_agent_evaluated) + '</dd></div>' +
      '<div><dt>Agent skipped</dt><dd>' + value(s.n_agent_skipped) + '</dd></div>' +
      '<div><dt>Policy decision agreement</dt><dd>' + esc(agreement) + '</dd></div></dl>' +
      '<p>Structural validation: <strong>' + esc(data.validation_status) + '</strong>. This does not establish fidelity to the source policy.</p>' +
      (s.pipeline_model ? '<p>Compiler: ' + esc(s.pipeline_model) + ' · Agent configured for this run: ' + esc(s.agent_model || 'Not recorded') + '</p>' : '') +
      (data.warnings && data.warnings.length ? '<ul class="rv-warnings">' + data.warnings.map(function (w) { return '<li>' + esc(typeof w === 'string' ? w : JSON.stringify(w)) + '</li>'; }).join('') + '</ul>' : '') +
      '<p>' + links + '</p>';
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
    var body = '<blockquote class="rv-msg">' + esc(c.message || 'No natural-language question was generated for this candidate.') + '</blockquote>' +
      (c.issues && c.issues.length ? '<ul class="rv-warnings">' + c.issues.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul>' : '') +
      '<p class="rv-muted">Scenario inputs; these values alone are not proof from backend records.</p><dl class="rv-facts">' + facts + '</dl>' +
      '<p class="rv-expected">Compiled decision <span class="rv-decision ' + decisionClass(c.expected) + '">' + esc(human(c.expected)) + '</span>' +
      (c.eligibility ? ' · Eligibility: ' + esc(human(c.eligibility)) : '') + (c.next_step ? ' · Next step: ' + esc(human(c.next_step)) : '') + '</p>' +
      (c.postconditions && c.postconditions.length ? '<p>Required results: ' + esc(c.postconditions.map(function (p) { return typeof p === 'string' ? p : JSON.stringify(p); }).join('; ')) + '</p>' : '');
    return k === 0 ? '<div class="rv-case">' + body + '</div>' : '<details class="rv-case"><summary>Case ' + (k + 1) + '</summary>' + body + '</details>';
  }

  function cardHTML(rule, i) {
    var st = (rule.review && rule.review.status) || 'pending';
    var p = rule.plain || null;
    var share = rule.share != null ? pct(rule.share) + ' of input combinations' : '';
    var conds;
    if (p && p.conditions && p.conditions.length) {
      conds = '<p class="rv-label">' + esc(p.conditions_label || (rule.catch_all ? 'Applies when no other rule does. Reasons it reports' : 'Applies when all of these hold')) + '</p><ul class="rv-conds">' +
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
    var fieldList = (rule.fields || []).map(function (f) {
      var source = SRC[f.source] || SRC.unresolved;
      return '<li><span class="rv-src ' + source[1] + '">' + source[0] + '</span> ' + esc(human(f.name)) +
        (f.db_path ? ' <small>Mapping: ' + esc(f.db_path) + '</small>' : '') + '</li>';
    }).join('');
    var rv = rule.review || {};
    return '<article class="rv-card rv-st-' + st + (flagged ? ' rv-flagged' : '') + '" id="rv-rule-' + esc(rule.rule) + '" data-rule="' + esc(rule.rule) + '">' +
      '<header class="rv-card-h"><div><p class="rv-kicker">Rule ' + (i + 1) + ' of ' + data.rules.length + (share ? ' · ' + share : '') + '</p><h3>' + esc(human(rule.rule)) + '</h3></div>' +
      '<div class="rv-tags"><span class="rv-decision ' + decisionClass(rule.decision) + '">' + esc(human(rule.decision)) + '</span><span class="rv-status rv-status-' + st + '">' + esc(STATUS[st] || st) + '</span></div></header>' +
      (p && p.summary ? '<p class="rv-summary">' + esc(p.summary) + '</p>' : '') + finding +
      '<div class="rv-when">' + conds + '</div>' +
      (fieldList ? '<details class="rv-fields"><summary>Input sources to verify</summary><p class="rv-muted">These are pipeline mappings, not independent verification of the facts.</p><ul>' + fieldList + '</ul></details>' : '') +
      '<details class="rv-rego"><summary>' + (rule.rego_scope === 'full_policy' ? 'Full compiled policy' : 'Compiled rule') + '</summary><pre>' + esc((rule.rego || []).join('\n\n') || '(no block found)') + '</pre></details>' +
      '<div class="rv-cases"><p class="rv-label">Saved candidate cases for this rule</p>' + (cases || '<p class="rv-muted">No saved case for this rule.</p>') + '</div>' +
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
    renderRunStatus();
    renderCallout();
    $('rv-rules').innerHTML = data.rules.length ? data.rules.map(cardHTML).join('') : '<p class="rv-muted">This run has no compiled rules to review yet.</p>';
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
    if (!b || !data || saving) return;
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
    saving = true;
    var savedRun = run, savedData = data;
    b.disabled = true;
    fetch(api('/api/runs/' + encodeURIComponent(savedRun) + '/review'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ rule: name, status: status, note: note, reviewer: reviewer,
        fingerprint: savedData.fingerprint, revision: savedData.review_revision })
    }).then(readJSON).then(function (j) {
      if (run !== savedRun || data !== savedData) return;
      rule.review = j.review;
      data.review_revision = j.revision;
      replaceCard(name);
      renderProgress();
      if ($('rv-error')) $('rv-error').hidden = true;
    }).catch(function (error) {
      if (run !== savedRun || data !== savedData) return;
      showError('Review was not saved: ' + error.message);
    }).finally(function () {
      saving = false; b.disabled = false;
    });
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'rv-run') switchRun(ev.target.value);
  });

  function exportJSON() {
    if (!data) return;
    var out = {
      run: data.run, exported_utc: new Date().toISOString(),
      fingerprint: data.fingerprint || null, revision: data.review_revision || 0,
      scope: data.review_scope || 'Browser-only review of an archived snapshot',
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

  if (!STATIC) {
    $('rv-title').innerHTML = 'Review compiled rules <span>against the source policy.</span>';
    document.querySelector('.rv-lede').textContent = 'Compare saved rules and candidate cases with the original policy. Check each condition and its declared source, then record your review. Results below belong to the saved run; approvals do not rerun tests or enable runtime enforcement.';
    var steps = document.querySelectorAll('.rv-steps li');
    steps[0].querySelector('span').textContent = 'Open a saved compilation from the current pipeline.';
    steps[1].querySelector('span').textContent = 'Compare the rules and cases with the policy; save your findings.';
    steps[2].querySelector('b').textContent = '3 · Follow up';
    steps[2].querySelector('span').textContent = 'Use the review to correct the policy implementation, then run new tests in the workbench.';
    document.querySelector('.rv-legend').innerHTML = '<span><span class="rv-src rv-src-customer">Customer says</span> mapped to user evidence</span><span><span class="rv-src rv-src-records">Records show</span> mapped to system records; verify the lookup</span><span><span class="rv-src rv-src-logic">Derived</span> compiled expression</span><span><span class="rv-src rv-src-unresolved">Unresolved</span> no usable fact mapping</span>';
    var note = document.querySelector('.rv-note');
    if (note) note.textContent = 'Connected to the current pipeline. Cases and results are saved run artifacts; opening this page makes no model calls. Readings mechanically preserve the compiled expressions. Reviews are saved on the server for this exact snapshot; they do not change scores or automatically enable enforcement.';
  }
  listRuns().then(load).catch(function (error) {
    $('rv-rules').innerHTML = '<p class="rv-muted">Unable to connect to the run history.</p>';
    showError(error.message + ' Check the configured backend address and refresh.');
  });
})();
