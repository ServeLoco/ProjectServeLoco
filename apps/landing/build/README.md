# Website generator

The pages in `apps/landing/src` are generated. Do not edit them by hand: CI runs
`build.py --check` and fails if they differ from a fresh build. The only hand-written pages are
`src/get/index.html` (the QR store redirect) and the static files (icons, `robots.txt`,
`site.webmanifest`, `assets/site.css`, `assets/site.js`).

| File | What it holds |
|---|---|
| `site_data.py` | Towns and their status (`live` / `soon`), villages, app category → dish page map |
| `strings.py` | All page text, English and Hindi |
| `templates/` | Jinja2 templates (layout, home, town, dish, shop, app, about, sell, deliver) |
| `data/catalog.json` | Real shop menus from the public API (written by `fetch_catalog.py`) |
| `data/lastmod.json` | Page hashes, so sitemap `lastmod` only changes when a page really changes |

## When shops or menus change

```bash
python3 apps/landing/build/fetch_catalog.py   # needs network + Pillow; saves menus and photos
python3 apps/landing/build/build.py           # needs Jinja2 (pip install jinja2==3.1.6)
```

Then commit `apps/landing` and deploy. A dish page appears only when it has 6 or more available
items, so small groups stay on the town and shop pages. Prices are never stored.

## When Agroha gets shops

Set `"status": "live"` for `agroha-haryana` in `site_data.py`, add its pages to the templates
(it currently uses `town_soon.html`), re-run both scripts, and update the store text in
`plans/villkro-store-listing.md`.
