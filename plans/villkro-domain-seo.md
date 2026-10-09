# VillKro domain migration and Google discovery plan

Prepared 7 October 2026. Initial audit was read-only; implementation progress is recorded below.

User confirmed the registrar is **GoDaddy**. Target delivery towns are still unconfirmed.

### Implementation progress (7 October 2026)

- User added `villkro.in` to Cloudflare, configured apex/www for the existing origin `13.207.236.156`, switched GoDaddy nameservers to `robert.ns.cloudflare.com` / `ulla.ns.cloudflare.com`, and removed GoDaddy's old forwarding rule. Cloudflare reports the domain active. Public resolver propagation was still incomplete at the last terminal check.
- User saved Flexible on the new zone. The existing zone also uses Flexible; read-only server checks confirm port 80 listens and port 443 does not. Origin HTTPS and Full (Strict) remain a separate follow-up.
- Forced-resolution HTTPS checks through Cloudflare returned 200 for both new public hostnames. The server's localhost request with `Host: villkro.in` also returned 200. No production restart or nginx edit was required for these checks.
- Landing-page source now uses the new canonical/social URLs and app schema URL; robots.txt and a homepage sitemap are added; the QR asset targets `https://villkro.in/get/`. A version query avoids retaining the previous QR under the existing asset cache. Existing policy and store URLs remain operational. Source validation passed; these file changes are **not deployed yet**.
- Old public redirects, Search Console submission, origin HTTPS, area pages, and any optional client/API migration remain pending. Keep legacy API/OTA endpoints unchanged.
- Further SEO research and local improvements are documented in [the October research and execution plan](villkro-seo-research-2026-10.md). A crawlable `/app/` page, descriptive metadata, WebSite/Organization markup and JavaScript-independent reveal content are now prepared. Search Console login is confirmed; ownership verification is pending. Local validation and desktop/mobile browser checks passed. Production remains unchanged.
- Later verification corrected the earlier nameserver assumption: refreshed GoDaddy settings and the `.in` registry show `ns57.domaincontrol.com` / `ns58.domaincontrol.com`; GoDaddy's apex A record is Parked. The Cloudflare nameserver switch is therefore **not complete**. Google verification TXT was saved in both Cloudflare and active GoDaddy DNS; both GoDaddy authoritative servers returned it, and Search Console displayed **Ownership verified**. Keep both verification records. No server changes were made, and the sitemap has not been submitted because local website files are not deployed.
ok 
## Recommendation

Move the public website to `https://villkro.in` on the existing server first. Keep `api.serveloco.app` and `ota.serveloco.app` operational for installed apps. Add new branded API/admin addresses as aliases to the same services, then migrate clients separately. A domain change requires no database migration or new server.

The repository consistently uses **serveloco.app**, not serverloco.app. Confirm the spelling before changing DNS.

## 1. What the project does today

| Component | Current address / implementation | Evidence |
| --- | --- | --- |
| Public website | `serveloco.app`, `www.serveloco.app`; static HTML marketing and app-download site, not browser shopping | `apps/landing/src/index.html`, `apps/landing/Dockerfile` |
| API | `api.serveloco.app`; Express REST under `/api`, Socket.IO, root health endpoints, public policy pages | `apps/api/src/app.js`, `deploy/nginx-proxy.conf` |
| Admin | `admin.serveloco.app`; Vite React, connects to configured API origin for REST and realtime | `apps/admin/src/api/client.js`, `apps/admin/src/api/realtimeClient.js` |
| Customer app | Expo React Native Android/iOS; production API URL bundled into builds/updates | `apps/customer-app/src/api/config.js`, `apps/customer-app/eas.json` |
| App updates | `ota.serveloco.app/manifest`; xprem service with persistent update storage | `apps/customer-app/app.json`, Android manifest, `docker-compose.prod.yml` |
| Hosting | Cloudflare-facing nginx proxy routes to Docker services on a Lightsail instance; CI builds images and deploys them | `deploy/nginx-proxy.conf`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml` |
| Data and images | API uses MySQL and MongoDB; S3 image storage is documented in the production example | API config, `apps/api/.env.production.example` |

The Compose comment still names Azure MySQL, while `plans/rds-performance-audit.md` records a September move to RDS. Verify deployed infrastructure rather than trusting older comments. Domain migration should leave all databases, orders, volumes, image storage and app identifiers intact.

### Initial audit limits (subsequent checks are recorded above)

- Repository inspection and a web-tool read of the old homepage support the architecture above; deployed configuration was not inspected.
- The web tool returned the old site's content, but could not retrieve `villkro.in`, its www address, or the old robots/sitemap URLs. These failures do not establish that a domain is offline or a file returns 404.
- Local network checks could not resolve domains in this environment. DNS, certificates, Cloudflare settings, deployed headers and HTTP status checks remain outstanding.
- Search Console ownership/indexing and current Play/App Store publication status were not verified. The website contains links to both stores.
- Existing unrelated working-tree changes must be preserved during implementation.

## 2. Proposed domain layout

| Address | Purpose / treatment |
| --- | --- |
| `https://villkro.in` | Main public website and canonical SEO domain |
| `https://www.villkro.in` | Permanent redirect directly to the apex, preserving path/query |
| Old public apex and www | Permanent redirect directly to the corresponding new public URL, preserving path/query |
| `https://api.villkro.in` | New alias to the existing API; introduce before updating clients |
| `https://admin.villkro.in` | New alias to the existing admin; require authentication and exclude from indexing |
| `https://api.serveloco.app` | Continue serving API, WebSockets, policies and legacy image URLs directly |
| `https://ota.serveloco.app` | Keep the existing update endpoint; moving it is optional and gives no SEO benefit |

Do not apply an old-domain wildcard redirect to API/OTA subdomains. API redirects can break authenticated requests or realtime connections. Do not retire old endpoints on a fixed date while supported installed versions still need them. Keep the old domain renewed.

## 3. Ordered implementation checklist

### Phase A: inventory and preparation

- [ ] Confirm the domain registrar, authoritative nameservers, current public origin/static IP, and access to the existing Cloudflare zone.
- [ ] Inventory old public URLs and links, printed/download QR codes, DNS records, email MX/TXT records, redirects and external integrations.
- [ ] Record current health and error baseline; preserve known-good proxy configuration and image tags for rollback.
- [ ] Verify both domains in Google Search Console, ideally using DNS ownership verification; check the purchased domain for manual actions/security issues.
- [ ] Confirm actual delivery areas, shop data and approved delivery-time claims. The office location shown on the site does not prove its delivery coverage.

### Phase B: introduce the new hostnames without breaking old clients

- [ ] Add `villkro.in` to Cloudflare if retaining the existing provider. Copy required email records before any nameserver change. No Route 53 or new hosting purchase is required.
- [ ] Recommended GoDaddy route: create the new Cloudflare zone and review its records, then open GoDaddy's domain settings for `villkro.in` and replace its nameservers with the exact pair Cloudflare assigns. This changes DNS hosting, not the domain registrar. After activation, manage DNS in Cloudflare; retain GoDaddy for registration/renewal. Check DNSSEC status and coordinate removal/replacement of any old DS record during the nameserver transition. Do not use domain masking/forwarding as the migration mechanism.
- [ ] Configure apex, www, API and admin DNS for the verified current origin. Do not guess the server IP or reuse Cloudflare edge IPs as the origin. Only add IPv6 records if origin IPv6 is verified.
- [ ] Add explicit hostname routing in `deploy/nginx-proxy.conf`; new API/admin aliases must point to the same containers as the old ones. Keep the old public site available until cutover.
- [ ] Validate HTTPS at the edge and determine the actual origin TLS arrangement. The checked-in stack exposes only port 80. Cloudflare Full (strict) requires origin HTTPS and a valid matching certificate: provision/test those before selecting that mode. Never flip the mode against an HTTP-only origin.
- [ ] Preserve nginx's trusted Cloudflare client-IP handling, Docker DNS re-resolution, upload limits and Socket.IO upgrades/timeouts.
- [ ] Add the new browser origins to `CORS_ORIGIN`, retaining necessary old origins. REST compares exact comma-separated entries without trimming: use no spaces. Socket.IO reads the same setting. Never use a production wildcard.
- [ ] Validate both hostname families before releasing clients. Exclude API/admin/OTA responses from indexing as appropriate, while keeping authentication as the actual access control. Avoid blocking crawler access with robots.txt if relying on a noindex response to remove an indexed page.

### Phase C: move the public website

- [ ] In `apps/landing/src/index.html`, update canonical, Open Graph URLs and social-image URLs to the new domain; update links and brand consistency.
- [ ] Update `apps/landing/src/get/index.html` branding. Keep `/get/` working and noindex: it is a device-specific store redirect helper, not the SEO app page.
- [ ] Regenerate `apps/landing/src/qr-download.svg` for `https://villkro.in/get/` and verify by scanning. Existing printed QR codes must still work through the old public redirect.
- [ ] Add `apps/landing/src/robots.txt` and `sitemap.xml`; sitemap contains only canonical, public, indexable URLs returning 200. Exclude `/get/`, admin, API, OTA and private account/order pages.
- [ ] Prefer public policy URLs on `villkro.in/policies/*`, served/proxied from the existing policy source. Preserve old API policy URLs for installed apps and store references. Review domain references in privacy/terms without changing claims casually.
- [ ] Keep the existing page layout/content broadly stable during domain cutover. After new URLs pass checks, permanently redirect only old public hosts and new www to the new apex, without loops or multiple hops.
- [ ] Submit the sitemap and appropriate Search Console Change of Address for the public-site move. Inspect the new homepage and policy URLs. Keep public redirects for at least a year, preferably longer; compatibility services may need the old domain indefinitely.

### Phase D: migrate API/admin clients separately

- [ ] Change the admin API build argument in `.github/workflows/deploy.yml` to `https://api.villkro.in/api`, rebuild admin and test login, orders, uploads and realtime from the new admin host.
- [ ] Update deploy smoke-test Host headers deliberately; test both old and new API addresses. `PUBLIC_BASE_URL` can move after legacy image references are verified; S3 public URLs do not need changing solely for this domain move.
- [ ] Update production/preview API URLs in `apps/customer-app/eas.json` and the corresponding CI public URL setting used by `.github/workflows/playstore.yml`. Inspect build configuration without exposing credentials.
- [ ] Update hardcoded policy links in app AuthScreen/ProfileScreen and policy-page domain references. Review Firebase/provider authorized domains or callbacks only where those integrations actually use the changed hosts.
- [ ] Release/test on Android and iOS. A compatible JS update can change JS API configuration, but native update-server configuration needs a new store binary. Retain existing signing and runtime compatibility rules.
- [ ] Keep `com.yashsiwach.villkro`, iOS bundle identifier, signing identities and existing store listings. A website domain change does not require publishing a separate app.
- [ ] If OTA migration is later requested, audit `app.json`, checked-in Android manifest, generated iOS/native configuration, publisher configuration, returned asset URLs and host-specific caches. Keep the old OTA hostname serving the same update service throughout adoption.

## 4. SEO growth after cutover

The initial landing page had a title, description, canonical tag, social metadata, static content and MobileApplication JSON-LD, but lacked robots.txt/sitemap. These files and a readable app page are now prepared locally. Its largest remaining content gap is unnamed service areas; customers must open the app to discover coverage.

Start with a small set of useful static HTML pages on the current stack:

| Page | Content |
| --- | --- |
| `/` | VillKro brand, what it delivers, actual coverage, app links |
| `/app/` | Crawlable app overview, real screenshots/features, Android/iOS links and support |
| `/areas/` | Confirmed operational delivery areas |
| `/areas/<actual-area>/` | Area-specific shops/categories, delivery boundaries, hours, useful local information and app CTA |
| `/about/`, `/contact/` | Accurate company details and customer support |
| `/policies/privacy`, `/policies/terms`, `/policies/delete-account` | Public legal and account-deletion information |

Each indexable page needs a unique title/description, clear heading, readable content in initial HTML, self-canonical and navigation links. Example area title: `Grocery & Food Delivery in [Actual Area] | VillKro`. Publish only areas really served; avoid copied keyword pages for every town. Optional shop pages require accurate public shop information and a way to keep it current. Customer accounts/orders/addresses are never SEO content.

Add accurate Organization/WebSite metadata and maintain the existing app markup. App rich-result eligibility requires the documented properties, including a legitimate rating or review; current markup lacks these. Do not invent ratings. Validate with Google's Rich Results Test. Markup does not guarantee a special search appearance.

Measure mobile loading speed and Core Web Vitals; optimize images and fonts from measured results. Existing static HTML is suitable for this first SEO phase; no framework rewrite is necessary. If analytics are introduced, update privacy disclosures consistently.

## 5. Make the app discoverable

Google web search and Google Play search are separate surfaces. Native app screens are not automatically crawlable web pages.

- Verify existing listings are publicly available in intended countries/devices. Keep VillKro naming consistent across the website, Play Store, App Store and social profiles.
- Update store website/support/privacy links to tested new URLs while preserving old ones. Improve accurate title, short/full descriptions, screenshots and useful localized copy; avoid keyword stuffing.
- Link `/app/` directly to both current listings. Improve reliability, Android vitals and genuine customer feedback; these support Play discovery.
- Consider verified Android App Links and iOS Universal Links later so public web links open matching app screens. No domain-specific verified links were found in the inspected Expo config. This needs native setup, domain association files and navigation handling; it is not a prerequisite for indexing the public site.
- Assess Google Business Profile eligibility for the actual operation before creating a listing. Online-only businesses are ineligible; qualifying in-person delivery/service operations must follow Google's rules. Do not create fictitious branches.

## 6. Acceptance checks and rollback

- Website/new public pages return 200 over HTTPS, point canonicals at themselves, render without login/location prompts and have no accidental noindex.
- Old public URLs and www reach the matching new URLs in one permanent redirect; paths/query strings and images are preserved; genuinely missing pages remain 404.
- robots.txt/sitemap are reachable and correct; Search Console live inspection can fetch representative URLs.
- Existing installed app and newly released app can log in, browse, load images, checkout and receive order/realtime updates. Test old/new REST, preflight, Socket.IO and signed OTA downloads.
- Admin works on both hosts during transition. Public policies and Android/iPhone download/QR flows work.
- Deployment gates still pass. Run API tests/lint when backend changes occur, admin checks when admin changes occur, and relevant customer-app checks for client changes; planning alone needs no application test run.
- Roll back routing/build URL changes to preserved known-good configuration if failures occur. Keep aliases alive so either client generation works. No database rollback should be needed for a hostname-only change.

Monitor Search Console indexing, impressions, clicks and search queries, plus API errors and update failures. Submission does not guarantee indexing or ranking; assess trends over weeks without promising a fixed date or first position.

## 7. Inputs needed before execution

Registrar is confirmed as GoDaddy. Still needed: current DNS provider/nameservers; verified current server address and Cloudflare TLS mode; Search Console access; actual launch areas and delivery details; store listing availability. Public website migration can start independently of the optional API/OTA rebranding.

## Official references

- [Google site migration guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
- [Google developer SEO guide](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Sitemap creation and submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Software app structured data requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Google Play discovery guidance](https://support.google.com/googleplay/android-developer/answer/4448378?hl=en)
- [Business Profile eligibility](https://support.google.com/business/answer/13763036)
- [Cloudflare Full (strict) prerequisites](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [GoDaddy nameserver changes](https://www.godaddy.com/en-ca/help/change-my-domain-nameservers-664)
