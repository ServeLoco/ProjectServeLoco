"""Read the real shop menus from the public VillKro API and save them for
the website: build/data/catalog.json plus small WebP photos in
src/assets/items/. Run it when shops or menus change, then run build.py.

    python3 apps/landing/build/fetch_catalog.py

Needs network access and Pillow. Prices are not saved (they change daily).
Anything named like test data ("test", "testitem") is left out.
"""
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

import site_data

API = "https://api.villkro.in/api"
HERE = Path(__file__).resolve().parent
OUT_JSON = HERE / "data" / "catalog.json"
ITEM_DIR = HERE.parent / "src" / "assets" / "items"
TEST_RE = re.compile(r"\btest", re.I)
SIZES = {"": 320, "-s": 160}


def fetch(url, tries=4):
    """GET with a few retries: S3 and the API sometimes reset a connection."""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "villkro-website-build"})
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.read()
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def get_json(path, **query):
    return json.loads(fetch(API + path + ("?" + urllib.parse.urlencode(query) if query else "")))


def clean(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def zone_centre(zone):
    pts = zone["boundary"]
    lat = sum(p["lat"] for p in pts) / len(pts)
    lng = sum(p["lng"] for p in pts) / len(pts)
    return round(lat, 5), round(lng, 5)


def save_photo(item_id, url, previous):
    """Download once; re-download only when the source URL changes."""
    targets = {suffix: ITEM_DIR / f"{item_id}{suffix}.webp" for suffix in SIZES}
    if previous.get(item_id) == url and all(p.exists() for p in targets.values()):
        return item_id, True
    try:
        img = Image.open(io.BytesIO(fetch(url)))
        img.load()
    except OSError as error:
        print(f"! photo for item {item_id} skipped: {error}")
        return item_id, False
    img = ImageOps.exif_transpose(img).convert("RGBA")
    for suffix, size in SIZES.items():
        thumb = ImageOps.fit(img, (size, size), Image.LANCZOS, centering=(0.5, 0.5))
        thumb.save(targets[suffix], "WEBP", quality=78, method=6)
    return item_id, True


def main():
    ITEM_DIR.mkdir(parents=True, exist_ok=True)
    previous = {}
    if OUT_JSON.exists():
        old = json.loads(OUT_JSON.read_text())
        for town in old.get("towns", {}).values():
            for shop in town["shops"]:
                for item in shop["items"]:
                    previous[item["id"]] = item.get("src")

    zones = get_json("/delivery-zones")
    zones = zones.get("data", zones)
    by_name = {z["name"]: z for z in zones}

    towns, downloads = {}, []
    for slug, town in site_data.TOWNS.items():
        zone = by_name.get(town["zone"])
        if not zone:
            print(f"! zone {town['zone']!r} not found; {slug} gets no shops")
            towns[slug] = {"shops": []}
            continue
        lat, lng = zone_centre(zone)
        rows = get_json("/products", lat=lat, lng=lng, includeClosedShops=1).get("products", [])
        shops = {}
        for p in rows:
            shop, name, cat = clean(p.get("shop_name")), clean(p.get("name")), clean(p.get("category_name"))
            if not shop or not name or any(TEST_RE.search(t) for t in (shop, name, cat)):
                continue
            src = p.get("image_url") or p.get("imageUrl")
            entry = shops.setdefault(p["shop_id"], {"id": p["shop_id"], "name": shop, "slug": slugify(shop), "items": []})
            entry["items"].append({
                "id": p["id"],
                "name": name,
                "category": cat,
                "available": bool(p.get("available")),
                "src": src,
                "img": f"/assets/items/{p['id']}.webp" if src else None,
            })
            if src:
                downloads.append((p["id"], src))
        shop_list = sorted(shops.values(), key=lambda s: (-len(s["items"]), s["name"]))
        towns[slug] = {"centre": [lat, lng], "shops": shop_list}
        print(f"{slug}: {len(shop_list)} shops, {sum(len(s['items']) for s in shop_list)} items")

    with ThreadPoolExecutor(max_workers=4) as pool:
        ok = dict(pool.map(lambda a: save_photo(a[0], a[1], previous), downloads))
    print(f"photos ready: {sum(ok.values())} of {len(ok)}")
    for town in towns.values():
        for shop in town["shops"]:
            for item in shop["items"]:
                if not ok.get(item["id"]):
                    item["img"] = None

    keep = {f"{i}{s}.webp" for i, good in ok.items() if good for s in SIZES}
    for f in ITEM_DIR.glob("*.webp"):
        if f.name not in keep:
            f.unlink()

    OUT_JSON.write_text(json.dumps({"fetched": date.today().isoformat(), "towns": towns}, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT_JSON.relative_to(HERE.parent)}")


if __name__ == "__main__":
    sys.exit(main())
