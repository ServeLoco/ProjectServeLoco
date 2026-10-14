"""Build every page of villkro.in into apps/landing/src from the templates,
the page text (strings.py) and the real menus (data/catalog.json).

    python3 apps/landing/build/build.py           # write the pages
    python3 apps/landing/build/build.py --check   # CI: fail if src/ is out of date

The output is plain HTML that gets committed; nginx serves it as is.
Needs Jinja2 (pip install jinja2==3.1.6).
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import quote

from jinja2 import Environment, FileSystemLoader, StrictUndefined

import site_data as D
import strings as S

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "src"
LASTMOD_FILE = HERE / "data" / "lastmod.json"
CATALOG = json.loads((HERE / "data" / "catalog.json").read_text())


def asset_version():
    h = hashlib.sha256()
    for name in ("site.css", "site.js"):
        h.update((SRC / "assets" / name).read_bytes())
    return h.hexdigest()[:8]


def nice_category(name):
    """App category names are typed by shop staff ("Chaat !", "Snacks 1")."""
    name = re.sub(r"[!]+", "", name)
    name = re.sub(r"\s+\d+$", "", name).strip()
    return {"Bujia": "Bhujia"}.get(name, name)


def thumb(src, small=False):
    return src.replace(".webp", "-s.webp") if (src and small) else src


def human_date(iso):
    d = date.fromisoformat(iso)
    return f"{d.day} {d.strftime('%B %Y')}"


# ── Catalog model ─────────────────────────────────────────────

def build_town(slug):
    town_url = f"/delivery/{slug}/"
    data = CATALOG["towns"].get(slug, {"shops": []})
    cat_to_group = {c: g["slug"] for g in D.DISH_GROUPS for c in g["cats"]}

    shops = []
    for raw in data["shops"]:
        items = []
        for it in raw["items"]:
            items.append({**it, "category": nice_category(it["category"]),
                          "group": cat_to_group.get(it["category"]),
                          "img_s": thumb(it["img"], True)})
        # Available items first; otherwise keep the shop's own order.
        items.sort(key=lambda i: not i["available"])
        menu = {}
        for it in items:
            menu.setdefault(it["category"], []).append(it)
        group_counts = {}
        for it in items:
            if it["group"]:
                group_counts[it["group"]] = group_counts.get(it["group"], 0) + 1
        shops.append({
            "name": raw["name"], "slug": raw["slug"],
            "url": f"{town_url}shops/{raw['slug']}/",
            "items": items, "menu": menu,
            "group_slugs": sorted(group_counts, key=lambda g: -group_counts[g]),
            "cover": [i for i in items if i["img"]][:3],
        })

    dishes = []
    for g in D.DISH_GROUPS:
        items = []
        for shop in shops:
            for it in shop["items"]:
                if it["group"] == g["slug"]:
                    items.append({**it, "shop": shop["name"], "shop_url": shop["url"]})
        if sum(1 for i in items if i["available"]) < D.MIN_DISH_ITEMS:
            continue
        items.sort(key=lambda i: not i["available"])
        shop_names = []
        for i in items:
            if i["shop"] not in shop_names:
                shop_names.append(i["shop"])
        dishes.append({
            "slug": g["slug"], "icon": g["icon"], "url": f"{town_url}{g['slug']}/",
            "items": items, "shops": [s for s in shops if s["name"] in shop_names],
            "cover": [i for i in items if i["img"] and i["available"]][:4],
            "en": S.DISHES["en"][g["slug"]], "hi": S.DISHES["hi"][g["slug"]],
        })
    live_slugs = {d["slug"] for d in dishes}
    for shop in shops:
        shop["dishes"] = [d for d in dishes if d["slug"] in shop["group_slugs"]]
        shop["label"] = " · ".join(S.DISHES["en"][g]["short"] for g in shop["group_slugs"][:2]) or "Local shop"
    item_count = sum(len(s["items"]) for s in shops)
    return {"slug": slug, "url": town_url, "shops": shops, "dishes": dishes, "live_dish_slugs": live_slugs,
            "item_count": item_count, "items_round": item_count // 10 * 10,
            "villages": D.VILLAGES.get(slug, []), **D.TOWNS[slug]}


def hero_picks(town):
    pool = {i["name"]: (i, s) for s in town["shops"] for i in s["items"] if i["img"] and i["available"]}
    out = []
    for name in D.HERO_PICKS:
        if name in pool:
            item, shop = pool[name]
            out.append({**item, "shop": shop["name"], "shop_url": shop["url"]})
    return out


# ── Pages ─────────────────────────────────────────────

def page(path, template, lang="en", title="", desc="", crumbs=None, schema=None, index=True, **ctx):
    return {"path": path, "template": template, "lang": lang, "title": title, "desc": desc,
            "crumbs": crumbs or [], "schema": schema or [], "index": index, "ctx": ctx}


def hi_path(path):
    return "/hi" + path


def breadcrumb_ld(url, crumbs):
    items = [{"@type": "ListItem", "position": n + 1, "name": name, "item": D.SITE + href}
             for n, (name, href) in enumerate(crumbs)]
    return {"@type": "BreadcrumbList", "@id": D.SITE + url + "#breadcrumb", "itemListElement": items}


def webpage_ld(url, title, desc, lang, crumbs=True):
    out = {"@type": "WebPage", "@id": D.SITE + url, "url": D.SITE + url, "name": title, "description": desc,
           "inLanguage": "hi-IN" if lang == "hi" else "en-IN",
           "isPartOf": {"@id": D.SITE + "/#website"}, "publisher": {"@id": D.SITE + "/#organization"}}
    if crumbs:
        out["breadcrumb"] = {"@id": D.SITE + url + "#breadcrumb"}
    return out


def org_ld():
    return {"@type": "Organization", "@id": D.SITE + "/#organization", "name": "VillKro",
            "legalName": "VillKro Private Limited", "url": D.SITE + "/", "logo": D.SITE + "/logo.png",
            "email": D.EMAIL, "telephone": "+" + D.WHATSAPP,
            "address": {"@type": "PostalAddress", "addressLocality": "Gorakhpur", "addressRegion": "Haryana",
                        "postalCode": "125047", "addressCountry": "IN"},
            "areaServed": [{"@type": "Place", "name": "Gorakhpur, Fatehabad district, Haryana"}],
            "sameAs": [D.INSTAGRAM]}


def app_ld():
    return {"@type": "MobileApplication", "@id": D.SITE + "/#app", "name": "VillKro", "url": D.SITE + "/app/",
            "operatingSystem": "Android, iOS", "applicationCategory": "ShoppingApplication",
            "publisher": {"@id": D.SITE + "/#organization"},
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR"},
            "downloadUrl": [D.PLAY, D.APPLE]}


def service_ld(town, url):
    places = [{"@type": "Place", "name": "Gorakhpur, Fatehabad district, Haryana"}] + \
             [{"@type": "Place", "name": f"{v}, near Gorakhpur, Haryana"} for v in town["villages"]]
    return {"@type": "Service", "@id": D.SITE + url + "#service",
            "name": "VillKro food and grocery delivery in Gorakhpur, Haryana",
            "serviceType": "Food and grocery delivery from local shops",
            "provider": {"@id": D.SITE + "/#organization"}, "areaServed": places,
            "availableChannel": {"@type": "ServiceChannel", "serviceUrl": D.SITE + "/app/"},
            "hoursAvailable": {"@type": "OpeningHoursSpecification",
                               "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                               "opens": "09:00", "closes": "23:00"}}


# Dish groups that are goods, not a style of cooking (kept out of servesCuisine).
PACKED_GROUPS = {"vegetables-fruits", "dairy", "cold-drinks", "namkeen-chips"}


def shop_ld(shop):
    """The shop itself, so Google can show it for local searches. Address is the
    town only (the app has no street address); the menu has names, no prices."""
    ld = {"@type": "FoodEstablishment", "@id": D.SITE + shop["url"] + "#shop", "name": shop["name"],
          "url": D.SITE + shop["url"],
          "address": {"@type": "PostalAddress", "addressLocality": "Gorakhpur", "addressRegion": "Haryana",
                      "postalCode": "125047", "addressCountry": "IN"},
          "areaServed": {"@type": "Place", "name": "Gorakhpur, Fatehabad district, Haryana"}}
    if shop["cover"]:
        ld["image"] = [D.SITE + i["img"] for i in shop["cover"]]
    if shop["group_slugs"] == ["vegetables-fruits"]:
        ld["@type"] = "GroceryStore"
        return ld
    cuisine = [S.DISHES["en"][g]["short"] for g in shop["group_slugs"] if g not in PACKED_GROUPS]
    if cuisine:
        ld["servesCuisine"] = cuisine
    ld["hasMenu"] = {"@type": "Menu", "name": shop["name"] + " menu", "hasMenuSection": [
        {"@type": "MenuSection", "name": cat,
         "hasMenuItem": [{"@type": "MenuItem", "name": i["name"], **({"image": D.SITE + i["img"]} if i["img"] else {})}
                         for i in items]}
        for cat, items in shop["menu"].items()]}
    return ld


def itemlist_ld(url, name, entries):
    return {"@type": "ItemList", "@id": D.SITE + url + "#list", "name": name,
            "itemListElement": [{"@type": "ListItem", "position": n + 1, "name": e["name"], "url": D.SITE + e["url"]}
                                for n, e in enumerate(entries)]}


def all_pages(gk, ag):
    pages = []
    fetched = human_date(CATALOG["fetched"])
    for lang in ("en", "hi"):
        t = S.T[lang]
        pre = "/hi" if lang == "hi" else ""
        home = t["crumb_home"]
        fmt = {"shops": len(gk["shops"]), "items": gk["items_round"], "villages": len(gk["villages"])}

        # Home
        url = pre + "/"
        title, desc = t["home"]["title"], t["home"]["desc"].format(**fmt)
        pages.append(page(url, "home.html", lang, title, desc, schema=[
            org_ld(), {"@type": "WebSite", "@id": D.SITE + "/#website", "name": "VillKro", "url": D.SITE + "/",
                       "inLanguage": ["en-IN", "hi-IN"], "publisher": {"@id": D.SITE + "/#organization"}},
            app_ld(), webpage_ld(url, title, desc, lang, crumbs=False)], hero=hero_picks(gk)))

        # Gorakhpur
        url = pre + gk["url"]
        tt = t["town"]
        title, desc = tt["title"], tt["desc"].format(**fmt)
        crumbs = [(home, pre + "/"), (tt["crumb"], url)]
        pages.append(page(url, "town.html", lang, title, desc, crumbs, [
            webpage_ld(url, title, desc, lang), breadcrumb_ld(url, crumbs), service_ld(gk, url),
            itemlist_ld(url, "Shops on VillKro in Gorakhpur", gk["shops"])], fetched=fetched))

        # Agroha (opening soon)
        url = pre + ag["url"]
        ta = t["agroha"]
        crumbs = [(home, pre + "/"), (ta["crumb"], url)]
        pages.append(page(url, "town_soon.html", lang, ta["title"], ta["desc"], crumbs, [
            webpage_ld(url, ta["title"], ta["desc"], lang), breadcrumb_ld(url, crumbs)]))

        # App, About, Sell, Deliver
        for key, path, tpl, extra in (("app", "/app/", "app.html", [app_ld()]),
                                      ("about", "/about/", "about.html", [org_ld()]),
                                      ("sell", "/sell-on-villkro/", "sell.html", []),
                                      ("deliver", "/deliver-with-villkro/", "deliver.html", [])):
            url = pre + path
            tp = t[key]
            crumbs = [(home, pre + "/"), (tp["crumb"], url)]
            ld = webpage_ld(url, tp["title"], tp["desc"].format(**fmt), lang)
            if key == "about":
                ld["@type"] = "AboutPage"
            pages.append(page(url, tpl, lang, tp["title"], tp["desc"].format(**fmt), crumbs,
                              [ld, breadcrumb_ld(url, crumbs)] + extra))

    # English-only catalog pages
    t = S.T["en"]
    for d in gk["dishes"]:
        e = d["en"]
        title = f"{e['name']} Delivery in Gorakhpur, Haryana | VillKro"
        desc = e["desc"].format(n=len(d["items"]), shops=len(d["shops"]))
        crumbs = [(t["crumb_home"], "/"), (t["town"]["crumb"], gk["url"]), (e["name"], d["url"])]
        pages.append(page(d["url"], "dish.html", "en", title, desc, crumbs, [
            webpage_ld(d["url"], title, desc, "en"), breadcrumb_ld(d["url"], crumbs)], dish=d, fetched=fetched))
    for s in gk["shops"]:
        title = f"{s['name']}, Gorakhpur: Menu & Home Delivery | VillKro"
        desc = (f"See the {s['name']} menu on VillKro: {len(s['items'])} items including "
                f"{', '.join(i['name'] for i in s['items'][:3])}. Order in the VillKro app for delivery in Gorakhpur, Haryana.")
        crumbs = [(t["crumb_home"], "/"), (t["town"]["crumb"], gk["url"]), (s["name"], s["url"])]
        ld = webpage_ld(s["url"], title, desc, "en")
        ld["about"] = {"@id": D.SITE + s["url"] + "#shop"}
        pages.append(page(s["url"], "shop.html", "en", title, desc, crumbs, [
            ld, breadcrumb_ld(s["url"], crumbs), shop_ld(s)], shop=s, fetched=fetched))
    return pages


# ── Render ─────────────────────────────────────────────

def render_all():
    gk, ag = build_town("gorakhpur-haryana"), build_town("agroha-haryana")
    if ag["status"] == "soon" and ag["shops"]:
        print(f"note: Agroha now has {len(ag['shops'])} shops in the app; set its status to 'live' in site_data.py when ready")
    env = Environment(loader=FileSystemLoader(HERE / "templates"), autoescape=True, undefined=StrictUndefined,
                      trim_blocks=True, lstrip_blocks=True, keep_trailing_newline=True)
    env.filters["thumb"] = thumb
    env.filters["ld"] = lambda obj: json.dumps(obj, ensure_ascii=False, indent=1).replace("</", "<\\/")
    pages = all_pages(gk, ag)
    twins = {p["path"] for p in pages}
    v = asset_version()
    out = {}
    for p in pages:
        base_path = p["path"][3:] if p["lang"] == "hi" else p["path"]
        alts = {}
        if base_path in D.HINDI_PAGES and hi_path(base_path) in twins:
            alts = {"en-IN": base_path, "hi-IN": hi_path(base_path), "x-default": base_path}
        p["alts"] = alts
        t = S.T[p["lang"]]
        html = env.get_template(p["template"]).render(
            p=p, t=t, ctx=p["ctx"], D=D, S=S, gk=gk, ag=ag, v=v,
            pre="/hi" if p["lang"] == "hi" else "",
            other_lang=(alts.get("hi-IN") if p["lang"] == "en" else alts.get("en-IN")),
            graph={"@context": "https://schema.org", "@graph": p["schema"]},
            wa=lambda text: f"https://wa.me/{D.WHATSAPP}?text=" + quote(text),
        )
        out[p["path"]] = html
    return pages, out


def sitemap(pages, lastmod):
    rows = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for p in sorted((p for p in pages if p["index"]), key=lambda p: (p["path"].startswith("/hi"), p["path"])):
        rows.append("  <url>")
        rows.append(f"    <loc>{D.SITE}{p['path']}</loc>")
        for lang, href in p["alts"].items():
            rows.append(f'    <xhtml:link rel="alternate" hreflang="{lang}" href="{D.SITE}{href}"/>')
        rows.append(f"    <lastmod>{lastmod[p['path']]['lastmod']}</lastmod>")
        rows.append("  </url>")
    rows.append("</urlset>")
    return "\n".join(rows) + "\n"


def target(path):
    return SRC / path.lstrip("/") / "index.html"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the committed pages differ from a fresh build")
    args = ap.parse_args()

    pages, out = render_all()
    old = json.loads(LASTMOD_FILE.read_text()) if LASTMOD_FILE.exists() else {}
    today = date.today().isoformat()
    lastmod = {}
    for path, html in out.items():
        digest = hashlib.sha256(html.encode()).hexdigest()[:16]
        prev = old.get(path)
        lastmod[path] = {"hash": digest, "lastmod": prev["lastmod"] if prev and prev["hash"] == digest else today}
    files = {target(path): html for path, html in out.items()}
    files[SRC / "sitemap.xml"] = sitemap(pages, lastmod)
    stale = [target(path) for path in old if path not in out]

    if args.check:
        bad = [str(f.relative_to(SRC)) for f, html in files.items() if not f.exists() or f.read_text() != html]
        bad += [str(f.relative_to(SRC)) + " (should be deleted)" for f in stale if f.exists()]
        if bad:
            print("Website pages are out of date. Run: python3 apps/landing/build/build.py")
            print("\n".join("  " + b for b in bad))
            return 1
        print(f"ok: {len(out)} pages up to date")
        return 0

    for f, html in files.items():
        f.parent.mkdir(parents=True, exist_ok=True)
        if not f.exists() or f.read_text() != html:
            f.write_text(html)
    for f in stale:
        if f.exists():
            f.unlink()
            try:
                f.parent.rmdir()
            except OSError:
                pass
    LASTMOD_FILE.write_text(json.dumps(lastmod, indent=1, sort_keys=True) + "\n")
    print(f"built {len(out)} pages ({sum(1 for p in pages if p['lang'] == 'hi')} Hindi) + sitemap.xml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
