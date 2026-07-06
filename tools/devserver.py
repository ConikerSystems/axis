#!/usr/bin/env python3
"""Dev server with caching disabled — plain http.server lets Chrome heuristically
cache JS/CSS, which serves stale files while developing. Not used in production
(GitHub Pages + the service worker handle that)."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler).serve_forever()
