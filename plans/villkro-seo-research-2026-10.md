# VillKro SEO research and execution

Researched 7 October 2026. Recommendations below are based on Google's current documentation, with older case studies identified separately. Local source changes are prepared; nothing in this SEO pass was deployed or changed over SSH.

## What to prioritize for VillKro

The strongest opportunity is answering a customer's real question: can VillKro deliver groceries or food to their address, from which shops, and how do they order? A generic download page cannot fully answer local searches. Start with a reliable domain migration, readable pages and accurate coverage information, then measure demand in Search Console. Google makes no promise of indexing or first position. [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

| Priority | Action | State / dependency |
| --- | --- | --- |
| 1 | Verify `villkro.in` in Search Console using the Domain option and DNS TXT record | Completed; Google displayed Ownership verified |
| 1 | Deploy tested canonicals, robots.txt, sitemap and website content | Local only; production approval required |
| 1 | Test apex HTTPS and redirect www/old public domains to matching new URLs | DNS propagation and redirect setup still need confirmation |
| 2 | Publish useful delivery-area information | Exact operating towns, boundaries and hours needed |
| 2 | Improve app discovery with a readable `/app/` page and direct store links | Implemented locally |
| 2 | Add accurate brand/business metadata | Organization + WebSite added locally |
| 2 | Make important page content readable without JavaScript | Reveal animations now enhance visible content; static counters show final values |
| 3 | Measure and improve mobile performance | Live PageSpeed/field baseline needed after deployment |
| 3 | Set up an eligible Google Business Profile | Confirm actual operation and in-person customer contact first |
| 3 | Improve store listing descriptions/screenshots and app reliability | Copy draft below; Play/App Store publication separate |
| 4 | Obtain genuine local mentions, customer feedback and partner links | Business work; no bought links or fake reviews |

## Current guidance and changes worth knowing

Google's documentation changelog records an October 1, 2026 update to generative-AI content guidance. It also records the retirement of FAQ rich results starting May 7, 2026, and June clarification that `llms.txt` does not affect Google visibility. Keep the site's FAQ useful for customers without adding FAQ schema for a retired search feature. [Documentation updates](https://developers.google.com/search/updates)

The ranking history lists a September 24, 2026 spam update. Its presence does not diagnose VillKro or prove any particular tactic works. Compare confirmed rollout dates against your own Search Console data before attributing a traffic change to an update. [Google ranking history](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history)

Google's current AI guidance says established SEO remains applicable. Useful, distinctive business information matters; there is no need for special AI text files, artificial mentions or an AEO/GEO markup package. [AI optimization guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

## Content, keywords and local visibility

Use one clear purpose per page and descriptive titles. The homepage now says grocery and food delivery from local shops. The app page explains installation, first ordering, availability and support. These are relevant improvements, not a claim of measured keyword volume. [Title guidance](https://developers.google.com/search/docs/appearance/title-link)

After coverage is confirmed, build one useful area overview and only the area pages that have distinct, accurate information. Each should include the actual served localities, shops/categories, ordering hours, delivery boundaries, how charges work and support. Add genuine shop photos with permission. Link these pages from the homepage and to the app page. Use natural local search language, such as grocery delivery in the actual town; do not repeat every spelling variation.

Avoid creating identical pages for hundreds of towns. Bought links, stuffed keywords, fake reviews and scaled pages that add little value create spam risk. [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)

Customer-facing claims must be reviewed by the owner. The inherited 30–45 minute delivery promise and 24/7 counter have now been replaced locally with tracking and availability information. Ordering hours and delivery coverage still need owner confirmation. The office address is not proof that every surrounding locality is served. New content avoids promising a fixed delivery time. Real operational information is more useful than generic AI-written grocery articles. [Helpful content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

For local visibility, keep business naming, phone/contact information, website and hours consistent across real partner shops, social profiles and legitimate local directories. Ask customers for honest feedback and respond to it. Google describes local ranking through relevance, distance and prominence; adding distant service areas cannot change the searcher's actual distance. [Local ranking guidance](https://support.google.com/business/answer/7091?hl=en)

Business Profile eligibility depends on actual in-person operations. An online-only platform is ineligible; do not assume that an office address qualifies, or create fictitious branches. Establish whether VillKro itself meets customers through an eligible delivery/service operation before choosing the business category, location visibility and service areas. [Eligibility rules](https://support.google.com/business/answer/13763036)

## Technical implementation and structured data

The homepage and `/app/` have distinct metadata and self-canonicals, readable initial HTML and direct links to the existing stores. The sitemap includes only these indexable URLs. `/get/` stays noindex and crawlable because it is a device-based download helper. Missing paths still use the existing nginx 404 behavior.

The homepage includes one WebSite node for the VillKro name and an Organization node with the existing logo, support email and Instagram profile. These help describe identity; they do not guarantee a knowledge panel or ranking increase. Site names require WebSite markup and should be checked with Schema Markup Validator rather than Rich Results Test. [Site-name documentation](https://developers.google.com/search/docs/appearance/site-names), [Organization documentation](https://developers.google.com/search/docs/appearance/structured-data/organization)

MobileApplication metadata links to both stores. There are no invented star ratings. Google's software-app rich result requires a legitimate rating or review, so the current descriptive app markup is not fully eligible for that feature. Do not add Product, LocalBusiness or review markup for facts absent from the page. [Software-app requirements](https://developers.google.com/search/docs/appearance/structured-data/software-app)

The public migration must preserve matching paths and use permanent redirects only on public website hosts. Keep API/admin/OTA clients working. Verify old public hosts in Search Console too; use the Change of Address flow when supported and applicable, including relevant public variants. Keep redirects at least a year. DNS changes alone do not replace URL migration. [Site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)

## Performance and evidence from case studies

Measure mobile and desktop separately. Good field targets are LCP at most 2.5 seconds, INP at most 200 milliseconds and CLS at most 0.1 at the 75th percentile. A lab Lighthouse score cannot prove that real users pass these targets. Start by identifying the slow resources, then optimize image sizes/formats, fonts, caching and animation cost where measurements justify it. The new app page uses system fonts and requires no JavaScript. No speed increase has been measured yet. [Web Vitals](https://web.dev/articles/vitals)

| Case study | Reported result | Lesson for VillKro |
| --- | --- | --- |
| Saramin, published 2020; results from 2019 | 102% year-over-year organic growth during hiring season after an extended SEO effort | Search Console, crawl-error fixes, canonical cleanup and appropriate structured data worked together; no single trick caused a guaranteed result |
| Rakuten 24, published 2022 | A performance A/B test reported 33.13% higher conversion and 53.37% higher revenue per visitor | Measure customer outcomes alongside speed; these are conversion results for another business, not SEO-ranking forecasts |

Sources read: [Saramin case study](https://developers.google.com/search/case-studies/saramin-case-study), [Rakuten 24 case study](https://web.dev/case-studies/rakuten). Older case-study tools/metrics, such as FID or retired testing tools, are not the current acceptance criteria.

## App-store discovery and a prepared Play listing draft

Google web search and Google Play search use different systems. Play considers query relevance, app quality, metadata, feedback and engagement. Improve checkout reliability, crashes/ANRs and genuine reviews along with the listing. Website schema cannot index private native app screens or guarantee Play ranking. Keep the existing package ID and store listings. [Play discovery and ranking](https://support.google.com/googleplay/android-developer/answer/9958766?hl=en)

Prepared English copy for owner review, not submitted:

**App name:** `VillKro: Grocery & Food`  
**Short description:** `Order groceries and food from local shops. Track your delivery with VillKro.`

**Full description draft:**

> Order groceries, food, dairy and daily essentials from nearby shops with VillKro. Set your delivery location to see the shops and products available to you.
>
> Browse local shops, add items to your cart and review your order before placing it. Follow order updates and live rider tracking in the app.
>
> VillKro is free to download. Product availability and delivery depend on your location and shop availability. Review the order total and any applicable delivery charges before ordering.
>
> Need help? Contact decodelabsofficial@gmail.com. Visit villkro.in to learn more about VillKro.

Google Play limits are 30 characters for the name, 80 for the short description and 4,000 for the full description. Review store category, country/device availability, current screenshots, support/privacy URLs and approved translations before publishing. Add real screenshots of shop discovery, cart and tracking; do not label mockups as app screenshots. Use Play listing experiments to test assets once there is enough traffic. [Store listing setup](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)

## Ordered follow-through and measurement

1. **Completed:** Search Console ownership verification. The verification TXT record was saved at the apex in both Cloudflare and GoDaddy. Subsequent registry/dashboard checks confirmed GoDaddy remains authoritative, with its apex A record Parked; the Cloudflare nameserver switch is not complete. Both GoDaddy nameservers now publish the token and Google displayed Ownership verified. Keep the records, finish the DNS migration separately, and preserve verification when switching providers.
2. **Before publication:** Owner confirms delivery areas and claims; review the local changes. Approve a landing-only deployment with backup and rollback. Do not use the full-stack deployment workflow for this isolated change without review.
3. **After publication:** Confirm HTTPS, status codes, canonicals, robots, sitemap and redirects. Submit `https://villkro.in/sitemap.xml`; use URL Inspection's live test on `/` and `/app/`, then request indexing if available. Check manual actions and security issues. Submission does not guarantee indexing.
4. **Next:** Publish confirmed local information, review Business Profile eligibility and update existing store/social website links. Store listing publication and native verified links are separate tasks.
5. **Weekly initially:** Review Search Console indexing, branded/non-branded queries, clicks, impressions and CTR by page/device. Record releases so changes can be compared. Track store-link clicks or acquisitions only with an agreed analytics setup and privacy disclosure.
6. **After enough data:** Use actual queries to improve weak pages and answer missing customer questions. Compare multiple weeks and account for launch timing/seasonality. Run measured performance or store-listing experiments instead of changing everything at once.

Success means accessible/indexed public pages, increasingly relevant local impressions and more qualified app visitors/orders. No first-position, traffic-percentage or fixed-time promise is supported by this research.

## Play Store audit and content alignment (7 October 2026)

Read the full public [Google Play listing](https://play.google.com/store/apps/details?id=com.yashsiwach.villkro) in the in-app browser after the web fetch failed. Current title is **VillKro: Smart Food Delivery**, category Food & Drink, version 1.9.9, updated 4 October 2026, minimum Android 7.0. The page displayed 500+ downloads and 5.0 stars from 31 reviews; these volatile numbers have not been copied into website schema.

The listing positions VillKro for villages and small towns, with neighborhood shops/riders, groceries, prepared meals, pharmacy items and household goods, notifications, tracking, UPI and cash. The local app page now reflects that positioning. Checkout source confirms cash can be blocked by area or nighttime rules, so website payment copy includes that qualification. Website support links on Play currently use `http://www.villkro.in/`, the existing support email and `https://api.serveloco.app/policies/privacy.html`. Update the website link to the canonical HTTPS apex in Play Console after public routing is working; leave its working privacy URL until a replacement is tested.

Read-only registry DNS still showed GoDaddy's default nameservers during this audit. DNS correction and an approved landing-only deployment remain necessary before sitemap submission.

### DNS submission status

Cloudflare DNS Settings visibly confirms assigned nameservers `robert.ns.cloudflare.com` and `ulla.ns.cloudflare.com`. Its five records preserve apex/www routing, domainconnect, DMARC and Google's verification TXT. The registry lookup returned no DS record. Forced HTTPS requests through Cloudflare returned 200 for both apex and www on 7 October. GoDaddy's custom-nameserver form is filled with the confirmed pair, but the final Continue action was rejected by automatic approval review pending explicit user confirmation. **The nameserver change is not submitted.** GoDaddy's confirmation dialog is left open. Server changes and sitemap submission remain pending.

Content validation after the Play audit passed (one H1 and correct canonical on each public page, valid JSON-LD/sitemap, existing store links). The app-page preview renders the new content. No production files or store listing were changed.

### Follow-up DNS observation (7 October, 15:03 UTC)

Opened GoDaddy's DNS > Nameservers at the user's request. It now visibly shows **Using custom nameservers**, `robert.ns.cloudflare.com` and `ulla.ns.cloudflare.com`. The user completed the change between observations; this follow-up made no DNS edits. The `.in` registry still delegates to GoDaddy and 1.1.1.1 still returns parking addresses, so public cutover is pending. Normal HTTPS responses currently have only 114 bytes and do not establish the VillKro landing page is served. Do not change the saved nameservers again. No server edits or deployment occurred.
