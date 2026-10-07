# VillKro landing SEO release

Prepared 7 October 2026. Publication must use GitHub and the existing CI/CD workflow, as requested by the owner. The earlier manual package/container procedure is superseded; do not upload the local archive or deploy manually.

## Reviewable scope

Publish the static website: homepage metadata and accurate availability/payment copy, crawlable `/app/`, `/get/` helper, QR destination, structured data, robots.txt and a two-URL sitemap. Native app, API, admin, database and proxy behavior are unchanged.

Branch: `codex/villkro-google-search`.
Commit: `7beed5a8a7310319b9646867bd36891bd4fe4d06` (`feat: prepare VillKro website for Google search`).
Pull request: https://github.com/ServeLoco/ProjectServeLoco/pull/13

Seven files are included. Landing CI builds the actual nginx Docker image and validates public pages, crawler metadata, sitemap, store links, assets and missing-page 404. Local static checks and earlier app-page desktop/mobile and homepage JavaScript-disabled checks passed. GitHub Landing CI and Infra CI were queued when this record was written; their final results must be checked before merge.

## Deployment sequence

1. Confirm pull-request CI results and review the seven-file diff.
2. Obtain the owner's specific approval for merge/deployment timing. The existing main-branch workflow rebuilds all server images and stops the live API to run migrations, even though this PR changes only the website and Landing CI. Earlier SSH authorization was read-only, and the owner prefers nighttime if the app could go down.
3. Merge through GitHub only after approval; observe the existing deployment workflow. Do not bypass its database backup, migration or health checks.
4. Verify the deployed website and API health with read-only requests. Do not claim success solely from a workflow starting.
5. Verify public DNS delegation and ordinary HTTPS serve VillKro. At the earlier 15:05 UTC check, GoDaddy showed the correct Cloudflare nameservers but public DNS still showed GoDaddy parking addresses; propagation is not yet confirmed.
6. Once the new public pages are live, submit `https://villkro.in/sitemap.xml` in the verified Search Console domain property and inspect `/` and `/app/`. Request indexing where available. Google controls indexing and ranking.

Production has not been changed by this SEO publication work. Unrelated edits in the primary checkout were preserved; the SEO commit was prepared in a separate managed worktree.

## Verified production result

PR #13 was merged by the owner as `261f79f052122d63d38aaf958a0dddab62e482eb`. Deployment run https://github.com/ServeLoco/ProjectServeLoco/actions/runs/37644679932 and all its jobs completed successfully. Ordinary curl HTTPS checks returned 200 for homepage, app page, robots and sitemap; downloaded content has correct canonical URLs, one H1 per page, store link, indexable metadata and the expected two sitemap URLs. API `/health` returned status ok and both MySQL and MongoDB ok. Public DNS now resolves to Cloudflare nameservers/addresses. Python urllib was rejected with 403, while curl succeeded; browser/crawler visibility may need further checking. Search Console sitemap submission remains the next step.

## Search Console sitemap result

Submitted `https://villkro.in/sitemap.xml` in the verified `sc-domain:villkro.in` property on 7 October 2026. Google initially showed a transient fetch message, then the sitemap detail report confirmed “Sitemap processed successfully”, last read 10/7/26, 2 discovered pages and 0 videos. Proof: `/tmp/villkro-google-sitemap-success.png`. Submission and processing are verified; indexing and ranking are not yet confirmed.

## Indexing requests and next steps

On 7 October 2026, Search Console accepted indexing requests for both `https://villkro.in/` and `https://villkro.in/app/`, showing “Indexing requested” and priority crawl queue confirmation. This is not proof of completed indexing. Homepage index data still reflects a September 21 crawl pointing to the old serveloco.app canonical; the new live request was accepted. App page was discovered through the sitemap and had not yet been crawled. Proof screenshots: `/tmp/villkro-home-indexing-request.png` and `/tmp/villkro-app-indexing-request.png`.

Owner says VillKro is online-only, with no physical customer location, and is a registered private limited company. Business Profile creation is pending clarification of direct customer delivery, actual service areas and public phone. Company registration alone does not determine Google eligibility. Do not invent a storefront or address. Official guidance reviewed: https://support.google.com/business/answer/13763036 and https://support.google.com/business/answer/3038177 .

Read-only redirect audit: serveloco.app and www.villkro.in currently return 200 rather than redirecting; www.serveloco.app did not resolve. Current Docker proxy uses serveloco.app/www.serveloco.app as the default landing vhost; API, admin and OTA have separate explicit vhosts. Prepare any future redirect with explicit website host matching and preserve API/admin/OTA. Server mutations still require owner approval and GitHub CI/CD publication.

Owner clarified that VillKro serves Hisar, Haryana and nearby cities/villages, using its own riders to collect orders from the respective shops and deliver to customers. There is no physical customer-facing location. A service-area Business Profile appears appropriate pending Google verification and accurate service-area/contact details. Setup flow opened; public phone, delivery hours and specific village names are pending owner input.

Business Profile setup uses the owner-entered name `VillKro Pvt Ltd`, service business type, and primary category `Delivery service` (Google offers it). Grocery delivery was replaced after the owner clarified sweets, fast food and everyday goods are also delivered. Service-area selection and public contact details remain in progress; no final profile creation/terms acceptance is confirmed.

## Business Profile setup progress

Owner provided public support/WhatsApp number 8295445939; WhatsApp link `https://wa.me/918295445939` was entered. Owner accepted Business Profile terms. Profile setup saved direct delivery plus custom grocery, fast food, sweets and everyday essentials services. Hours were set to 9 AM–11 PM on all seven days based on owner stating 9 to 11 daily (assumption of evening closing explicitly stated). Description explains rider pickup from local shops and delivery near Hisar, Haryana; availability is qualified. Storefront/business photo steps were skipped, and no Workspace trial was started. Setup reached Google verification for profile identifier 3885477454714701892. Google asks for a real postal address and explicitly says it will be hidden from the public; owner must provide it. No address was invented or entered by the agent. Verification is pending. Current Chrome tab 1618029230 is marked for handoff at this step. Proof `/tmp/villkro-private-address-verification.png`; hours proof `/tmp/villkro-hours-9am-11pm.png`.

## Public website redirects prepared

PR https://github.com/ServeLoco/ProjectServeLoco/pull/14, branch `codex/villkro-website-redirects`, commit `ec2dfef80eb0a59ad508af552cdd67bfffd4fe49` (`fix: redirect public website aliases to villkro.in`) is open and mergeable. Infra CI run https://github.com/ServeLoco/ProjectServeLoco/actions/runs/37649959077 passed, including actual Docker proxy + landing tests for one-hop 301 redirects from old apex/www and new www, path/query preservation, canonical pages, missing-page 404 and isolated API POST/admin/OTA routing. API/admin/OTA virtual hosts were unchanged. No production server writes occurred. Merge needs owner approval because the existing full-stack deployment stops the API for migrations.

Cloudflare DNS for serveloco.app lacked www. Restored the public website record `www` A `13.207.236.156`, Proxied, Auto TTL. Cloudflare lists the saved sixth record and resolver 1.1.1.1 returns Cloudflare edge addresses. The local system resolver still returned a cached negative response in curl, so worldwide propagation is not claimed. API public health still reports both databases ok. DNS proof `/tmp/villkro-old-www-dns-saved.png`. After merge/deploy, verify all website redirects over ordinary HTTPS, and old API/admin/OTA health, then continue local content improvements and Search Console migration checks. Google Business Profile video verification remains deferred at the owner’s request.

## Approved merge blocked by GitHub

Owner approved merging PR #14 and its existing production deployment. On 7 October 2026 around 17:00 UTC, GitHub CLI GraphQL, REST squash-merge and browser confirmation all failed. REST explicitly returned HTTP 500 with an empty response; browser showed “Unable to read response from the server. Please try again later.” Latest authoritative PR read remains OPEN, mergedAt null, mergeCommit null; Infra CI is SUCCESS. No deployment was started by these attempts. Live villkro.in still returns HTTPS 200, and api.serveloco.app/health reports MySQL and MongoDB ok. Screenshot /tmp/villkro-pr14-merge-error.png. Approval persists for retrying this exact checked PR head through GitHub when merging recovers; do not bypass the PR by pushing to main or write directly to the server.

## PR 14 deployed; stale proxy mount diagnosed

Owner merged PR #14 as c80006b3352bfba4d64035ebccbbeca5312792a1. Deploy run https://github.com/ServeLoco/ProjectServeLoco/actions/runs/37656047817 succeeded, including API/admin/customer checks, all three image builds and production deploy. Public read-only verification still found 200 instead of 301 on all three aliases; canonical pages, admin and API stayed available. API health reported both databases ok.

Read-only SSH confirmed server HEAD c80006b and the host file contained the new redirect servers, but nginx -T inside projectserveloco-proxy-1 still showed the old website server names. Docker mounts the config as a single file; Git replacement leaves the container holding the old inode. No direct server mutations were made.

Prepared https://github.com/ServeLoco/ProjectServeLoco/pull/15, branch codex/villkro-proxy-config-refresh, commit 4ff2bc77ab5e0dd5883784a908a85af318cd0100. Deployment compares actual mounted config with host content; on mismatch it validates a fresh mount in a one-off container, recreates only the proxy with --no-deps and confirms matching content before existing reload/health checks. Infra CI run 37656813493 succeeded in 14s, reproducing atomic inode replacement and verifying recreation and compatibility routes. YAML/shell/diff checks passed locally. Merge requires owner approval under the user's rule for additional production changes: existing full-stack deploy also briefly stops API; proxy recreation briefly interrupts connections. PR screenshot /tmp/villkro-proxy-refresh-pr15.png. Redirect migration remains incomplete until PR15 deploy and live 301 checks.

## PR 15 deployed and redirects verified

Owner approved PR15 deployment. Squash merged as 3138a92d3514f64fd7ccacfa942a3d5a6391d5e2 on 7 October 2026 at 17:16:35 UTC. Deploy run https://github.com/ServeLoco/ProjectServeLoco/actions/runs/37657811718 completed successfully in 2m49s; deploy job took 34s (this is not measured downtime).

Ordinary HTTPS checks confirmed all nine cases: serveloco.app, www.serveloco.app and www.villkro.in each return 301 directly to https://villkro.in for /, /app/?utm_source=migration and /get/?source=qr&next=app with exact path/query preservation. Canonical homepage, /app/, robots and sitemap return 200; admin returns 200. Public API /health reports status ok and both MySQL and MongoDB ok. The stale proxy configuration issue is resolved through CI/CD; no manual server writes occurred. Screenshot /tmp/villkro-pr15-deploy-success.png.

Remaining SEO work: old-domain Search Console migration/Change of Address eligibility and property ownership; accurate local website content using confirmed Hisar-area services and public support contact; app store website metadata where needed; Business Profile video verification deferred by owner. Sitemap processing and indexing request acceptance were previously verified, but completed indexing/rankings are not claimed.

## Search Console migration submitted — 2026-10-07

- Verified `sc-domain:serveloco.app` in the existing Google account using an additive Cloudflare TXT verification record; keep this record.
- Google Change of Address validation passed for `serveloco.app` → `villkro.in`; confirmed move. UI shows “This site is currently moving”, started October 7, 2026.
- Added `https://www.serveloco.app/`, automatically verified through existing domain ownership. Separate Change of Address validation passed and move confirmed to `villkro.in`.
- Evidence: `/tmp/villkro-google-domain-move.png`, `/tmp/villkro-google-www-move.png`.
- No server commands, deployments, API changes, or app releases were performed for this step.
- Google processing/indexing and ranking remain pending; submission is not a ranking guarantee.
- Next: website content describing actual delivery near Hisar, grocery/sweets/fast food/everyday essentials, daily 9 AM–11 PM hours and public WhatsApp contact. Specific village coverage needs user confirmation before publishing named coverage claims.

## Nighttime service migration — 2026-10-07

User explicitly approved moving API/admin/OTA to VillKro while keeping legacy addresses working.

- Cloudflare: added proxied A records `api`, `admin`, `ota` under villkro.in pointing to 13.207.236.156; observed saved records. Evidence `/tmp/villkro-service-dns.png`.
- PR #16 merged as `1aed27afc858f4e21f7a7dc72eced3adbbd69ff4`; deployment 37664605892 succeeded.
- New nginx service aliases serve the original upstreams without cross-domain redirects. Admin build uses https://api.villkro.in/api. Landing policy links use the new API domain. Compose preserves existing CORS origins and allows https://admin.villkro.in; PUBLIC_BASE_URL now points to the new API.
- Live checks passed for both domain families: API health/MySQL/MongoDB, both admin origins, Socket.IO polling handshake, policy pages, admin HTML, OTA dashboard and manifest. Canonical landing pages expose new policy links.
- Signed OTA manifests still referenced the old asset domain, so PR #18 sets OTA BASE_URL=https://ota.villkro.in. Merged `bb0ad4a03e5ade31d852961a85a6de5df4275d52`; deployment 37665394469 running at this entry. Recheck signed manifests and asset downloads after success.
- PR #17 is prepared and checks passed: app API/policy URLs, Expo and Android native update URL, build env, and native-config detection in store workflows. Native store builds are needed for embedded update URL changes; user approval question pending. Do not report complete app migration before this release is approved and submitted.
- No direct SSH mutations performed. All server changes went through GitHub deployment.

### Final service migration verification

- PR #18 deployment 37665394469 succeeded on attempt 2. Attempt 1 completed migration output but the CI process did not exit; canceled and reran all gates without code changes or bypasses. Fresh attempt passed both migration passes, database tests and deployment.
- Rechecked all new and legacy services after final deployment: API/database health, both browser origins, Socket.IO handshake, policy pages, admin, OTA dashboard/manifest and landing links all passed.
- Verified signed manifests on ota.villkro.in and ota.serveloco.app against the app's existing public signing certificate. Both valid; all manifest asset URLs now point to ota.villkro.in. Downloaded launch bundle successfully (HTTP 200).
- Final proof `/tmp/villkro-final-service-deploy.png`; public verification scripts `/tmp/check-villkro-services.py` and `/tmp/check-villkro-ota-signature.py`.
- Server migration completed. PR #17 remains open, checks passed, pending user approval for native store builds/submissions; no new store release or OTA published this turn.

### User-requested complete migration checks

Read-only testing after final deployment passed:
- New and legacy API health (MySQL/MongoDB), ping, policy pages, admin HTML and OTA endpoints.
- Both allowed admin origins, POST preflight, denied foreign Origin, Socket.IO polling handshake.
- Nine website redirect combinations with exact paths and query strings; canonical home/app headings, sitemap/robots, helper noindex, missing URL 404.
- Actual deployed admin JavaScript contains https://api.villkro.in/api on both admin hosts. Browser visibly renders new admin login page; screenshot `/tmp/villkro-admin-migration-tested.png`.
- Signed Android AND iOS OTA manifests on BOTH hosts validate against installed public certificate; new asset host and launch bundle downloads return HTTP 200.
- Read-only SSH confirms deployed commit bb0ad4a, API/admin/landing healthy, proxy/OTA running, nginx syntax valid.
- Deployment CI API/database tests, admin checks and customer-app tests passed. PR #17 CI remains passing but is not deployed.

Limits: no production orders/payments were created, no admin credentials entered, no actual handset installation/restart/login tested. New native app release still awaits approval in PR #17.

## App migration release approved and merged

User explicitly requested merging PR #17. Passing PR merged as f33fe40371576c2e9c5116d1819d6cfb6456bdb2.
- Play Store workflow: 37667802343.
- App Store workflow: 37667802520.
- Deployment workflow: 37667802282.
- Customer App CI: 37667802537; Infra CI: 37667802271.
Release workflows started; store submission/approval and installed user rollout not yet confirmed at this entry.

### PR #17 post-merge status

Deployment 37667802282 succeeded; public new/legacy service checks passed after deploy.
Play Store 37667802343 passed lint/tests and native release detection; running “Build Android .aab on EAS cloud”. App Store 37667802520 passed lint/tests and native release detection; native build-submit job started, installing EAS CLI at last observation. Native build completion and store submissions remain pending, not reported as complete.
