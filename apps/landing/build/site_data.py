"""Facts the website is built from: towns, villages and how app categories
become dish pages. Page text lives in strings.py; the real shop menus come
from data/catalog.json (written by fetch_catalog.py)."""

SITE = "https://villkro.in"
PLAY = "https://play.google.com/store/apps/details?id=com.yashsiwach.villkro"
APPLE = "https://apps.apple.com/in/app/villkro-smart-food-delivery/id6800449391"
WHATSAPP = "918295445939"
WHATSAPP_SHOWN = "+91 82954 45939"
EMAIL = "decodelabsofficial@gmail.com"
INSTAGRAM = "https://instagram.com/villkro"

# A town is "live" when customers can order there today, "soon" when the
# delivery zone exists but no shops sell yet. Change status by hand: the
# build only warns when a "soon" town starts showing shops.
TOWNS = {
    "gorakhpur-haryana": {
        "status": "live",
        "zone": "Gorakhpur In",       # zone whose centre is used to read the catalog
        "postal": "125047",
        # Census village Gorakhpur(52) is in Fatehabad district. The 125047
        # postal division is Hissar, which is easy to mistake for the district.
        "district": "Fatehabad",
    },
    "agroha-haryana": {
        "status": "soon",
        "zone": "Agroha",
        "postal": None,
        "district": "Hisar",
    },
}

# Villages around Gorakhpur covered by the app's delivery zones (14 Oct 2026).
# Shown on the Gorakhpur page only; no page per village (thin, doorway-like).
VILLAGES = {
    "gorakhpur-haryana": ["Siwani", "Chaubara", "Mochi", "Khajuri", "Jandli", "Dahaman", "Kumariya", "Saberwas"],
}

# App category name -> dish page. A dish page is built only when it has at
# least MIN_DISH_ITEMS items that were available when the catalog was read.
MIN_DISH_ITEMS = 6
DISH_GROUPS = [
    {"slug": "pizza", "icon": "i-pizza", "cats": ["Pizzas & Fries"]},
    {"slug": "burgers-sandwiches", "icon": "i-burger", "cats": ["Burgers & Sandwiches"]},
    {"slug": "indian-food", "icon": "i-bowl", "cats": ["Veg Gravy", "Veg Food", "Roti's and Naan", "Paratha"]},
    {"slug": "chicken", "icon": "i-drumstick", "cats": ["Non-Veg Food", "Non-Veg Gravy"]},
    {"slug": "sweets", "icon": "i-candy", "cats": ["Barfi", "Fresh & Hot", "Laddus", "Milk Sweets", "Sweets", "Traditional"]},
    {"slug": "chaat-samosa", "icon": "i-chaat", "cats": ["Snacks 1", "Chaat !", "Salads"]},
    {"slug": "cakes", "icon": "i-cake", "cats": ["Cake & Pastry"]},
    {"slug": "vegetables-fruits", "icon": "i-carrot", "cats": ["Vegetables", "Fruits"]},
    {"slug": "namkeen-chips", "icon": "i-chips", "cats": ["Bujia", "Chips", "Biscuits"]},
    {"slug": "cold-drinks", "icon": "i-cup", "cats": ["Cold Drinks", "Energy Drinks", "Juices", "Shakes", "Drinks", "Ice Cream"]},
    {"slug": "dairy", "icon": "i-milk", "cats": ["Dairy Products"]},
]

# Hand-picked item names for the floating hero photos (first match wins;
# missing names are skipped, so a menu change never breaks the build).
HERO_PICKS = ["Kaju Katli", "Paneer + Corn Pizza", "Chicken Tikka", "Gulab Jamun", "Mix Furit Chaat", "Paneer Tikki Burger"]

# Pages that exist in both English and Hindi (path without the /hi prefix).
HINDI_PAGES = ["/", "/delivery/gorakhpur-haryana/", "/delivery/agroha-haryana/", "/app/", "/about/",
               "/sell-on-villkro/", "/deliver-with-villkro/"]
