# VillKro search visibility: implementation and next actions

Audit begun 13 October 2026 IST. Branch: `codex/villkro-search-visibility`.

## Verified baseline

- Direct Google search for **VillKro** in the connected browser showed the official homepage as the first standard web result and `/app/` second. Results are personalized/location-dependent; this is one observation, not a universal rank. Google also suggested “VillGro”, and displayed an older homepage title/favicon.
- Search Console `sc-domain:villkro.in`: homepage and `/app/` both **URL is on Google / Page is indexed**, crawl/indexing allowed, successful smartphone fetch, and Google-selected canonical matches the inspected URL. Homepage last crawl: **13 October 2026, 11:31:26 PM** as displayed. App-page last crawl: **7 October 2026, 9:19:36 PM**.
- Search performance at inspection: **0 clicks, 2 impressions, 0% CTR, average position 5**. Three-month selector; chart data October 6–11. All reported impressions belong to `/app/`; query table has no data. Two impressions are insufficient to judge ranking trends or declare a CTR problem.
- HTTPS homepage returns 200. Live `/icon.png` and `/favicon-32.png` are byte-identical to the repository's current brand files. The 192px icon shows the black-background white V with orange/yellow leaf. The screenshot's different icon is consistent with stale Google display data; changing browser cache cannot force Google's refresh.
- User confirmed current delivery **near Gorakhpur, Hisar, Haryana 125047**. No exact radius, complete postal-code coverage or additional villages were supplied. Public WhatsApp and 9 AM–11 PM daily hours were recorded as owner-approved in `villkro-landing-release.md`.
- Earlier release records document completed domain migration, sitemap submission and Change of Address. Do not repeat the DNS migration or create duplicate Search Console properties. Business Profile video verification was deferred by the owner in that record; its present status still needs checking.

## Implemented in this branch

- Added `/delivery/gorakhpur-haryana/`: local categories, address check, ordering steps, hours, payment qualifications and public support. Original, static HTML with self-canonical, social metadata, visible breadcrumbs and matching WebPage/Service/BreadcrumbList data. No invented shops, reviews or delivery-time guarantees.
- Linked the local page from the homepage navigation, local service section, FAQ, footer and app page. Included it in the sitemap.
- Homepage title/description now identify the actual local market. Organization metadata includes the existing public phone; visible pages link to WhatsApp.
- Homepage uses the stable 192×192 `/icon.png` as its single `rel=icon`, consistent with the app/local pages. The old 32px file remains accessible for old references. Google controls when the display changes.
- App and area page share a small CSS file and need no JavaScript for content or navigation. Existing site architecture, stores, native clients and API contracts are preserved.
- Landing CI covers all three sitemap pages, canonical URLs, JSON-LD, app-store links, the local-page discovery link, the 192px favicon, shared CSS, crawlable noindex download helper and missing-page 404.
- The three sitemap entries have an accurate `lastmod` of 14 October 2026, the date their main content, links or metadata changed. Keep these dates accurate in future releases; do not update them merely to appear fresh.
- Homepage social descriptions and local link text now match the confirmed service area. Payment and same-day delivery copy no longer promise availability where the app may not offer it; the decorative phone no longer displays invented minute estimates.

## Prioritized growth work

| Priority | Action | Completion criterion / dependency |
| --- | --- | --- |
| P0 | Publish this reviewed branch through GitHub CI/CD | Landing and infrastructure checks pass; owner approves production timing because the main deployment stops API for migrations; verify new URL, sitemap and assets live. |
| P0 | Refresh Google after publication | Inspect new local URL and changed homepage; run live test and request indexing once. Existing sitemap URL is unchanged; check processing rather than repeatedly resubmitting. Keep old-host 301s and stable favicon URL. |
| P1 | Complete existing Business Profile verification | Owner completes any real-world video/address proof Google requires. Use the existing profile; do not create a duplicate. Keep service area, category, name, public contact, hours and website truthful. |
| P1 | Align brand identity | Use VillKro consistently, the current V icon and `https://villkro.in/` on Play, App Store, Instagram, LinkedIn and eligible directories. Search showed both `@villkro` and `@villkro.in`; owner should identify the primary profile before changing schema or accounts. |
| P1 | Improve store discovery and conversion | Audit current Play title/short/full description, current screenshots, website/privacy URLs, category and availability. Preserve the published app ID. Evaluate crashes/ANRs, checkout success, genuine feedback and acquisitions alongside copy. |
| P1 | Earn useful local links | Ask real participating shops to link to the local guide from their websites/social profiles; seek factual local press/community coverage with permission. No outreach sent by this task. |
| P1 | Collect honest customer feedback | Invite genuine customers neutrally; do not buy reviews, reward positive ratings or filter dissatisfied users away from review opportunities. Respond to real issues. |
| P2 | Add distinctive local evidence | Publish owner-approved participating shop names/photos, real category examples and coverage details when supplied. Do not generate clone pages for unsupported towns. Update the existing area page as facts change. |
| P2 | Measure mobile experience | Record PageSpeed lab results and Search Console field data when available. Target p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Fix measured bottlenecks; a Lighthouse score alone is not a ranking guarantee. |
| P2 | Useful Hindi localization | If customer/search data supports it, create a fully translated Hindi page with reciprocal hreflang and a visible language switch, reviewed by the business. Avoid untranslated duplicate pages. |
| P2 | Evaluate paid acquisition separately | A tightly targeted Search or app campaign can buy labeled ad visibility, not organic rank. Requires owner-defined geography, conversion goal and spending limit. No campaign or spend authorized/started here. |

## Keyword and page mapping

Candidate phrases are based on the product and owner-confirmed location, not fabricated search-volume estimates.

| Intent | Page / approach |
| --- | --- |
| VillKro, VillKro app | Homepage: clear brand identity and purpose |
| Download VillKro, VillKro Android, VillKro iPhone | `/app/`: direct store links and installation/order help |
| Grocery delivery near Gorakhpur Haryana, food delivery Gorakhpur Hisar, sweets delivery near Gorakhpur | One useful local page; exact address availability, categories and support |
| Food delivery Agroha, grocery delivery Agroha, sweets delivery Agroha | `/delivery/agroha-haryana/`: its own copy, ordering steps, hours, coverage help |
| Customer support or delivery availability | Visible contact and local guide; keep private account/order information out of public pages |

Use Haryana/125047 to disambiguate the location. Do not target Gorakhpur, Uttar Pradesh or all of Hisar unless actual coverage expands. Do not add misspellings, repetitive keyword blocks, fabricated ratings, hidden text, bought links or bulk thin articles. Extra metadata cannot substitute for reliable service and real local information.

## Store copy ready for review

The current Play Console tab is labeled “VillKro: Food & Groceries”; inspect actual published listing before changing it. Suggested short description (under 80 characters):

> Food, groceries and sweets from local shops. Order and track with VillKro.

Suggested location paragraph for a full description:

> VillKro currently delivers near Gorakhpur in the Hisar area, Haryana 125047. Set your exact delivery address to see participating shops and available products. Browse groceries, food, sweets and everyday essentials, review the total and payment choices at checkout, and follow order updates and rider tracking in the app. Availability depends on your address and the shop.

Do not claim “#1”, guarantee delivery minutes or copy volatile ratings/download counts into markup. Play listing edits and asset experiments should be based on the currently published listing; this draft has not been submitted.

## Measurement and release checklist

- Record release date, indexed canonical URLs and any excluded URLs with reasons.
- Review Search Console weekly: impressions/clicks by page, query, country and device; separate brand queries from local non-brand discovery. Wait for enough data before judging changes, usually compare 28-day periods.
- Track store acquisitions and completed orders using the existing available reports. Website clicks are not installs, and installs are not completed orders. No analytics SDK, cookies or personal-data collection added by this branch.
- After deployment, verify `/`, `/app/`, `/delivery/gorakhpur-haryana/`, `/robots.txt`, `/sitemap.xml`, `/icon.png`, `/content.css` and missing-path 404. Check old/public-www redirects preserve path/query and API health remains normal.
- Request the new page's indexing only after it returns the finished public page. The local preview is not indexable or submitted to Google.
- Business verification, social/store account edits and real customer/partner outreach remain account/owner work. No messages, reviews or profile changes were sent by this task.

## Current primary sources

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): helpful pages, clear links/titles and patience; no guaranteed first position.
- [Google title links](https://developers.google.com/search/docs/appearance/title-link) and [snippets](https://developers.google.com/search/docs/appearance/snippet): unique, concise, accurate titles and descriptions; Google may still choose other visible page text, and changes require recrawling.
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): `lastmod` is useful only when it reflects a significant, verifiable page update.
- [Google favicon guidance](https://developers.google.com/search/docs/appearance/favicon-in-search): crawlable square brand icon, stable URL, recommended size above 48px; refresh may take days to weeks.
- [Google local ranking](https://support.google.com/business/answer/7091?hl=en): relevance, distance and prominence; complete accurate profile and genuine reviews.
- [Organization metadata](https://developers.google.com/search/docs/appearance/structured-data/organization) and [breadcrumbs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb): accurate entity and page context, not a guaranteed enhanced result.
- [Recrawl requests](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl): use URL Inspection/sitemaps, allow processing time; repeated requests do not accelerate crawling.
- [Play discovery](https://support.google.com/googleplay/android-developer/answer/9958766?hl=en), [store listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en) and [listing limits](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en): relevance, quality and honest concise metadata; name 30, short description 80, full description 4,000 characters.
- [Web Vitals](https://web.dev/articles/vitals): measure real-user performance as well as lab diagnostics.

Rank #1 cannot be promised. Branded search already showed the official site first in this session; the remaining objective is qualified local discovery and more successful orders.

## Validation before pull request

Local execution of Landing CI's crawler assertions passed against the HTTP preview. All root-relative HTML links/assets resolve. Desktop and 390px mobile previews passed for the local page, app page and homepage delivery navigation; mobile pages have no horizontal overflow. Focused reviewer found no actionable issues. Local Docker/nginx are unavailable; the production image and nginx checks run in GitHub Landing CI. No production deployment performed.

## 14 October 2026 update: redesign, Agroha page, store text

Owner confirmed VillKro delivers in **Gorakhpur and Agroha** (Hisar district). Changes on this branch:

- **New design for every page**: dark black + saffron look, animated hero phone (coded Home → Cart → Live tracking screens, labelled as an illustration), live delivery map, animated how-it-works and feature cards, mobile menu and sticky "Get the app" bar. One shared `/assets/site.css` and `/assets/site.js` (replaces `content.css`). All text stays in the HTML; motion is CSS plus a small script and respects reduced motion.
- **New page** `/delivery/agroha-haryana/` with its own copy, Service + BreadcrumbList data and `areaServed` Agroha. Gorakhpur page keeps its reviewed copy in the new design and links to Agroha. Homepage title, description, map, footer and FAQ name both towns. Sitemap has four URLs.
- **App visibility on the web**: iOS Smart App Banner (`apple-itunes-app`) on every indexable page; `site.webmanifest` with both stores in `related_applications`; new 1200×630 `og-image.png` in the new style.
- **Speed**: Plus Jakarta Sans self-hosted (two woff2 files, no Google Fonts requests); WebP logo/wordmarks at display size; deferred script; homepage first load about 80 KB compressed. nginx caches css/js/webp/woff2 for 7 days (css/js links carry `?v=`), serves the manifest with its own type, and adds `X-Content-Type-Options` and `Referrer-Policy`.
- **Landing CI** now checks four sitemap pages, links to both towns, the Smart App Banner, the manifest type, security/cache headers and that every root-relative link or asset resolves.
- **Store text** for Play and the App Store is in `plans/villkro-store-listing.md` (not submitted).

After deployment: inspect `/delivery/agroha-haryana/` and `/` in Search Console and request indexing once; check that `sitemap.xml` was re-read with four URLs; add Agroha to the Business Profile service area after verification.
