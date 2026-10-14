"""Exercise the production proxy against isolated CI upstreams, never live data."""
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


client = build_opener(NoRedirect())


def request(host, path, method="GET", headers=None):
    req = Request("http://127.0.0.1:8080" + path,
                  headers={"Host": host, **(headers or {})}, method=method)
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

for path in ("/", "/app/?utm_source=legacy", "/get/?source=qr&next=store"):
    status, headers, _ = request("www.villkro.in", path)
    assert status == 301, (path, status)
    assert headers.get("Location") == "https://villkro.in" + path, headers

# serveloco.app is retired: every name under it is refused, none redirect.
for host in ("serveloco.app", "www.serveloco.app", "api.serveloco.app",
             "admin.serveloco.app", "ota.serveloco.app"):
    for path, method in (("/", "GET"), ("/health", "GET"),
                         ("/api/orders?source=app", "POST"),
                         ("/manifest?channel=production", "GET")):
        status, headers, _ = request(host, path, method)
        assert status == 404 and "Location" not in headers, (host, path, status)
    # ...except the old policy links store listings still show.
    for page in ("privacy", "terms", "delete-account"):
        for path in ("/policies/" + page, "/policies/" + page + ".html"):
            status, headers, _ = request(host, path)
            assert status == 301, (host, path, status)
            assert headers.get("Location") == "https://villkro.in/" + page + "/", headers
    assert request(host, "/policies/other.html")[0] == 404, host

for path in ("/", "/app/", "/get/", "/robots.txt", "/sitemap.xml"):
    assert request("villkro.in", path)[0] == 200, path
assert request("villkro.in", "/missing-routing-check")[0] == 404

# Visitors on http:// (as Cloudflare reports it) go to https://; https
# visitors and requests that did not come through Cloudflare are served.
for path in ("/", "/app/?utm_source=legacy"):
    status, headers, _ = request("villkro.in", path, headers={"CF-Visitor": '{"scheme":"http"}'})
    assert status == 301, (path, status)
    assert headers.get("Location") == "https://villkro.in" + path, headers
assert request("villkro.in", "/", headers={"CF-Visitor": '{"scheme":"https"}'})[0] == 200
# The redirect is for the website only: apps reach the API and OTA hosts.
for host in ("api.villkro.in", "ota.villkro.in"):
    status, headers, _ = request(host, "/health", headers={"CF-Visitor": '{"scheme":"http"}'})
    assert status == 200 and "Location" not in headers, (host, status)

for suffix in ("villkro.in",):
    for service, path, method in (
        ("api", "/health", "GET"),
        ("api", "/api/orders?source=app", "POST"),
        ("api", "/socket.io/?EIO=4&transport=polling", "GET"),
        ("admin", "/", "GET"),
        ("ota", "/manifest?channel=production", "GET"),
        ("ota", "/assets?source=app", "GET"),
    ):
        host = service + "." + suffix
        # Asset contents are shared across domain aliases in production.
        # Use separate fixture keys because the mock body includes the Host.
        if path.startswith("/assets?"):
            path += "&fixture_host=" + host
        status, headers, body = request(host, path, method)
        assert status == 200 and "Location" not in headers, (host, status, headers)
        assert body == "compatibility upstream " + method + " " + host + path, body
print("www and http redirect; villkro.in service routes pass; serveloco.app is refused")
