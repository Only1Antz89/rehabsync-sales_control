# RehabSync Internal Tools — Product Roadmap

Shared roadmap for the three internal tools that sit on the RehabSync platform DB:
**Sales Centre**, **Ads Centre**, and **Admin Centre**. Lives here (Sales repo) because the
first roadmap item starts in Sales, but it covers all three.

Priority key: **P0** = do before/at production hardening · **P1** = high business value ·
**P2** = depth / scale.

---

## North star: close the loop
The three apps share one Supabase Postgres but the money-path isn't wired end-to-end. The theme
that returns the most is **Sales → Admin → Ads**:

> A won deal **provisions a tenant** in Admin Centre → the tenant's campaigns and posts (Ads) stamp
> UTMs that **attribute back to revenue** in Sales. Prove ROI per campaign, and stop re-typing
> customers between systems.

---

## P0 — Reliability & operations (prevents production fires)
Applies to all three apps.

1. **Self-applying migrations.** Deploys run `pnpm db:deploy` by hand today, so a missed step 500s
   every data page (this is what caused the recent `/api/subscribers` 500). Auto-run pending SQL on
   deploy (build/release step or a one-time startup guard).
2. **Health banner instead of raw 500s.** `/api/health` already reports `{db, migrated}`; surface a
   "database needs migrating / unreachable" banner rather than letting pages hard-500.
3. **Error tracking + structured logging** (Sentry/Axiom) in all three apps — failures are currently
   invisible unless someone opens DevTools.
4. **CI per repo** — typecheck + lint + test on PR. Replace ad-hoc verification with a repo safety net.
5. **Webhook + public-endpoint hardening** — rate-limit `/subscribe` and the inbox/listening
   webhooks; move from a shared bearer to per-network signature verification for live gateways.
6. **Email deliverability** — SPF/DKIM/DMARC on the sending domain; auto-suppress on hard
   bounce/complaint (events are captured; wire them to suppression).

---

## Sales Centre
*Strong today: pipeline, deals, companies, contacts, tasks, sequences, campaigns, forms, custom
fields, reports, analytics.*

| Pri | Feature | Why |
|---|---|---|
| **P1** | **Won-deal → tenant provisioning** ⭐ | The funnel dead-ends at "won"; nothing creates the tenant. *(First build — see below.)* |
| P1 | Two-way email (inbound reply threading) | Today send-only; prospect replies never return to the contact. |
| P1 | Quotes / proposals + deal line-items | Deals are a single amount — no products, quote doc, or e-sign. |
| P1 | Bulk actions + duplicate detection/merge | No bulk stage/tag/email; no dedupe on contacts/companies. |
| P2 | Meeting booking + calendar sync | `meetingUrl` exists but no scheduler. |
| P2 | Lead routing (round-robin/territory) + lead scoring | Custom fields are the raw material for scoring. |
| P2 | Notifications & SLAs, quota/forecast | "Task due", "deal idle N days", quota attainment. |
| P2 | Call/SMS logging, domain enrichment, CSV export | |

## Ads Centre
*Strong today: composer + per-network variations, queue, media library, inbox, listening,
newsletters, subscribers, analytics, rich previews + editing.*

| Pri | Feature | Why |
|---|---|---|
| **P1** | **Live publishing + ingestion adapters** ⭐ | Newer networks are manual-export; inbox/listening webhooks are built but nothing feeds them yet. |
| P1 | AI in the composer | Extend the inbox AI-assist to post drafting, hashtags, best-time-to-post, alt-text. |
| P1 | Calendar drag-to-reschedule | Make the calendar a true scheduling board. |
| P2 | Content library & recycling, RSS auto-post, bulk upload | Buffer-style evergreen queue. |
| P2 | Collaboration: draft comments, assignment, client approval links | |
| P2 | Brand kit, UTM builder UI, link-in-bio/short-links | |
| P2 | Competitor / share-of-voice in listening; scheduled reports | |

## Admin Centre
*Already mature: tenants (entitlements/plans/invoices/trials/lifecycle/AI-credits), billing,
subscriptions, broadcasts, knowledgebase, support, onboarding, domains, data-retention, status.*

| Pri | Feature | Why |
|---|---|---|
| **P1** | **Secure "log in as tenant" impersonation (audited)** ⭐ | Highest-leverage support tool. |
| P1 | Self-serve billing depth: Stripe portal, **dunning** / failed-payment recovery, proration | Invoices exist; confirm the recovery loop. |
| P1 | GDPR DSAR tooling — per-subject export + right-to-erasure workflow | Clinical-adjacent UK product. |
| P2 | Tenant health score / churn-risk alerts | Lifecycle exists; add scoring + alerts. |
| P2 | Scoped admin roles + 4-eyes on destructive ops | Billing-only / support-only admins. |
| P2 | Admin notification centre; incident mgmt on status page; audit export to SIEM | |

## Cross-cutting (all three)
- In-app notifications (no proactive alerts anywhere).
- Saved views + CSV export (Sales has views; Ads/Admin don't; no export anywhere).
- Mobile responsiveness (desktop-first today).
- List pagination (capped at 200, no paging).

---

## Suggested sequence
1. **P0 reliability layer** (auto-migrate + health banner + error tracking) — kills the class of bug
   that's actively causing 500s.
2. **Won-deal → tenant** (Sales) — closes the funnel; most self-contained. **← building now.**
3. **Ads → Sales revenue attribution** — the other half of the loop.
4. **Admin impersonation + billing dunning.**
5. Then depth features per app by priority above.

---

## Build 1: Won-deal → tenant (in progress)
When a deal is marked **won**, staff can **provision a tenant** from the deal. Sales records a
provisioning request, calls the platform admin API (env-configured `REHABSYNC_API_URL`) to create
the tenant, then links the resulting `tenantId` back onto the contact and company. Unconfigured or
failed requests land in a **provisioning queue** an admin can complete/retry manually. Idempotent:
one provision per deal.
