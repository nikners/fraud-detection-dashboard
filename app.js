/* =========================================================================
   FlagWise - low-fidelity wireframe prototype
   -------------------------------------------------------------------------
   Plain vanilla JavaScript. No framework, no build step, no network calls.

   How it is put together
   ----------------------
     1. state            everything lives here, in memory, for this page load
     2. helpers          risk levels, counts, formatting
     3. router           hashchange -> parseRoute() -> render()
     4. shell            top navigation, breadcrumb, heuristic legend
     5. screens          login, queue, case, reports
     6. dialogs + toasts confirmation modal and the 8 second undo toast
     7. events           one delegated listener per DOM event type

   There is no real authentication, no backend and no model. Risk scores are
   hardcoded constants in data.js. Any non-empty username and password signs
   you in; that is the entire "login".
   ========================================================================= */

(function () {
  'use strict';

  /* ------------------------------------------------------------ 1. state */

  const state = {
    session: null,               // { name, role } or null
    alerts: [],                  // live working copy, cloned from data.js
    queue: { q: '', status: 'All', type: 'All', escalated: 'All' },
    showNotes: false,            // heuristic notes toggle
    modal: null,                 // confirmation dialog, or null
    toasts: []                   // active toast messages
  };

  let toastSeq = 0;

  /* Nielsen's ten usability heuristics, in the order used for the legend. */
  const HEURISTICS = {
    H1:  'Visibility of system status',
    H2:  'Match between the system and the real world',
    H3:  'User control and freedom',
    H4:  'Consistency and standards',
    H5:  'Error prevention',
    H6:  'Recognition over recall',
    H7:  'Flexibility and efficiency of use',
    H8:  'Aesthetic and minimalist design',
    H9:  'Help users recognise, diagnose and recover from errors',
    H10: 'Help and documentation'
  };

  const HEURISTIC_NOTES = [
    ['H1',  'Status badges, the alert counter, toast messages and the Reports figures all say what just happened and what the current state is.'],
    ['H2',  'Plain wording such as "Sign in", "Approve" and "Why was this flagged?". No internal jargon, no system codes.'],
    ['H3',  'Every screen has a way out: back link, Cancel, Sign out, and an 8 second Undo on any decision.'],
    ['H4',  'The same top navigation, breadcrumb, panel headings and button styles on every screen.'],
    ['H5',  'Block and Escalate ask for confirmation and spell out the consequences. Empty login fields are caught before submitting.'],
    ['H6',  'Search box, Status and Type filters, breadcrumbs and written reasons, so the analyst does not have to remember anything.'],
    ['H7',  'Narrow by alert ID, Status and Type in one place, and queue rows open the case directly.'],
    ['H8',  'Grayscale interface, one accent colour, square corners, no decoration competing with the data.'],
    ['H9',  'Inline field errors name the problem, and Undo restores a decision with a confirmation message.'],
    ['H10', 'The "Show heuristic notes" legend explains every numbered tag on the page.']
  ];

  /* ----------------------------------------------------------- 2. helpers */

  const money = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2
  });

  function fmt(n) { return money.format(Number(n) || 0); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Risk bands are fixed by the assignment brief:
       HIGH   70 and above
       MEDIUM 40 to 69
       LOW    below 40
     The band is always rendered as a word next to the number. */
  function riskLevel(score) {
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  function riskChip(score) {
    const level = riskLevel(score);
    return '<span class="risk-chip risk-' + level.toLowerCase() + '">' + level + '</span>';
  }

  function statusChip(status) {
    const cls = 'status-' + status.toLowerCase().replace(/\s+/g, '');
    return '<span class="status-chip ' + cls + '">' + esc(status) + '</span>';
  }

  function statusKey(status) { return status.toLowerCase().replace(/\s+/g, ''); }

  function outcomeChip(a) {
    if (a.outcome === 'blocked') {
      return '<span class="flag-chip" data-kind="blocked">blocked</span>';
    }
    if (a.outcome === 'false_positive') {
      return '<span class="flag-chip" data-kind="false_positive">false positive</span>';
    }
    return '';
  }

  function escalatedChip(a) {
    return a.escalated ? '<span class="flag-chip" data-kind="escalated">escalated</span>' : '';
  }

  function getAlert(id) {
    for (let i = 0; i < state.alerts.length; i++) {
      if (state.alerts[i].id === String(id)) return state.alerts[i];
    }
    return null;
  }

  /* ---- roles ------------------------------------------------------------
     Two roles, decided at sign in. An Analyst reviews alerts and can hand
     tricky ones to a Supervisor, but cannot decide an alert they have already
     handed over. A Supervisor can decide anything, and has nobody above them,
     so there is nothing for them to escalate to. */

  function isSupervisor() {
    return !!state.session && state.session.role === 'Supervisor';
  }

  function isAnalyst() {
    return !!state.session && state.session.role === 'Analyst';
  }

  /* An escalated alert is locked for the Analyst who escalated it (and for any
     other Analyst) until a Supervisor decides. Resolving it clears the flag,
     so a resolved alert is never locked. */
  function actionsLocked(a) {
    return isAnalyst() && a.escalated === true && a.status !== 'Resolved';
  }

  /* Escalated alerts that nobody has decided yet. Used for the Supervisor's
     "waiting for you" line. */
  function waitingForSupervisor() {
    return state.alerts.filter(function (a) {
      return a.escalated === true && a.status !== 'Resolved';
    });
  }

  /* Clock time for a live audit entry. Zero padded so the HH:MM strings sort
     and read consistently with the seeded ones. */
  function clockNow() {
    const d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  /* Live tallies. Every screen reads from here, so a decision on the case
     screen changes the queue counter and the Reports figures immediately. */
  function counts() {
    const c = { total: state.alerts.length, New: 0, 'In review': 0, Resolved: 0, fp: 0 };
    for (let i = 0; i < state.alerts.length; i++) {
      const a = state.alerts[i];
      c[a.status] += 1;
      if (a.outcome === 'false_positive') c.fp += 1;
    }
    c.open = c.New + c['In review'];
    c.fpPct = c.total ? Math.round((c.fp / c.total) * 100) : 0;
    return c;
  }

  /* Small superscript tag, only drawn when the notes toggle is on. */
  function hTag(id) {
    if (!state.showNotes) return '';
    return '<sup class="h-tag" title="' + esc(HEURISTICS[id]) + '">' + id + '</sup>';
  }

  /* ---------------------------------------------------------- 3. routing */

  function parseRoute() {
    const raw = String(location.hash || '').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (!parts.length) return { name: 'login' };
    const head = parts[0];
    if (head === 'login')   return { name: 'login' };
    if (head === 'queue')   return { name: 'queue' };
    if (head === 'reports') return { name: 'reports' };
    if (head === 'case')    return { name: 'case', id: parts[1] || '' };
    return { name: 'notfound', path: raw };
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function router() {
    const route = parseRoute();

    /* No hash yet on first load: settle on the login screen. */
    if (!location.hash) { location.hash = '#/login'; return; }

    /* Leaving the screen drops any open dialog. The backdrop stops this
       happening with the mouse, but the browser Back button can still move
       pages while a dialog is open, which would strand it on the new screen. */
    if (state.modal && route.name !== 'case') state.modal = null;

    /* Nothing signed in: everything except login bounces back to login. */
    if (route.name !== 'login' && !state.session) { navigate('#/login'); return; }

    /* Already signed in: the login screen is not reachable any more. */
    if (route.name === 'login' && state.session) { navigate('#/queue'); return; }

    render(route);
  }

  /* ------------------------------------------------------------ 4. shell */

  function crumbTrail(route) {
    if (route.name === 'queue') {
      return [{ label: 'FlagWise', href: '#/queue' }, { label: 'Alert queue' }];
    }
    if (route.name === 'case') {
      return [
        { label: 'FlagWise', href: '#/queue' },
        { label: 'Alert queue', href: '#/queue' },
        { label: 'Alert ' + esc(route.id) }
      ];
    }
    if (route.name === 'reports') {
      return [{ label: 'FlagWise', href: '#/queue' }, { label: 'Reports' }];
    }
    return [{ label: 'FlagWise', href: '#/queue' }, { label: 'Page not found' }];
  }

  function legendHtml() {
    if (!state.showNotes) return '';
    let out = '<section class="legend" aria-label="Heuristic notes legend">' +
      '<h2>Heuristic notes legend &mdash; Nielsen&rsquo;s 10 usability heuristics</h2>' +
      '<div class="legend-grid">';
    for (let i = 0; i < HEURISTIC_NOTES.length; i++) {
      const id = HEURISTIC_NOTES[i][0];
      out += '<div class="legend-item">' +
        '<span class="h-tag">' + id + '</span>' +
        '<span><span class="lg-name">' + esc(HEURISTICS[id]) + '</span><br>' +
        '<span class="lg-where">' + esc(HEURISTIC_NOTES[i][1]) + '</span></span>' +
      '</div>';
    }
    return out + '</div></section>';
  }

  function shell(route, screenHtml) {
    const active = (route.name === 'case') ? 'queue' : route.name;
    const crumbs = crumbTrail(route);

    let crumbHtml = '';
    for (let i = 0; i < crumbs.length; i++) {
      const c = crumbs[i];
      const isLast = i === crumbs.length - 1;
      crumbHtml += '<li>' + (c.href && !isLast
        ? '<a href="' + c.href + '">' + c.label + '</a>'
        : '<span aria-current="page">' + c.label + '</span>') + '</li>';
    }

    return '' +
      '<header class="topbar">' +
        '<div class="topbar-inner">' +
          '<div class="brand">' +
            '<strong>FlagWise</strong>' +
          '</div>' +
          '<nav class="topnav" aria-label="Main">' +
            '<a class="navlink" href="#/queue"' + (active === 'queue' ? ' aria-current="page"' : '') + '>Queue</a>' +
            '<a class="navlink" href="#/reports"' + (active === 'reports' ? ' aria-current="page"' : '') + '>Reports</a>' +
          '</nav>' +
          '<div class="topbar-right">' +
            '<label class="notes-toggle' + (state.showNotes ? ' is-on' : '') + '" for="notesToggle">' +
              '<input type="checkbox" id="notesToggle"' + (state.showNotes ? ' checked' : '') + '> ' +
              'Show heuristic notes' + hTag('H10') +
            '</label>' +
            '<span class="whoami">Signed in as <b>' + esc(state.session.name) + '</b> (' + esc(state.session.role) + ')</span>' +
            '<button class="btn btn-sm" data-action="signout">Sign out' + hTag('H3') + '</button>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<div class="breadcrumb-bar"><nav class="breadcrumb" aria-label="Breadcrumb">' +
        '<span class="crumb-tag">' + hTag('H4') + '</span><ol>' + crumbHtml + '</ol></nav></div>' +

      '<main id="main" class="wrap">' +
        legendHtml() +
        screenHtml +
      '</main>' +

      modalHtml();
  }

  /* ----------------------------------------------------------- 5. screens */

  /* ---------------------------------------------------------- 5a. login */

  function loginHtml() {
    let opts = '';
    for (let i = 0; i < ROLES.length; i++) {
      opts += '<option value="' + esc(ROLES[i]) + '">' + esc(ROLES[i]) + '</option>';
    }
    return '' +
      '<div class="login-wrap">' +
        '<h1>FlagWise</h1>' +
        '<p class="muted small">Fraud alert triage for bank analysts. Sign in to open the alert queue.' + hTag('H2') + '</p>' +

        '<form class="panel" data-action="login" novalidate>' +
          '<h2>Sign in</h2>' +
          '<div class="panel-body">' +

            '<div class="field" data-field="username">' +
              '<label for="username">Username</label>' +
              '<input type="text" id="username" name="username" autocomplete="username" autofocus>' +
              '<span class="hint" id="usernameHint">For example: analyst1</span>' +
              '<p class="field-error" id="err-username" role="alert"></p>' +
            '</div>' +

            '<div class="field" data-field="password">' +
              '<label for="password">Password</label>' +
              '<input type="password" id="password" name="password" autocomplete="current-password">' +
              '<span class="hint">Any text is accepted here.' + hTag('H2') + '</span>' +
              '<p class="field-error" id="err-password" role="alert"></p>' +
            '</div>' +

            '<div class="field" data-field="role">' +
              '<label for="role">Role</label>' +
              '<select id="role" name="role">' + opts + '</select>' +
              '<span class="hint">Shown in the top bar so you always know which view you are in.' + hTag('H1') + '</span>' +
            '</div>' +

            '<button type="submit" class="btn btn-solid btn-block">Sign in' + hTag('H5') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>';
  }

  function doLogin(form) {
    const name = form.username.value.trim();
    const pass = form.password.value;
    const role = form.role.value;

    /* Inline validation. Nothing is submitted anywhere; the "login" is just
       remembering who you said you are. */
    let firstBad = null;
    [['username', name, 'Enter your username, for example analyst1.'],
     ['password', pass, 'Enter your password.']].forEach(function (row) {
      const key = row[0], value = row[1], message = row[2];
      const field = form.querySelector('[data-field="' + key + '"]');
      const err = form.querySelector('#err-' + key);
      if (value) {
        field.classList.remove('has-error');
        err.textContent = '';
        if (form[key].hasAttribute('aria-invalid')) form[key].removeAttribute('aria-invalid');
      } else {
        field.classList.add('has-error');
        /* The H9 tag rides along with the message, so "help users recover
           from errors" is evidenced by the error itself rather than by a
           sentence describing the error. */
        err.innerHTML = esc(message) + hTag('H9');
        form[key].setAttribute('aria-invalid', 'true');
        if (!firstBad) firstBad = form[key];
      }
    });

    if (firstBad) { firstBad.focus(); return; }

    state.session = { name: name, role: role };
    navigate('#/queue');
    /* No toast here. The top bar already shows who is signed in and what role
       they have, so repeating it on screen would be noise. */
  }

  /* ----------------------------------------------------------- 5b. queue */

  function filteredAlerts() {
    const q = state.queue.q.trim().toLowerCase();
    const list = state.alerts.filter(function (a) {
      if (state.queue.status !== 'All' && a.status !== state.queue.status) return false;
      if (state.queue.type !== 'All' && a.type !== state.queue.type) return false;
      if (state.queue.escalated !== 'All' && a.escalated !== true) return false;
      if (q && String(a.id).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    /* Always sorted by risk score, highest first. Alert ID breaks ties so the
       order never shuffles between renders. */
    list.sort(function (x, y) {
      if (y.riskScore !== x.riskScore) return y.riskScore - x.riskScore;
      return String(x.id).localeCompare(String(y.id));
    });
    return list;
  }

  function queueResultsHtml() {
    const list = filteredAlerts();
    const c = counts();

    /* Live counter. Counts are always across all alerts, so acting on one
       alert is visibly reflected here even while filters are applied. */
    let counter = '<p class="counter"><b>' + c.total + ' alerts</b>, ' + c.New +
                  ' new, ' + c['In review'] + ' in review, ' + c.Resolved + ' resolved.' + hTag('H1') + '</p>';

    const filtersOn = state.queue.q.trim() !== '' ||
                      state.queue.status !== 'All' ||
                      state.queue.type !== 'All' ||
                      state.queue.escalated !== 'All';
    if (filtersOn) {
      counter += '<p class="counter">Showing <b>' + list.length + ' of ' + c.total +
                '</b> alerts' +
                (state.queue.status !== 'All' ? ' &middot; status: ' + esc(state.queue.status) : '') +
                (state.queue.type !== 'All' ? ' &middot; type: ' + esc(state.queue.type) : '') +
                (state.queue.escalated !== 'All' ? ' &middot; escalated only' : '') +
                (state.queue.q.trim() ? ' &middot; search: "' + esc(state.queue.q.trim()) + '"' : '') +
                '</p>';
    }

    /* Only a Supervisor has anything waiting on them, so only they see this.
       The button applies the Escalated filter rather than duplicating it. */
    if (isSupervisor()) {
      const waiting = waitingForSupervisor();
      if (waiting.length) {
        counter += '<p class="counter supervisor-line">' +
          '<b>' + waiting.length + (waiting.length === 1 ? ' alert' : ' alerts') +
          ' escalated</b> and waiting for you' +
          (state.queue.escalated === 'All'
            ? ' <button class="btn btn-sm" data-action="show-escalated">Show them</button>'
            : '') +
          hTag('H1') +
        '</p>';
      }
    }

    if (!list.length) {
      return counter +
        '<div class="empty-state">' +
          '<p><strong>No alerts match these filters.</strong></p>' +
          '<p class="small">Try a different alert ID, or reset the filters to see all ' + c.total + ' alerts.</p>' +
          '<button class="btn" data-action="clear-filters">Clear filters</button>' +
        '</div>';
    }

    let rows = '';
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      rows += '<tr class="clickable" data-action="open-case" data-id="' + esc(a.id) + '" tabindex="0">' +
        '<td class="mono nowrap"><a href="#/case/' + esc(a.id) + '">' + esc(a.id) + '</a></td>' +
        '<td class="nowrap">' + esc(a.type) + '</td>' +
        '<td class="mono nowrap">' + fmt(a.amount) + '</td>' +
        '<td class="nowrap"><span class="mono">' + a.riskScore + '</span>' +
          '<div class="meter mini" aria-hidden="true"><i style="width:' + a.riskScore + '%"></i></div>' +
        '</td>' +
        '<td class="nowrap">' + riskChip(a.riskScore) + '</td>' +
        '<td>' + esc(a.reasons[0]) + '</td>' +
        '<td class="nowrap">' + statusChip(a.status) +
          (a.escalated ? '<br>' + escalatedChip(a) : '') +
          (a.outcome ? '<br>' + outcomeChip(a) : '') +
        '</td>' +
      '</tr>';
    }

    return counter +
      '<table class="grid">' +
        '<caption>Sorted by risk score, highest first. Select a row to open the case.</caption>' +
        '<thead><tr>' +
          '<th scope="col">Alert ID</th>' +
          '<th scope="col">Type</th>' +
          '<th scope="col">Amount</th>' +
          '<th scope="col">Risk score</th>' +
          '<th scope="col">Risk level</th>' +
          '<th scope="col">Top reason</th>' +
          '<th scope="col">Status</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  function queueHtml() {
    const sel = (name, current, values) => values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' +
             (v === 'All' ? 'All' : esc(v)) + '</option>';
    }).join('');

    return '' +
      '<h1>Alert queue' + hTag('H1') + '</h1>' +
      '<p class="muted">Ten synthetic alerts. Highest risk first. Select any row to see the full case.' + hTag('H6') + '</p>' +

      '<div class="toolbar">' +
        '<div class="field">' +
          '<label for="queueSearch">Search by alert ID</label>' +
          '<input type="search" id="queueSearch" placeholder="for example 1004" value="' + esc(state.queue.q) + '">' +
          '<span class="hint">Matches part of the ID, so "10" finds all ten.' + hTag('H7') + '</span>' +
        '</div>' +
        '<div class="field">' +
          '<label for="queueStatus">Status</label>' +
          '<select id="queueStatus">' + sel('status', state.queue.status, ['All'].concat(STATUS_VALUES)) + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="queueType">Type</label>' +
          '<select id="queueType">' + sel('type', state.queue.type, ['All'].concat(TYPE_VALUES)) + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="queueEscalated">Escalated</label>' +
          '<select id="queueEscalated">' +
            '<option value="All"' + (state.queue.escalated === 'All' ? ' selected' : '') + '>All</option>' +
            '<option value="Escalated"' + (state.queue.escalated === 'Escalated' ? ' selected' : '') + '>Escalated only</option>' +
          '</select>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<button class="btn" data-action="clear-filters">Clear filters' + hTag('H3') + '</button>' +
      '</div>' +

      '<div id="queue-results">' + queueResultsHtml() + '</div>';
  }

  /* Typing only re-renders the results region, so the search
     box keeps focus and the caret position. */
  function updateQueueResults() {
    const host = document.getElementById('queue-results');
    if (host) host.innerHTML = queueResultsHtml();
  }

  /* ---- confirmation dialog form -------------------------------------------
     The reason dropdown and the note field write straight into the open modal
     record and patch only the two small regions that display them. Re-rendering
     the dialog on every keystroke would rebuild the textarea and throw away
     the caret. */
  function refreshModalSummary() {
    const m = state.modal;
    if (!m) return;
    const summary = document.getElementById('modalSummary');
    if (!summary) return;
    summary.innerHTML = m.reason
      ? 'You are confirming this because: <strong>' + esc(m.reason) + '</strong>' +
        (m.detailNote ? '<br>Note: ' + esc(m.detailNote) : '')
      : 'No reason chosen yet. Pick one before you confirm.';
  }

  /* ------------------------------------------------------------ 5c. case */

  /* Three placeholder rows of recent account activity. Values are worked out
     from the alert itself so the numbers stay consistent between renders. */
  function historyRows(a) {
    const rows = [
      { date: '04 Mar', desc: 'Earlier ' + a.type.toLowerCase().replace('_', ' ') },
      { date: '02 Mar', desc: 'Payment to a shop' },
      { date: '27 Feb', desc: 'Money received from another account' }
    ];
    let html = '';
    for (let i = 0; i < rows.length; i++) {
      html += '<tr>' +
        '<td class="nowrap mono">' + esc(rows[i].date) + '</td>' +
        '<td>' + esc(rows[i].desc) + '</td>' +
        '<td class="nowrap mono">' + fmt((a.amount * (0.42 - i * 0.11)).toFixed(2)) + '</td>' +
        '<td class="nowrap">' + statusChip('Resolved') + '</td>' +
      '</tr>';
    }
    return html;
  }

  /* A bad address in the URL gets its own screen, rather than being reported
     as a missing alert. */
  function notFoundHtml(route) {
    return '' +
      '<h1>Page not found</h1>' +
      '<div class="empty-state">' +
        '<p><strong>There is no screen at <span class="mono">#/' + esc(route.path || '') + '</span>.</strong></p>' +
        '<p class="small">The address may be mistyped. Try the alert queue, or open a case such as ' +
          '<span class="mono">#/case/1004</span>.</p>' +
        '<a class="btn" href="#/queue">Go to the alert queue</a>' +
      '</div>';
  }

  /* TRANSFER moves money to another person's account. CASH_OUT is a cash
     machine withdrawal and PAYMENT pays a shop, so neither has a recipient
     account whose balance could be recorded. */
  const noRecipientNote = {
    CASH_OUT: 'A CASH_OUT is a withdrawal at a cash machine, so the money goes to the machine operator rather than to another account.',
    PAYMENT: 'A PAYMENT pays a shop or a merchant, not another person, so there is no recipient account to record.'
  };

  /* Audit trail, newest entry first. Entries are stored oldest first, so the
     copy is reversed for display only. */
  function logRows(a) {
    const entries = a.log.slice().reverse();
    let html = '';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      html += '<tr>' +
        '<td class="nowrap mono">' + esc(e.time) + '</td>' +
        '<td class="nowrap">' + esc(e.who) +
          (e.role && e.role !== 'system' ? ' <span class="muted small">(' + esc(e.role) + ')</span>' : '') +
        '</td>' +
        '<td>' + esc(e.action) + '</td>' +
        '<td>' + (e.reason ? esc(e.reason) : '<span class="muted">&mdash;</span>') +
          (e.note ? '<br><span class="muted small">' + esc(e.note) + '</span>' : '') +
        '</td>' +
      '</tr>';
    }
    return html;
  }

  function caseHtml(id) {
    const a = getAlert(id);

    if (!a) {
      return '' +
        '<h1>Alert ' + esc(id) + '</h1>' +
        '<div class="empty-state">' +
          '<p><strong>We could not find alert ' + esc(id) + '.</strong></p>' +
          '<p class="small">The address may be mistyped, or the alert may have been removed.</p>' +
          '<a class="btn" href="#/queue">Back to the queue</a>' +
        '</div>';
    }

    const level = riskLevel(a.riskScore);
    const hasRecipient = a.type === 'TRANSFER';
    const sup = isSupervisor();
    const locked = actionsLocked(a);
    const dis = locked ? ' disabled aria-disabled="true"' : '';

    return '' +
      '<a class="backlink" href="#/queue">&larr; Back to the queue' + hTag('H3') + '</a>' +

      '<div class="case-head">' +
        '<h1>Alert ' + esc(a.id) + '</h1>' +
        statusChip(a.status) + hTag('H1') +
        escalatedChip(a) +
        outcomeChip(a) +
        '<div class="spacer"></div>' +
        '<span class="muted small">Type ' + esc(a.type) + ' &middot; ' + fmt(a.amount) + '</span>' +
      '</div>' +

      '<div class="grid-2">' +

        /* ---- left column ---- */
        '<div>' +
          '<section class="panel">' +
            '<h2>Risk</h2>' +
            '<div class="panel-body">' +
              '<div class="risk-score">' + a.riskScore + '<span class="of">out of 100</span>' +
                riskChip(a.riskScore) + '</div>' +
              '<div class="meter"><i style="width:' + a.riskScore + '%"></i></div>' +
              '<div class="meter-scale"><span>0 low</span><span>40 medium</span><span>70 high</span><span>100</span></div>' +
              '<p class="small muted" style="margin-top:10px">Risk level <strong>' + level +
                '</strong>. Higher scores mean the transaction looks less like this ' +
                'account’s usual behaviour.' + hTag('H2') + '</p>' +
            '</div>' +
          '</section>' +

          /* Sits directly under the Risk panel so the reasons are readable
             without scrolling at 1280x800. It used to be a full-width panel
             below both columns, which pushed it off the screen. */
          '<section class="panel">' +
            '<h2>Why was this flagged?' + hTag('H6') + '</h2>' +
            '<div class="panel-body">' +
              '<p class="small muted">Written out in plain words, so you do not need to know how the checks work.</p>' +
              '<ol class="reasons">' +
                a.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') +
              '</ol>' +
            '</div>' +
          '</section>' +

          '<section class="panel">' +
            '<h2>Transaction details' + hTag('H6') + '</h2>' +
            '<div class="panel-body">' +
              '<dl class="dl">' +
                '<dt>Alert ID</dt><dd>' + esc(a.id) + '</dd>' +
                '<dt>Type</dt><dd>' + esc(a.type) + '</dd>' +
                '<dt>Amount</dt><dd>' + fmt(a.amount) + '</dd>' +
                '<dt>Sender balance before</dt><dd>' + fmt(a.oldbalanceOrg) + '</dd>' +
                '<dt>Sender balance after</dt><dd>' + fmt(a.newbalanceOrig) + '</dd>' +
                '<dt>Recipient balance before</dt><dd>' + fmt(a.oldbalanceDest) + '</dd>' +
                '<dt>Recipient balance after</dt><dd>' + fmt(a.newbalanceDest) + '</dd>' +
                (hasRecipient ? '' :
                  '<div class="dl-note">' + esc(noRecipientNote[a.type] || '') +
                    ' Both recipient balances are recorded as ' + fmt(0) + '.</div>') +
              '</dl>' +
            '</div>' +
          '</section>' +

          '<section class="panel">' +
            '<h2>Activity log' + hTag('H1') + '</h2>' +
            '<div class="panel-body" style="padding:0">' +
              '<table class="grid">' +
                '<caption style="padding:8px 10px 0">Everything that has happened to this alert, newest first. ' +
                  'Kept in memory only, so it resets when you reload.</caption>' +
                '<thead><tr><th scope="col">Time</th><th scope="col">Who</th>' +
                '<th scope="col">Action</th><th scope="col">Reason</th></tr></thead>' +
                '<tbody>' + logRows(a) + '</tbody>' +
              '</table>' +
            '</div>' +
          '</section>' +
        '</div>' +

        /* ---- right column ---- */
        '<div>' +
          '<section class="panel">' +
            '<h2>What would you like to do?' + hTag('H5') + '</h2>' +
            '<div class="panel-body">' +
              '<ul class="action-list">' +
                '<li><b>Approve</b>Calls this a false positive. Nothing is blocked and the account carries on. ' +
                  'Happens straight away, and you can undo it.</li>' +
                '<li><b>Block account</b>Stops the sender making any more payments and holds this transfer. ' +
                  'Asks you to confirm first.' + hTag('H5') + '</li>' +
                '<li><b>Escalate</b>Hands the alert to a Supervisor to decide. Blocks nothing. ' +
                  'Asks you to confirm first.' + hTag('H5') + '</li>' +
              '</ul>' +
              '<button class="btn btn-block" data-action="approve" data-id="' + esc(a.id) + '"' + dis + '>Approve</button>' +
              '<button class="btn btn-block" data-action="open-block" data-id="' + esc(a.id) + '"' + dis + '>Block account</button>' +
              (sup ? '' :
                '<button class="btn btn-block" data-action="open-escalate" data-id="' + esc(a.id) + '"' + dis + '>Escalate</button>') +
              (locked ?
                '<p class="lock-note" role="status">Escalated to a Supervisor. ' +
                  'Waiting for their decision.' + hTag('H1') + '</p>' :
                '<p class="small muted" style="margin:10px 0 0">Decisions show a message at the bottom of the screen, ' +
                'with an Undo button for 8 seconds.</p>') +
            '</div>' +
          '</section>' +

          '<section class="panel">' +
            '<h2>Recent history' + hTag('H6') + '</h2>' +
            '<div class="panel-body" style="padding:0">' +
              '<table class="grid">' +
                '<caption style="padding:8px 10px 0">Recent activity on this account.</caption>' +
                '<thead><tr><th scope="col">Date</th><th scope="col">Description</th>' +
                '<th scope="col">Amount</th><th scope="col">Result</th></tr></thead>' +
                '<tbody>' + historyRows(a) + '</tbody>' +
              '</table>' +
            '</div>' +
          '</section>' +
        '</div>' +
      '</div>';
  }

  /* --------------------------------------------------------- 5d. reports */

  function reportsHtml() {
    const c = counts();

    const cards = [
      ['Total alerts', c.total, '', 'All alerts loaded in this session.', 'H1'],
      ['Resolved', c.Resolved, '', 'Status changed to Resolved.', 'H1'],
      ['Still open', c.open, '', c.New + ' new and ' + c['In review'] + ' in review.', 'H1'],
      ['Approved as false positive', c.fpPct + '<small>%</small>', c.fp + ' of ' + c.total, 'Counted from the Approve action.', 'H1']
    ];

    let cardsHtml = '<section class="cards">';
    for (let i = 0; i < cards.length; i++) {
      cardsHtml += '<div class="card">' +
        '<h2>' + cards[i][0] + hTag(cards[i][4]) + '</h2>' +
        '<div class="figure">' + cards[i][1] +
          (cards[i][2] ? ' <small>' + cards[i][2] + '</small>' : '') + '</div>' +
        '<p class="detail">' + esc(cards[i][3]) + '</p>' +
      '</div>';
    }
    cardsHtml += '</section>';

    /* Bar chart placeholder. Bars are plain divs sized as a percentage of the
       largest bar, computed from the live alert list. */
    const max = Math.max(1, Math.max.apply(null, STATUS_VALUES.map(function (s) { return c[s]; })));
    let chartRows = '';
    for (let i = 0; i < STATUS_VALUES.length; i++) {
      const s = STATUS_VALUES[i];
      const w = Math.round((c[s] / max) * 100);
      chartRows += '<div class="chart-row">' +
        '<span class="chart-label">' + statusChip(s) + '</span>' +
        '<div class="chart-track"><div class="chart-bar" style="width:' + w + '%"></div></div>' +
        '<span class="chart-value">' + c[s] + '</span>' +
      '</div>';
    }

    return '' +
      '<h1>Reports' + hTag('H1') + '</h1>' +
      '<p class="muted">Counts are worked out from the alerts in this session every time the screen loads. ' +
        'Nothing is stored, so this resets if you reload the page.' + hTag('H8') + '</p>' +

      cardsHtml +

      '<section class="panel">' +
        '<h2>Alerts by status' + hTag('H1') + '</h2>' +
        '<div class="panel-body">' +
          '<div class="chart">' +
            '<div class="chart-cap">Alerts by status</div>' +
            chartRows +
            '<div class="chart-axis"><span>0</span><span>' + max + ' alerts (longest bar)</span></div>' +
          '</div>' +
          '<p class="small muted" style="margin-top:10px">Approve, block or escalate an alert and these ' +
            'figures change straight away. Try it: open a high risk alert and block it, then press Undo.</p>' +
        '</div>' +
      '</section>';
  }

  /* ------------------------------------------------------ 6. modal + toast */

  function modalHtml() {
    if (!state.modal) return '';
    const m = state.modal;

    /* Reason and note live on the modal record rather than in local variables,
       so they survive a re-render and can be read on confirm.
       `m.note` is the dialog's own reassurance line about Undo. The user's
       free text is `m.detailNote`, so the two cannot collide. */
    const reasons = m.reasons || [];
    const picked = m.reason || '';
    const note = m.detailNote || '';

    let options = '<option value="">Choose a reason</option>';
    for (let i = 0; i < reasons.length; i++) {
      options += '<option value="' + esc(reasons[i]) + '"' +
                 (reasons[i] === picked ? ' selected' : '') + '>' +
                 esc(reasons[i]) + '</option>';
    }

    const summary = picked
      ? 'You are confirming this because: <strong>' + esc(picked) + '</strong>' +
        (note ? '<br>Note: ' + esc(note) : '')
      : 'No reason chosen yet. Pick one before you confirm.';

    return '' +
      '<div class="modal-backdrop">' +
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" tabindex="-1">' +
          '<h2 id="modalTitle">' + esc(m.title) + '</h2>' +
          '<div class="modal-body">' +
            '<p>' + esc(m.intro) + '</p>' +
            '<ul>' + m.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +

            '<div class="field" data-field="modalReason">' +
              '<label for="modalReason">Reason' + hTag('H5') + '</label>' +
              '<select id="modalReason">' + options + '</select>' +
              '<p class="field-error" id="err-modalReason" role="alert"></p>' +
            '</div>' +

            '<div class="field" data-field="modalNote">' +
              '<label for="modalNote">Note <span class="muted">(optional)</span></label>' +
              '<textarea id="modalNote" rows="2" maxlength="' + NOTE_MAX + '" ' +
                'placeholder="Anything the Supervisor should know">' + esc(note) + '</textarea>' +
              '<span class="hint"><span id="noteCount">' + note.length + ' / ' + NOTE_MAX + '</span>' +
                ' characters' + hTag('H5') + '</span>' +
            '</div>' +

            '<p class="modal-note" id="modalSummary">' + summary + '</p>' +
            '<p class="modal-note">' + esc(m.note) + '</p>' +
          '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn" data-action="modal-cancel">' + esc(m.cancelLabel || 'Cancel') + '</button>' +
            '<button class="btn btn-solid" data-action="modal-confirm">' + esc(m.confirmLabel) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function openModal(m) {
    state.modal = m;
    render();
    const box = document.querySelector('.modal');
    if (box) box.focus();
  }

  function closeModal() {
    state.modal = null;
    render();
  }

  /* Confirmation copy states exactly what will happen before the analyst
     commits to a destructive or hand-off action. */
  function openConfirm(kind, id) {
    const a = getAlert(id);
    if (!a) return;

    if (kind === 'block') {
      openModal({
        title: 'Block the account behind alert ' + a.id + '?',
        intro: 'Blocking is hard to undo for the customer, so we check first. If you confirm:',
        lines: [
          'The sender\u2019s account will be blocked. No more payments can leave it.',
          'The ' + fmt(a.amount) + ' transfer will be held while a Supervisor looks at it.',
          'Alert ' + a.id + ' will change to status Resolved and be marked as blocked.',
          'The decision will be counted in the Reports screen.'
        ],
        note: 'You can undo this for 8 seconds after you confirm.',
        confirmLabel: 'Yes, block account',
        reasons: BLOCK_REASONS,
        onConfirm: function (detail) { applyAction('block', id, detail); }
      });
    } else {
      openModal({
        title: 'Escalate alert ' + a.id + ' to a Supervisor?',
        intro: 'Escalation asks someone else to decide. It does not block anything. If you confirm:',
        lines: [
          'Alert ' + a.id + ' will be passed to the Supervisor queue for a decision.',
          'Its status will change to In review, so it is still counted as open.',
          'The case will show an "escalated" marker so you can see you already passed it on.',
          'It stays with the Supervisor until they make a decision.'
        ],
        note: 'You can undo this for 8 seconds after you confirm.',
        confirmLabel: 'Yes, escalate',
        reasons: ESCALATE_REASONS,
        onConfirm: function (detail) { applyAction('escalate', id, detail); }
      });
    }
  }

  /* The single place an alert's data changes. Takes a snapshot first so Undo
     can put the record back exactly as it was, including outcome, flags and
     the audit log, because the snapshot is a deep clone. */
  function applyAction(kind, id, detail) {
    const a = getAlert(id);
    if (!a) return;

    detail = detail || {};
    const before = JSON.parse(JSON.stringify(a));
    let msg, actionLabel;

    if (kind === 'approve') {
      a.status = 'Resolved';
      a.outcome = 'false_positive';
      a.escalated = false;
      msg = 'Alert ' + a.id + ' approved as a false positive.';
      actionLabel = 'Approved as false positive';
    } else if (kind === 'block') {
      a.status = 'Resolved';
      a.outcome = 'blocked';
      a.escalated = false;
      msg = 'Alert ' + a.id + ' blocked.';
      actionLabel = 'Blocked';
    } else {
      a.status = 'In review';
      a.escalated = true;
      msg = 'Alert ' + a.id + ' escalated to a Supervisor.';
      actionLabel = 'Escalated';
    }

    /* Appended after the snapshot, so Undo removes this entry along with the
       rest of the change. */
    a.log.push({
      time: clockNow(),
      who: state.session ? state.session.name : 'unknown',
      role: state.session ? state.session.role : 'unknown',
      action: actionLabel,
      reason: detail.reason || null,
      note: detail.note || null
    });

    const undoMsg = 'Undo done. Alert ' + a.id + ' is back to ' + before.status + '.';

    render();
    pushToast(msg, {
      ms: 8000,
      alertId: a.id,
      undo: function () { Object.assign(getAlert(id), before); },
      undoMsg: undoMsg
    });
  }

  /* Several toasts can be stacked at once, so the visible text stays "Undo"
     and the accessible name says which alert it belongs to. Otherwise a screen
     reader hears several identical "Undo" buttons and no way to tell them
     apart. */
  function toastHtml(t) {
    return '<div class="toast' + (t.info ? ' is-info' : '') + '" data-tid="' + t.id + '" data-ms="' + t.ms + '">' +
      '<div class="toast-body">' +
        '<span class="msg">' + esc(t.msg) + '</span>' +
        (t.undo
          ? '<button class="btn btn-sm" data-action="undo" data-tid="' + t.id + '"' +
            ' aria-label="Undo decision on alert ' + esc(t.alertId || '') + '">Undo</button>'
          : '') +
      '</div>' +
      '<div class="toast-timer"><i></i></div>' +
    '</div>';
  }

  function pushToast(msg, opts) {
    opts = opts || {};
    const t = {
      id: 't' + (++toastSeq),
      msg: msg,
      undo: opts.undo || null,
      undoMsg: opts.undoMsg || '',
      alertId: opts.alertId || '',
      info: !!opts.info,
      ms: opts.ms || 8000
    };
    state.toasts.push(t);
    syncToasts();
    setTimeout(function () { removeToast(t.id); }, t.ms);
    return t.id;
  }

  function removeToast(id) {
    state.toasts = state.toasts.filter(function (t) { return t.id !== id; });
    syncToasts();
  }

  /* Toasts live outside #app, so screens are added and removed one at a time
     instead of the whole list being rebuilt. Otherwise every new toast would
     restart the countdown on the ones already on screen. */
  function syncToasts() {
    const host = document.getElementById('toasts');
    if (!host) return;

    Array.prototype.slice.call(host.querySelectorAll('.toast')).forEach(function (el) {
      const id = el.getAttribute('data-tid');
      const stillThere = state.toasts.some(function (t) { return t.id === id; });
      if (!stillThere) el.remove();
    });

    state.toasts.forEach(function (t) {
      if (host.querySelector('.toast[data-tid="' + t.id + '"]')) return;
      host.insertAdjacentHTML('beforeend', toastHtml(t));

      const bar = host.querySelector('.toast[data-tid="' + t.id + '"] .toast-timer > i');
      if (bar) bar.style.animationDuration = t.ms + 'ms';
    });
  }

  function doUndo(tid) {
    let t = null;
    for (let i = 0; i < state.toasts.length; i++) {
      if (state.toasts[i].id === tid) { t = state.toasts[i]; break; }
    }
    if (!t || !t.undo) return;

    t.undo();                                       // actually revert the change
    removeToast(tid);
    render();                                       // queue counters and reports update
    pushToast(t.undoMsg || 'Undo done.', { ms: 4000, info: true });
  }

  /* -------------------------------------------------------- 7. render + events */

  function render(forcedRoute) {
    const route = forcedRoute || parseRoute();
    const app = document.getElementById('app');
    if (!app) return;

    let screen;
    if (route.name === 'login')        screen = loginHtml();
    else if (route.name === 'queue')   screen = queueHtml();
    else if (route.name === 'case')    screen = caseHtml(route.id);
    else if (route.name === 'reports') screen = reportsHtml();
    else                               screen = notFoundHtml(route);

    /* The login screen has no navigation: there is nobody signed in yet, so
       there would be no user name to show and Queue/Reports would be dead
       links. Every other screen shares the same shell.

       The legend still appears here, above the form. Without a top bar there
       is no toggle, so if the notes were left on from an earlier screen the
       login screen would show tags that nothing explains. */
    if (route.name === 'login' || !state.session) {
      const band = legendHtml()
        ? '<main id="main" class="wrap">' + legendHtml() + '</main>'
        : '';
      app.innerHTML = band + screen + (state.modal ? modalHtml() : '');
    } else {
      app.innerHTML = shell(route, screen);
    }

    document.title = 'FlagWise - ' +
      (route.name === 'case' ? 'Alert ' + route.id :
       route.name === 'reports' ? 'Reports' :
       route.name === 'queue' ? 'Alert queue' : 'Sign in');
  }

  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    const id = el.getAttribute('data-id');

    switch (action) {
      case 'login':
        return;                                   // handled on submit

      case 'open-case':
        /* The alert ID is a real link so it can be opened in a new tab. Click
           it directly and let the browser follow the hash instead. */
        if (e.target.closest('a')) return;
        e.preventDefault();
        navigate('#/case/' + id);
        return;

      case 'clear-filters':
        state.queue = { q: '', status: 'All', type: 'All', escalated: 'All' };
        render();
        return;

      case 'show-escalated':
        state.queue.escalated = 'Escalated';
        render();
        return;

      case 'signout':
        state.session = null;
        state.modal = null;
        render();
        location.hash = '#/login';
        return;

      case 'approve':
        /* Belt and braces. The buttons are already disabled for a locked
           alert, but the click handler refuses too, so the rule holds however
           the click arrives. */
        if (id && actionsLocked(getAlert(id))) return;
        applyAction('approve', id);
        return;

      case 'open-block':
        if (id && actionsLocked(getAlert(id))) return;
        openConfirm('block', id);
        return;

      case 'open-escalate':
        if (id && actionsLocked(getAlert(id))) return;
        if (isSupervisor()) return;             // nobody above a Supervisor
        openConfirm('escalate', id);
        return;

      case 'modal-cancel':
        closeModal();
        return;

      case 'modal-confirm': {
        const m = state.modal;
        if (!m) return;
        const reason = m.reason || '';
        const note = m.detailNote || '';

        /* A reason is required. Refusing here rather than in openConfirm means
           the dialog simply stays open, so the analyst keeps their place and
           the focus is not thrown back to the page behind. The error is
           written straight into the dialog instead of re-rendering it, which
           would also rebuild the select and lose focus. */
        if (!reason) {
          const field = document.querySelector('[data-field="modalReason"]');
          const err = document.getElementById('err-modalReason');
          const select = document.getElementById('modalReason');
          if (field) field.classList.add('has-error');
          if (err) err.innerHTML = esc('Error: choose a reason before confirming.') + hTag('H9');
          if (select) {
            select.setAttribute('aria-invalid', 'true');
            select.focus();
          }
          return;
        }

        const fn = m.onConfirm;
        state.modal = null;
        if (fn) fn({ reason: reason, note: note });
        return;
      }

      case 'undo':
        doUndo(el.getAttribute('data-tid'));
        return;
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target.closest('form[data-action="login"]');
    if (!form) return;
    e.preventDefault();
    doLogin(form);
  });

  /* Typing only re-renders the results region, so the caret stays put. */
  document.addEventListener('input', function (e) {
    if (e.target.id === 'queueSearch') {
      state.queue.q = e.target.value;
      updateQueueResults();
      return;
    }
    /* The note field updates its counter and the summary in place. The dialog
       is deliberately not re-rendered, which would replace the textarea and
       throw the caret back to the start on every keystroke. */
    if (e.target.id === 'modalNote' && state.modal) {
      state.modal.detailNote = e.target.value;
      const counter = document.getElementById('noteCount');
      if (counter) counter.textContent = e.target.value.length + ' / ' + NOTE_MAX;
      refreshModalSummary();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'modalReason' && state.modal) {
      state.modal.reason = e.target.value;
      /* Picking a reason clears the error, so the analyst is not told off
         again for something they have just fixed. */
      if (e.target.value) {
        const field = document.querySelector('[data-field="modalReason"]');
        const err = document.getElementById('err-modalReason');
        if (field) field.classList.remove('has-error');
        if (err) err.textContent = '';
        e.target.removeAttribute('aria-invalid');
      }
      refreshModalSummary();
      return;
    }

    if (e.target.id === 'queueStatus') {
      state.queue.status = e.target.value;
      updateQueueResults();
    } else if (e.target.id === 'queueType') {
      state.queue.type = e.target.value;
      updateQueueResults();
    } else if (e.target.id === 'queueEscalated') {
      state.queue.escalated = e.target.value;
      updateQueueResults();
    } else if (e.target.id === 'notesToggle') {
      state.showNotes = e.target.checked;
      /* The whole screen is redrawn to add or remove the tags, which also
         replaces this checkbox. Put the focus back on the new one so keyboard
         users are not dumped back at the top of the page. */
      const hadFocus = document.activeElement === e.target;
      render();
      if (hadFocus) {
        const next = document.getElementById('notesToggle');
        if (next) next.focus();
      }
    }
  });

  /* Escape cancels the confirmation dialog, the safe default. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.modal) {
      e.preventDefault();
      closeModal();
    }
  });

  /* Keyboard access for queue rows. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('tr[data-action="open-case"]');
    if (!row) return;
    e.preventDefault();
    navigate('#/case/' + row.getAttribute('data-id'));
  });

  /* ----------------------------------------------------------- bootstrap */

  function init() {
    /* data.js is the pristine copy; the working copy is a deep clone so that
       Undo never mutates the original records. */
    state.alerts = JSON.parse(JSON.stringify(ALERT_DATA));

    /* Every alert carries an audit trail. Normalising here means the action
       code and the panel can both assume the array exists. */
    state.alerts.forEach(function (a) {
      if (!a.log) a.log = [];
    });

    window.addEventListener('hashchange', router);
    router();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();