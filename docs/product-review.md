# Product Review: Custom Reporting

**Reviewed document:** *Custom Reporting — Product Requirements Document* (as provided).
**Reviewer role:** Product Analyst, reviewing the spec the way it would be reviewed after
development — before the team signs off on shipping it.

This document has three parts: **(A)** a prioritized gap review of the spec itself, **(B)** a
test plan for what needs to be verified before shipping, and **(C)** what a dashboard should
show once the feature is live. Part B is deliberately built on top of Part A — several test
cases exist specifically to validate whichever decision gets made on an open gap.

---

## Part A — Product Review

The spec is clear and well-motivated at the product-narrative level (the problem statement
and the two report types are easy to follow). Where it's thin is in the operational details —
what happens at the edges of "normal" usage, and a handful of security/compliance questions
that matter a lot for a company whose entire product is security posture data.

Below are the **5 gaps that matter most**, each tagged with which review lens it falls under.
A further 5 gaps worth a shorter mention follow. (I did not include implementation-level
nitpicks that don't change a ship/no-ship decision.)

### 1. Report content isn't scoped per-viewer — only per-creator

**Category:** Missing/ambiguous requirement · Security dependency

**What's unclear:** A report can be shared "Organization level" or delivered by email to
multiple recipients. The spec never says whether the data *inside* the generated file
reflects the **creator's** access at generation time, or is somehow re-filtered per person
who later views it. Given both output formats are static files (a rendered PDF, a CSV
export) generated **once**, live per-viewer filtering isn't really possible with this
architecture — but that implication is never stated, so it's easy to read the spec as if
RBAC "just handles it."

**Why it matters:** If report content is baked in at the creator's permission level and then
shared org-wide or emailed out, a report creator with broad access (e.g., an admin) could
unintentionally expose data — full vulnerability details across every cloud account, say —
to a recipient whose own role would never grant them that visibility directly. For a security
product, an RBAC-labeled feature that quietly bypasses RBAC once the "Organization level"
toggle is flipped is the kind of gap that shows up in a customer's own security review of
*us*.

**What's needed to close it:** A confirmed product decision — most likely "content is fixed
at the creator's access at generation time" — plus: (1) explicit warning copy in the creation
flow when a report is set to organization-level visibility or scheduled to a wide recipient
list, and (2) a decision on whether creating an org-visible report touching sensitive modules
needs its own permission, separate from general report-creation RBAC.

### 2. No stated policy on external (non-platform) email recipients

**Category:** Missing/ambiguous requirement · Security dependency

**What's unclear:** The workflow mockup (Appendix 6) shows recipients entered as plain email
addresses. Nothing in the spec restricts these to existing Upwind users in the customer's
org — it's unclear whether any address, including one entirely outside the organization, can
be added as a scheduled recipient.

**Why it matters:** Combined with gap #1 (reports reflect the creator's full access), an
unrestricted recipient field is a straightforward, recurring data-exfiltration path: any user
who can create a report and a workflow can route a full security-posture export to any
inbox, on a schedule, indefinitely. This is exactly the class of gap that needs to be closed
*before* release, not discovered after a customer asks about it during their own vendor
security review.

**What's needed to close it:** A decision from security/compliance on whether external
recipients are supported at all for v1; if they are, whether that requires an elevated
permission and produces a distinct, reviewable audit trail (see gap #5 below).

### 3. Large-file download links: authentication, expiry, and reuse are undefined

**Category:** Missing/ambiguous requirement · Technical feasibility

**What's unclear:** The FAQ states that oversized reports are delivered as "a link that,
upon authentication, downloads the report directly." Authenticate *as whom*? If an external
recipient (gap #2) has no Upwind account, can they open the link at all — does large-file
delivery simply not work for them? Does the link expire, and if so when? Is it single-use, or
can it be forwarded and reused by anyone who has it?

**Why it matters:** These are, by definition, the *largest* reports — which in practice means
the ones with the most data in them. A non-expiring, forwardable, authenticated-but-not-
recipient-bound link is a much bigger exposure than the file it replaces.

**What's needed to close it:** Define the link as a signed, time-limited (e.g., 24–72h),
ideally single-use token tied to the intended recipient; require re-authentication as that
specific recipient, not just "any logged-in Upwind user"; log each successful download
(who, when) — this data is also needed for Part C's reliability metrics.

### 4. No defined behavior when a report exceeds size/row limits

**Category:** Edge case · UX/communication gap

**What's unclear:** A Figma note says "CSV format supports up to 500K records," and Summary
Reports separately have to fit a "destination's size limits" for delivery. Neither the spec
text nor the mockups say what happens when a report's actual result set **exceeds** these —
hard error and no file, silent truncation with no indication, or a partial file with a
visible warning.

**Why it matters:** These reports are explicitly positioned as compliance **evidence** and as
data practitioners "work from... immediately." A CSV silently missing a third of its rows, or
a compliance PDF quietly cut short, is invisible to the person relying on it — until it causes
a missed vulnerability or a failed audit.

**What's needed to close it:** A product decision that the result is never *silently*
incomplete — e.g., a visible marker on the file itself ("results truncated at 500,000 records
— N omitted; narrow your filters to see all data") — plus, ideally, a warning in the creation
flow *before* generation if the selected scope is likely to exceed the cap (this needs
engineering input on whether an approximate count is feasible to compute up front).

### 5. No failure handling for scheduled generation

**Category:** Edge case · Dependency (needs engineering input)

**What's unclear:** The spec describes the schedule trigger and the "generate → email" action,
but says nothing about what happens when generation itself fails (a timed-out data source, a
deleted dependency, a malformed filter). Is there a retry? Does anyone get told the report
didn't go out?

**Why it matters:** This feature exists specifically for recurring, hands-off delivery to
people who don't log into the product (a CISO, an auditor). If a run fails silently, the
recipient simply doesn't get a report that cycle, with no way to distinguish "nothing to
report" from "it broke" — until someone eventually asks where it is. That's a trust problem
for exactly the audience this feature was built to serve.

**What's needed to close it:** A defined retry policy, a failure notification to the report
owner/org admins, and a visible "last run: failed" state on the Reports page. This directly
feeds Part C's alerting section below.

### Also considered

- **"Sync board changes" edge cases** *(Edge case)* — undefined behavior when the source
  board is deleted, a widget it depends on is removed, or a Predefined Dashboard the platform
  itself later updates.
- **Naming inconsistency** *(UX/communication)* — the spec text says "Summary Report," the
  Figma mockups say "Executive Report (PDF)." The spec itself flags this as unresolved
  terminology — worth closing before it reaches customer-facing copy or docs.
- **Audit log doesn't cover generation/delivery** *(Missing requirement)* — logging covers
  create/update/delete on the report object, not "who received what data, when," which is
  exactly the record needed to investigate gaps #1–#3 if something goes wrong.
- **Empty-scope reports** *(Edge case / UX)* — if a scope filter matches zero findings, is an
  empty file still generated and delivered, and does it clearly communicate "0 results" rather
  than looking like a broken or blank export?
- **Scheduling concurrency** *(Technical feasibility)* — many customers' schedules will likely
  cluster at common times (daily @ 06:00 UTC, Monday mornings); the spec doesn't address
  generation-pipeline capacity planning for that load pattern.

---

## Part B — Test Plan

Priorities: **Critical** = blocks release if broken; **High** = should be fixed before
release but a narrow workaround might exist; **Medium** = should be tracked, not necessarily
blocking; **Low** = nice to verify, not release-blocking.

Several rows below are marked **[gap]** — these validate a decision from Part A once it's
made, rather than an already-specified behavior. They're included now so the test plan is
ready the moment those decisions land, rather than being written from scratch later.

### B.1 — Report creation (core flow)

| ID | Description | Expected result | Priority |
|---|---|---|---|
| TC-01 | Create a Summary Report from a Predefined Dashboard | Report saves; appears on Reports page with correct type/module | Critical |
| TC-02 | Create a Summary Report from a Custom Dashboard, sync **off** | Later edits to the source dashboard do **not** change future generations | Critical |
| TC-03 | Create a Summary Report from a Custom Dashboard, sync **on** | Editing the source dashboard (add/remove a widget) changes the **next** generation to match | High |
| TC-04 | Create an Operational Data report for a module with specific columns selected and reordered | Generated CSV has exactly those columns, in that order | Critical |
| TC-05 | Try to save/generate with required fields missing (no name, no report type) | Blocked with a clear inline validation message, no partial save | High |
| TC-06 | Select an existing saved View as the report's scope | Report data matches what that View shows live at generation time | Medium |
| TC-07 | Create a report with "Only for me" visibility | Other users in the org cannot see or list it | Critical (security) |
| TC-08 | Create a report with "Organization level" visibility | Other org users with report-viewing permission can see and download it | Critical |

### B.2 — "Save as Custom Report" entry points

| ID | Description | Expected result | Priority |
|---|---|---|---|
| TC-09 | From a findings list view, apply filters, click "Save as custom report" | Creation flow opens pre-populated with the active module/filters; only name/description/visibility remain to fill in | High |
| TC-10 | From a board view, "Save as custom report" | Pre-populates the board selection and current scope | High |
| TC-11 | Spot-check the entry point exists on every module's list/board view per the "all existing export locations" requirement | Present and functional everywhere it's specified | Medium |

### B.3 — On-demand generation & download

| ID | Description | Expected result | Priority |
|---|---|---|---|
| TC-12 | Generate & download a Summary Report immediately | PDF downloads with correct dashboard content, trend data, and the configured relative time range applied | Critical |
| TC-13 | Generate & download an Operational Data report immediately | CSV downloads; row count matches the live findings count for that scope | Critical |
| TC-14 **[gap]** | Generate a report whose scope matches zero findings | Per Part A: file is generated and clearly communicates "0 results," not a blank/broken-looking export | High |
| TC-15 **[gap]** | Generate an Operational Data report whose result set exceeds 500,000 rows | Per Part A: a visible truncation indicator is present — no silent data loss | Critical (data integrity) |

### B.4 — Reports page

| ID | Description | Expected result | Priority |
|---|---|---|---|
| TC-16 | Search/filter the Reports page by name, module, creation date, creator (individually and combined) | Results match the filter criteria correctly | Medium |
| TC-17 | View a report's row for schedule status | Reports with an active workflow show it; reports without show a "create schedule" shortcut | Medium |
| TC-18 | Download a report directly from the Reports page | Produces a correct, current file | High |
| TC-19 | Edit an existing report's scope, then regenerate | Change is saved and reflected in the next generation | High |
| TC-20 **[gap]** | Delete a report that has an active schedule | Per a to-be-made decision: either blocked with a warning, or deletes both the report and its schedule with explicit confirmation | High (destructive-action safety) |

### B.5 — Scheduled delivery (Workflows)

| ID | Description | Expected result | Priority |
|---|---|---|---|
| TC-21 | Create a Daily/Weekly/Monthly/Quarterly workflow that generates and emails a saved report | Report is generated and emailed at the configured time | Critical |
| TC-22 | Scheduled report under the destination's size limit | Delivered as a direct email attachment | High |
| TC-23 | Scheduled report over the destination's size limit | A download link is sent instead; link requires authentication before it succeeds | Critical |
| TC-24 **[gap]** | Configure a workflow recipient with an external (non-platform) email address | Per Part A: blocked by default, or allowed only with elevated permission and a distinct audit entry | Critical (security) |
| TC-25 **[gap]** | Simulate a scheduled generation failure (e.g., a broken data source) | Per Part A: retry occurs and/or the report owner is notified of the failure | Critical |
| TC-26 | Disable a workflow | No further scheduled emails are sent; Reports page reflects the disabled/unscheduled state | Medium |

### B.6 — RBAC & audit

| ID | Description | Expected result | Priority |
|---|---|---|---|
| TC-27 | A user without report-creation permission attempts to create a report (UI and API) | Blocked at both layers with a clear permission error | Critical (security) |
| TC-28 **[gap]** | A user without access to a specific module creates/generates a report for that module | Blocked, or scoped to only data they're permitted to see, per Part A gap #1's resolution | Critical |
| TC-29 | Create, edit, and delete a report object | Each action produces a correctly-attributed audit log entry (actor, timestamp, action, report ID) | High |
| TC-30 | Confirm whether report generation/delivery produce audit entries | Documented as a known gap (Part A) rather than pass/fail until addressed | Medium (documentation) |

### Out of scope for this round (and why)

- **Load/performance testing of many concurrent scheduled generations.** Needs a dedicated
  perf environment with realistic customer-scale data; tracked as a follow-up, not a blocker
  for functional sign-off (though the underlying feasibility question is flagged in Part A).
- **Pixel-level visual regression of PDF rendering** across every dashboard widget type. This
  round covers a functional smoke check (renders, with correct data); full visual QA is a
  follow-up once widget types stabilize.
- **Delivery channels beyond email** (Slack, ticketing integrations). The "What's Available at
  Release" list only commits to email — out of scope until they're actually in scope.
- **Third-party email deliverability** (spam filtering, bounce handling). Assumed covered by
  the platform's existing email infrastructure, not specific to this feature.
- **Cross-browser/cross-device UI testing** of the creation flow. Assumed covered by the
  platform's general UI test suite rather than re-tested per feature here.

---

## Part C — BI & Monitoring Definition

### Adoption / usage metrics

| Metric | What it measures | Why it matters | How it's calculated |
|---|---|---|---|
| Reports created (by type & module) | Volume of report objects created, split by Summary(PDF)/Operational(CSV) and by module | Shows which report type/module resonates; informs roadmap priority | Count of `report.created` events, grouped by type and module, per period |
| % of orgs with ≥1 report created | Breadth of adoption of a brand-new feature | Core "is this landing" signal | Distinct orgs with ≥1 report ÷ total active orgs |
| On-demand vs. scheduled mix | Whether reports are one-off exports or recurring automated delivery | The feature's value prop is *automated* delivery — a low scheduled share suggests the scheduling UX needs work, not just that the export itself is used | Reports with ≥1 enabled workflow ÷ total reports |
| "Save as Custom Report" entry-point usage | How often reports start from an existing view vs. the standalone flow | Validates the spec's own hypothesis that starting from a familiar view lowers the barrier to creating a report | Creation events tagged `source: save_as` ÷ all creation events |
| Reports per active org (median / p90) | Depth of usage, not just breadth | Distinguishes "tried it once" from power-user orgs; power-user patterns often predict expansion/renewal conversations | Reports ÷ active orgs, median and p90 |

### Quality / reliability metrics

| Metric | What it measures | Why it matters | How it's calculated |
|---|---|---|---|
| Generation success rate | % of generation attempts (on-demand + scheduled) that complete without error | Directly measures whether the core promise — "push a button, get a report" — holds | Successful generations ÷ total attempts, daily |
| Generation latency (p50 / p95) | Time from request to file ready | Slow generation erodes trust in "generate now"; a rising trend flags scaling issues early | end_time − start_time, percentiles by report type |
| Delivery success rate | % of scheduled deliveries that reach the recipient (attachment or link sent) | A generated-but-undelivered report is invisible to the customer — same trust cost as a failed generation | Successful sends ÷ total scheduled delivery attempts |
| Large-file link-fallback rate | % of scheduled deliveries falling back to a link instead of a direct attachment | A high rate signals the size threshold may be too low for real customer data — a product conversation, not just an ops one | Link-fallback deliveries ÷ total scheduled deliveries |
| Truncation rate | % of Operational Data generations hitting the 500K-row cap | Same rationale as above, for the CSV cap; also validates whether the truncation-indicator UX (Part A gap #4) is actually being exercised | Generations flagged `truncated: true` ÷ total CSV generations |
| Scheduled-run on-time rate | % of scheduled generations firing within an acceptable window of their configured time | Directly measures the reliability promise behind "automated delivery... at the right time" | Runs starting within (e.g.) 5 min of schedule ÷ total scheduled runs |

### Alerting: page vs. weekly review

**Page the on-call/eng team immediately when:**
- Generation success rate drops below ~95% over a rolling 30-minute window (or an absolute
  failure count for low-volume periods, e.g. ≥5 consecutive failures) — signals a systemic
  break, not one bad report.
- Delivery success rate drops below ~95% over a rolling window — customers are actively not
  receiving reports they expect.
- Scheduled-run backlog exceeds a threshold (e.g., >50 runs delayed >15 minutes past their
  trigger) — catches a queue/capacity problem before it snowballs.
- Generation latency p95 breaches an SLO (e.g., >2 min for Operational Data, >5 min for
  Summary PDFs) sustained over several minutes.

**Fine to review weekly (dashboard, not a page):**
- Adoption trends (reports created, % orgs onboarded, on-demand/scheduled mix) — roadmap
  input, not an incident.
- Truncation and link-fallback rate trends — informs a product decision on caps/thresholds,
  not an emergency.
- "Save as Custom Report" entry-point usage — UX/adoption insight.
- Reports-per-org distribution — account-health/business insight.

### Data that doesn't exist yet

- **Per-report generation events** — a log entry per attempt (report ID, trigger type,
  start/end time, success/failure + error reason, truncated flag, output size/row count).
  Today's audit log only covers report-object CRUD, not generation.
- **Delivery events** — per scheduled send: recipient(s), delivery method (attachment vs.
  link), size, success/failure, and (for link delivery) subsequent download events. Needed
  both for the reliability metrics above and to close Part A gaps #2/#3 — knowing who actually
  accessed a report.
- **Manual-download tracking on the Reports page** — currently only generation seems tracked;
  without download events, "reports per org" understates actual consumption.
- **A simple org-level "first report created at" flag** — would make the adoption-rate metric
  trivial to compute directly rather than re-derived from raw event streams every time.
