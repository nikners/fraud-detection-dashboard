/* =========================================================================
   FlagWise - synthetic sample data
   -------------------------------------------------------------------------
   LOW-FIDELITY WIREFRAME PROTOTYPE. University HCI assignment.

   These are made-up records in the style of the PaySim dataset. They are not
   real people, accounts or transactions. Nothing here is sent anywhere and
   there is no backend, no authentication and no machine learning involved.

   Risk scores are HARDCODED constants. The prototype never computes risk.

   Record shape
   ------------
   id             string   alert identifier, e.g. "1001"
   type           string   TRANSFER | CASH_OUT | PAYMENT
   amount         number   amount moved, in currency units
   oldbalanceOrg  number   sender balance BEFORE the transaction
   newbalanceOrig number   sender balance AFTER the transaction
   oldbalanceDest number   recipient balance BEFORE the transaction
   newbalanceDest number   recipient balance AFTER the transaction
   riskScore      number   0-100, hardcoded
   reasons        array    plain-language strings, shown as-is to the analyst
   status         string   New | In review | Resolved
   outcome        string   null | "blocked" | "false_positive"
   escalated      boolean  true once the alert has been passed to a Supervisor
   log            array    audit trail, oldest entry first

   Log entry shape
   --------------
   time           string   clock time as HH:MM
   who            string   username, or "scoring system" for a seeded alert
   role           string   Analyst | Supervisor | system
   action         string   what happened, e.g. "Blocked"
   reason         string   chosen from the confirmation dialog, or null
   note           string   free text typed alongside the reason, or null

   Seeded entries use fixed times so the trail looks plausible and stays the
   same on every reload. Entries added by clicking Approve, Block or Escalate
   use the real clock and the signed-in username. The whole trail lives in
   memory only and resets when the page reloads.

   Note on recipient balances
   --------------------------
   Only TRANSFER moves money to a real recipient account, so only TRANSFER
   records carry meaningful recipient balances. CASH_OUT (an ATM withdrawal)
   and PAYMENT (a shop or merchant) have no recipient person, so those
   balances are recorded as 0.00 -> 0.00.

   Note on status vs outcome
   -------------------------
   `status` is the only one of the two that may be filtered in the queue; it
   has exactly three allowed values. `outcome` records *why* something was
   resolved, and only matters once an alert is Resolved. Records 1004, 1007,
   1008 and 1009 are seeded as already-resolved so that the Reports screen
   shows real, non-zero numbers on first load instead of an empty report.

   `outcome` should always agree with `riskScore` and `reasons`: a low risk
   alert with reassuring reasons is approved as a false positive, not blocked.
   1004 is the only seeded block, because it is one of the four high risk
   drains-the-whole-balance transfers.
   ========================================================================= */

const ALERT_DATA = [
  {
    id: '1001',
    type: 'TRANSFER',
    amount: 980.0,
    oldbalanceOrg: 980.0,
    newbalanceOrig: 0.0,
    oldbalanceDest: 0.0,
    newbalanceDest: 980.0,
    riskScore: 93,
    reasons: [
      'Entire account balance sent in one transfer',
      'Recipient account had no prior balance',
      'This sender has not sent money to this recipient before'
    ],
    status: 'New',
    outcome: null,
    escalated: false,
    log: [
      { time: '09:14', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null }
    ]
  },
  {
    id: '1002',
    type: 'CASH_OUT',
    amount: 250.5,
    oldbalanceOrg: 250.5,
    newbalanceOrig: 0.0,
    oldbalanceDest: 0.0,
    newbalanceDest: 0.0,
    riskScore: 88,
    reasons: [
      'Entire account balance taken out in one cash withdrawal',
      'Only a few transactions have happened on this account so far',
      'Cash withdrawals are unusual on this account'
    ],
    status: 'In review',
    outcome: null,
    /* Seeded escalated so a Supervisor has something waiting for them the
       first time they sign in. Status stays In review, so none of the Reports
       figures move. */
    escalated: true,
    log: [
      { time: '09:31', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null },
      { time: '09:52', who: 'analyst1', role: 'Analyst',
        action: 'Escalated', reason: 'Needs a second opinion', note: null }
    ]
  },
  {
    id: '1003',
    type: 'TRANSFER',
    amount: 1540.2,
    oldbalanceOrg: 1540.2,
    newbalanceOrig: 0.0,
    oldbalanceDest: 0.0,
    newbalanceDest: 1540.2,
    riskScore: 84,
    reasons: [
      'Entire account balance sent in one transfer',
      'Recipient account had no prior balance',
      'Amount is much larger than this account normally sends'
    ],
    status: 'New',
    outcome: null,
    escalated: false,
    log: [
      { time: '09:47', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null }
    ]
  },
  {
    id: '1004',
    type: 'TRANSFER',
    amount: 420.75,
    oldbalanceOrg: 420.75,
    newbalanceOrig: 0.0,
    oldbalanceDest: 0.0,
    newbalanceDest: 420.75,
    riskScore: 81,
    reasons: [
      'Entire account balance sent in one transfer',
      'Recipient account had no prior balance'
    ],
    status: 'Resolved',
    outcome: 'blocked',
    escalated: false,
    log: [
      { time: '08:58', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null },
      { time: '10:05', who: 'supervisor1', role: 'Supervisor',
        action: 'Blocked', reason: 'Confirmed fraud', note: null }
    ]
  },
  {
    id: '1005',
    type: 'TRANSFER',
    amount: 320.0,
    oldbalanceOrg: 1200.0,
    newbalanceOrig: 880.0,
    oldbalanceDest: 15.4,
    newbalanceDest: 335.4,
    riskScore: 68,
    reasons: [
      'Amount much larger than usual for this account',
      'This sender rarely sends money to this recipient'
    ],
    status: 'New',
    outcome: null,
    escalated: false,
    log: [
      { time: '10:12', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null }
    ]
  },
  {
    id: '1006',
    type: 'CASH_OUT',
    amount: 610.1,
    oldbalanceOrg: 1500.0,
    newbalanceOrig: 889.9,
    oldbalanceDest: 0.0,
    newbalanceDest: 0.0,
    riskScore: 57,
    reasons: [
      'Amount much larger than usual for this account',
      'Large cash withdrawal, which is uncommon on this account'
    ],
    status: 'In review',
    outcome: null,
    escalated: false,
    log: [
      { time: '10:20', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null }
    ]
  },
  {
    id: '1007',
    type: 'PAYMENT',
    amount: 89.99,
    oldbalanceOrg: 640.25,
    newbalanceOrig: 550.26,
    oldbalanceDest: 0.0,
    newbalanceDest: 0.0,
    riskScore: 46,
    reasons: [
      'New recipient for this sender',
      'Amount is a little larger than this account normally pays'
    ],
    status: 'Resolved',
    outcome: 'false_positive',
    escalated: false,
    log: [
      { time: '09:05', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null },
      { time: '11:02', who: 'supervisor1', role: 'Supervisor',
        action: 'Approved as false positive', reason: null, note: null }
    ]
  },
  {
    id: '1008',
    type: 'PAYMENT',
    amount: 45.2,
    oldbalanceOrg: 300.15,
    newbalanceOrig: 254.95,
    oldbalanceDest: 0.0,
    newbalanceDest: 0.0,
    riskScore: 33,
    reasons: [
      'Amount is within this account\u2019s usual range'
    ],
    status: 'Resolved',
    outcome: 'false_positive',
    escalated: false,
    log: [
      { time: '09:38', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null },
      { time: '11:04', who: 'supervisor1', role: 'Supervisor',
        action: 'Approved as false positive', reason: null, note: null }
    ]
  },
  {
    id: '1009',
    type: 'TRANSFER',
    amount: 120.0,
    oldbalanceOrg: 900.0,
    newbalanceOrig: 780.0,
    oldbalanceDest: 500.0,
    newbalanceDest: 620.0,
    riskScore: 22,
    reasons: [
      'Amount is normal for this account',
      'Both accounts have a regular payment history'
    ],
    status: 'Resolved',
    /* Was "blocked", which contradicted the low risk score and the reasons
       above. Nothing about this transfer is suspicious, so the analyst
       approved it as a false positive. */
    outcome: 'false_positive',
    escalated: false,
    log: [
      { time: '08:41', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null },
      { time: '11:06', who: 'supervisor1', role: 'Supervisor',
        action: 'Approved as false positive', reason: null, note: null }
    ]
  },
  {
    id: '1010',
    type: 'CASH_OUT',
    amount: 60.0,
    oldbalanceOrg: 250.0,
    newbalanceOrig: 190.0,
    oldbalanceDest: 0.0,
    newbalanceDest: 0.0,
    riskScore: 12,
    reasons: [
      'Small amount compared with what this account usually withdraws'
    ],
    status: 'New',
    outcome: null,
    escalated: false,
    log: [
      { time: '10:33', who: 'scoring system', role: 'system',
        action: 'Alert raised by scoring system', reason: null, note: null }
    ]
  }
];

/* Read-only reference lists, used to build the filter dropdowns and to keep
   the queue and case screens talking about the same vocabulary. */
const STATUS_VALUES = ['New', 'In review', 'Resolved'];
const TYPE_VALUES = ['TRANSFER', 'CASH_OUT', 'PAYMENT'];
const ROLES = ['Analyst', 'Supervisor'];

/* Reasons offered in the confirmation dialog. Blocking and escalating are
   different decisions, so they get different lists. "Other" is the last
   option on both; the free-text note is where the detail goes. */
const BLOCK_REASONS = [
  'Confirmed fraud',
  'Suspected fraud, customer unreachable',
  'Account takeover suspected',
  'Other'
];

const ESCALATE_REASONS = [
  'Needs a second opinion',
  'Amount above my approval limit',
  'Unsure about the pattern',
  'Other'
];

/* Longest note the dialog accepts. The counter in the dialog uses this too. */
const NOTE_MAX = 140;