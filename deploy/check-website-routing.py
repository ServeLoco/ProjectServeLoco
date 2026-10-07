"""Exercise the production proxy against isolated CI upstreams, never live data."""
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


client = build_opener(NoRedirect())


def request(host, path, method="GET"):
    req = Request("http://127.0.0.1:8080" + path,
                  headers={"Host": host}, method=method)
    try:
        response = client.open(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read().decode()


for attempt in range(30):
    try:
        if request("villkro.in", "/")[0] == 200:
            break
    except (URLError, TimeoutError):
        pass
    time.sleep(1)
else:
    raise AssertionError("Proxy or landing upstream did not become ready")

for host in ("serveloco.app", "www.serveloco.app", "www.villkro.in"):
    for path in ("/", "/app/?utm_source=legacy", "/get/?source=qr&next=store"):
        status, headers, _ = request(host, path)
        assert status == 301, (host, path, status)
        assert headers.get("Location") == "https://villkro.in" + path, headers

for path in ("/", "/app/", "/get/", "/robots.txt", "/sitemap.xml"):
    assert request("villkro.in", path)[0] == 200, path
assert request("villkro.in", "/missing-routing-check")[0] == 404

for host, path, method in (
    ("api.serveloco.app", "/health", "GET"),
    ("api.serveloco.app", "/api/orders?source=app", "POST"),
    ("admin.serveloco.app", "/", "GET"),
    ("ota.serveloco.app", "/manifest?channel=production", "GET"),
):
    status, headers, body = request(host, path, method)
    assert status == 200 and "Location" not in headers, (host, status, headers)
    assert body == "compatibility upstream " + method + " " + host + path, body
print("Website aliases redirect directly; canonical pages and compatibility routes pass")
