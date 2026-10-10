const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.resolve(__dirname, "public");
const port = Number(process.env.PORT || 8080);
const mimeTypes = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8"
});

function respond(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (pathname.includes("\0") || pathname.includes("\\") || pathname.split("/").includes("..")) {
    res.writeHead(400);
    res.end();
    return;
  }

  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : "ok");
    return;
  }

  if (pathname === "/config.js") {
    const config = JSON.stringify({ mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" }).replace(/</g, "\\u003c");
    res.writeHead(200, { "Content-Type": mimeTypes[".js"], "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : `window.APP_CONFIG = ${config};`);
    return;
  }

  const ext = path.extname(pathname).toLowerCase();
  const relative = pathname === "/" || !ext ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(publicDir, relative);
  if (!filePath.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!mimeTypes[path.extname(filePath).toLowerCase()]) {
    res.writeHead(404);
    res.end();
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()],
      "Cache-Control": relative === "index.html" ? "no-store" : "public, max-age=300",
      "Content-Length": stat.size
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}

http.createServer(respond).listen(port, "0.0.0.0", () => {
  console.log(`Rain map server listening on http://0.0.0.0:${port}`);
});
