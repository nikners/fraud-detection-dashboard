# FlagWise — low-fidelity wireframe prototype

A clickable wireframe of a fraud analyst dashboard. It is deliberately
unfinished-looking: grey outlines, square corners, system fonts and outlined
boxes in place of real imagery and charts.

This is a low-fidelity prototype. Risk scores are hardcoded and the data is
synthetic. There is no backend, no database, no machine learning model and no
real authentication.

---

## How to open it

**Double-click `index.html`.** That is the whole procedure.

No install, no build step, no server, no internet connection. It runs from
`file://`.

```
FraudDetection/
├── index.html    page shell, loads the two scripts
├── styles.css    the whole wireframe stylesheet
├── app.js        router, screens, dialogs, toasts
├── data.js       10 synthetic alerts (the only "data source")
└── README.md     this file
```

### Signing in

Type **any** username and **any** password, pick a role, and press *Sign in*.
Leaving a field empty shows an inline error instead of signing you in.

Suggested values: `analyst1` / `password` / Analyst.

### Things worth trying

| Try this | What you should notice |
|---|---|
| Submit the sign-in form empty | Inline error naming the missing field |
| Sign in, look at the queue | 10 alerts sorted by risk score, highest first |
| Type `100` in the search box | All ten alerts match; the caret stays put |
| Clear filters, then click row **1001** | Case screen opens with reasons and balances |
| Press **Block account** | Confirmation dialog listing what will happen, plus a required Reason |
| Confirm without a reason | The dialog stays open with an inline error; nothing changes |
| Confirm it | Status turns Resolved, a toast appears with an 8 second **Undo** |
| Press **Undo** quickly | The alert genuinely reverts to New, log entry included, and you get a confirmation |
| Wait 8 seconds instead | The toast disappears on its own, counting down as it goes |
| Press **Escalate** | Stays In review, gains an "escalated" marker, and the actions lock for an Analyst |
| Sign in as **Supervisor** | Escalate is gone, escalated alerts are actionable, and "waiting for you" appears on the queue |
| Scroll to **Activity log** | Every action recorded with time, who, role, action and reason |
| Go to **Reports** | Figures already non-zero on first load, and they update as you act |
| Turn on **Show heuristic notes** | Numbered tags appear and a legend explains all ten |

---

## Screens

### 1. Sign in — `#/login`

Username, password, role dropdown (Analyst / Supervisor) and a *Sign in*
button. Any non-empty input signs you in. Empty fields produce a clear inline
error under the offending field rather than a browser tooltip.

This is the only screen with no top navigation: there is nobody signed in yet,
so there would be no user name to show and Queue/Reports would be dead links.

### 2. Alert queue — `#/queue`

A table sorted by risk score, highest first:

**Alert ID · Type · Amount · Risk score · Risk level · Top reason · Status**

- Search box matching on alert ID (partial matches work, so `10` finds all ten)
- Filters for **Status** (New / In review / Resolved), **Type**, and
  **Escalated** (All / Escalated only)
- A live counter: *"10 alerts, 4 new, 2 in review, 4 resolved."*
- A line for Supervisors only when escalated alerts are waiting on them
- An empty state with a *Clear filters* button when nothing matches
- Clicking a row opens the case; the alert ID is also a real link

Status values are exactly **New**, **In review**, **Resolved**.

### 3. Case detail — `#/case/<id>`

- Back link to the queue
- Header with the alert ID, a status badge, and any outcome or escalation marker
- Risk score with its level spelled out, plus a bar and the 0–100 scale
- **"Why was this flagged?"** — the reasons in plain language, numbered
- **Transaction details**: type, amount, sender balance before/after,
  recipient balance before/after
- **Recent history** — 3 sample rows of past account activity
- **Activity log** — the audit trail, newest first, with an H1 tag
- Actions: **Approve**, **Block account**, **Escalate** — which of these are
  available depends on your role (see below)

### 4. Roles

The role picked at sign in decides what you can do.

**Analyst**

- Can Approve, Block or Escalate any alert.
- Once an alert is escalated it is locked for Analysts. All three actions are
  disabled and the case says *"Escalated to a Supervisor. Waiting for their
  decision."* The 8 second Undo still works, so an escalation can be taken
  back straight away.
- Does not see the "waiting for you" line on the queue.

**Supervisor**

- Can Approve or Block **any** alert, including escalated ones.
- The **Escalate** button is not shown, because there is nobody above a
  Supervisor to hand an alert to.
- Sees a line above the queue such as *"2 alerts escalated and waiting for
  you"*, with a button that applies the Escalated filter.

Alert 1002 is seeded as escalated, so a Supervisor has something waiting on
them the first time they sign in. An Analyst signing in first finds that one
alert already locked.

### 5. Confirmation dialog

Shown for **Block account** and **Escalate**. It lists exactly what will happen
before you commit, then offers Cancel / Confirm. `Escape` cancels.

The dialog also has a **required Reason** dropdown and an **optional Note**
(max 140 characters, with a counter):

- Block reasons: Confirmed fraud / Suspected fraud, customer unreachable /
  Account takeover suspected / Other
- Escalate reasons: Needs a second opinion / Amount above my approval limit /
  Unsure about the pattern / Other

Confirm does nothing until a reason is chosen. The dialog stays open and shows
an inline *"Error: choose a reason before confirming"* under the dropdown, with
focus left in the dropdown. The chosen reason and note are echoed in the
dialog's summary line and stored on the alert's activity log entry.

Confirming shows a toast that stays for **8 seconds** with an **Undo** button
and a visible countdown bar. Pressing Undo genuinely reverts the alert,
including its outcome, escalation flags and the log entry it just created.

| Action | Asks first? | Result | Toast |
|---|---|---|---|
| Approve | No | Status `Resolved`, marked as a false positive | `Alert 1004 approved as a false positive.` |
| Block account | Yes, plus a reason | Status `Resolved`, marked as blocked | `Alert 1004 blocked.` |
| Escalate | Yes, plus a reason | Status stays `In review`, gains an `escalated` marker | `Alert 1004 escalated to a Supervisor.` |

Approve is deliberately instant and unconfirmed because it blocks nothing and
is fully reversible. Every action writes a line to the alert's activity log
with the clock time, the signed-in username and role, the action, and the
reason and note if any.

### 6. Reports — `#/reports`

- Summary cards: total alerts, resolved, still open, % approved as false positive
- A bar chart of alerts by status, built from plain divs
- Everything recomputed live, so acting on an alert changes the figures

With the sample data as shipped: **10 total, 4 resolved, 6 still open, 30%
marked as false positive (3 of 10)**.

---

## Heuristic notes

Turn on **Show heuristic notes** in the top bar. Small numbered tags appear
next to the UI elements they refer to, and a legend explains all ten. This is
switched off by default so normal screenshots look like a plain wireframe.

The tags follow Nielsen's ten usability heuristics (1994):

| # | Heuristic | Where it shows up in FlagWise |
|---|---|---|
| H1 | Visibility of system status | Status badges, the alert counter, toast messages, the Reports figures, the 8 second countdown bar, the Supervisor's "waiting for you" line, and the per-alert **Activity log** |
| H2 | Match between the system and the real world | "Sign in", "Approve", "Why was this flagged?"; no internal codes or jargon |
| H3 | User control and freedom | Back link, Cancel in the dialog, Sign out, and the 8 second **Undo** on every decision |
| H4 | Consistency and standards | The same top navigation, breadcrumb, panel headings and button styles on all four post-login screens |
| H5 | Error prevention | Block and Escalate confirm the consequences first and require a **Reason**; empty login fields are caught before submitting |
| H6 | Recognition over recall | Search box, Status, Type and Escalated filters, breadcrumbs, and reasons written out in full |
| H7 | Flexibility and efficiency of use | Narrow by ID, Status, Type and Escalated together; rows open the case directly |
| H8 | Aesthetic and minimalist design | Grayscale interface, one accent colour, no decoration competing with the data |
| H9 | Help users recover from errors | Inline field errors name the problem — including *"Error: choose a reason before confirming"* in the dialog — and Undo restores a decision, its flags and its log entry, then confirms it |
| H10 | Help and documentation | The heuristic notes legend explains every tag on the page |

---

## Sample data

10 synthetic records in the style of the PaySim dataset. No real people,
accounts or transactions. Fields: `id`, `type`, `amount`, `oldbalanceOrg`,
`newbalanceOrig`, `oldbalanceDest`, `newbalanceDest`, `riskScore`, `reasons`,
`status`, plus `outcome` and `escalated` used by the action buttons.

| ID | Type | Amount | Sender before → after | Recipient before → after | Risk | Level | Status | Outcome |
|---|---|---|---|---|---|---|---|---|
| 1001 | TRANSFER | $980.00 | $980.00 → $0.00 | $0.00 → $980.00 | 93 | HIGH | New | — |
| 1002 | CASH_OUT | $250.50 | $250.50 → $0.00 | $0.00 → $0.00 | 88 | HIGH | In review | — |
| 1003 | TRANSFER | $1,540.20 | $1,540.20 → $0.00 | $0.00 → $1,540.20 | 84 | HIGH | New | — |
| 1004 | TRANSFER | $420.75 | $420.75 → $0.00 | $0.00 → $420.75 | 81 | HIGH | Resolved | blocked |
| 1005 | TRANSFER | $320.00 | $1,200.00 → $880.00 | $15.40 → $335.40 | 68 | MEDIUM | New | — |
| 1006 | CASH_OUT | $610.10 | $1,500.00 → $889.90 | $0.00 → $0.00 | 57 | MEDIUM | In review | — |
| 1007 | PAYMENT | $89.99 | $640.25 → $550.26 | $0.00 → $0.00 | 46 | MEDIUM | Resolved | false positive |
| 1008 | PAYMENT | $45.20 | $300.15 → $254.95 | $0.00 → $0.00 | 33 | LOW | Resolved | false positive |
| 1009 | TRANSFER | $120.00 | $900.00 → $780.00 | $500.00 → $620.00 | 22 | LOW | Resolved | false positive |
| 1010 | CASH_OUT | $60.00 | $250.00 → $190.00 | $0.00 → $0.00 | 12 | LOW | New | — |

The four high-risk records all share the same pattern: the sender's balance
drops to zero and the recipient account started at zero.

**Risk bands** — HIGH 70 and above, MEDIUM 40–69, LOW below 40. The level is
always shown as a word next to the score, never as colour alone.

The four Resolved records carry seeded outcomes so that Reports shows real,
non-zero numbers on first load instead of an empty report. Acting on an alert
changes them, and Undo puts them back.

---

## Assumptions and decisions

1. **Medium scores sit in 40–69.** Three medium records were specified as
   "40 to 79" while the MEDIUM band was set at 40–69. All medium records were
   placed inside 40–69 so the data and the band rules agree.
2. **Recipient balances are `0.00 → 0.00` for `CASH_OUT` *and* `PAYMENT`.**
   A cash machine withdrawal pays a machine operator and a payment pays a shop,
   so neither has a recipient account to record. Only `TRANSFER` carries real
   recipient balances. The case screen says so in a note under the balances,
   otherwise two different rows would silently mean two different things.
3. **The counter is live, not the literal example.** The original example was
   "12 alerts, 8 new"; the shipped data has 10 records, so it reads
   "10 alerts, 4 new, 2 in review, 4 resolved." and updates as you act.
4. **`status` and `outcome` are separate fields.** `status` keeps exactly the
   three allowed values so the filter stays meaningful; `outcome` records *why*
   something was resolved and only exists on Resolved alerts.
5. **Escalate does not invent a fourth status.** It sets status to
   `In review` and adds an `escalated` marker, so the alert stays counted as
   open.
6. **Filters live in memory, not in the URL hash.** They survive clicking into
   a case and coming back, but are not bookmarkable or shareable.
7. **The queue is not re-sortable.** It is always risk-descending, so the
   ordering is predictable rather than a control that can be set wrong.
8. **Reports has no date filter.** It always reflects the current session's
   state, and says so on screen. Everything resets on reload by design.
9. **Any non-empty credentials sign you in**, as specified. No validation of
   any kind, and no password is stored.
10. **Errors are grayscale, not red.** The one accent colour is reserved for
    risk. Errors instead use a thickened border plus an explicit `Error:`
    prefix, so they are still unmissable.
11. **Risk is encoded three ways** — fill, border weight and the written word —
    so levels survive being printed in black and white or read by someone who
    cannot distinguish the accent colour.
12. **The queue row ID is a real link**, so a case can be opened in a new tab.
    Clicking anywhere else on the row navigates the same way.
13. **Currency is shown as `$`.** PaySim is denominated in rupiah, but `$` is
    easier to read at a glance. Swap the `Intl.NumberFormat` call in `app.js`
    if you want `Rp`.
14. **Keyboard support was added on top of the original requirements**: queue
    rows open with `Enter`/`Space`, `Escape` cancels the dialog, and focus is
    kept on the heuristic-notes toggle across re-renders.
15. **The H9 tag moved onto the inline login error.** It used to sit beside a
    sentence *describing* the error; it now sits beside the error itself, so
    "help users recover from errors" is evidenced by the artefact rather than
    the explanation. The legend is also shown on the login screen when the
    notes toggle is left on, so tags there are never unexplained.
16. **Only alert 1004 is seeded as blocked.** The other three seeded outcomes
    are false positives, because a low risk score with reassuring reasons
    cannot coherently justify a block. Alert 1009 was originally seeded as
    blocked and was changed, since its reasons read "amount is normal for this
    account".
17. **Toasts sit bottom left, not bottom right.** The queue's Status column is
    the rightmost column and the case screen's action buttons sit in the
    right-hand column, so a bottom-right stack covered the exact things an
    analyst needs to read after acting. The Undo button keeps the visible text
    "Undo" and adds an `aria-label` naming the alert, because several toasts
    can be on screen at once.
18. **The activity log is in memory only.** It is seeded with fixed times so it
    looks the same on every load, and new entries use the real clock. Nothing is
    written to storage, so the whole trail — including every seeded entry —
    resets when the page reloads. There is no server to keep it.
19. **Seed usernames are fixed strings.** `analyst1` escalates 1002 and
    `supervisor1` decides the four resolved alerts. They are not accounts; any
    non-empty username signs you in and actions are logged under whatever you
    typed.
20. **Both roles see the Escalated filter**, but only a Supervisor sees the
    "waiting for you" line, since only they have anything waiting on them.
21. **An escalated alert stays locked for Analysts** until a Supervisor decides
    it or the 8 second Undo is used. That is deliberate dual control, but it
    does mean a single-role walkthrough can strand an escalated alert.
22. **Supervisor Approve is instant.** The roles section says a Supervisor can
    "use the same confirm flow", but Approve deliberately keeps no dialog at
    all, for both roles. Only Block and Escalate have the dialog and the
    required reason.