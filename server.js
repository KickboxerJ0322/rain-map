const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store");
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=300");
  }
}));

app.get("/config.js", (_req, res) => {
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";

  res.type("application/javascript");
  res.setHeader("Cache-Control", "no-store");
  res.send(`window.APP_CONFIG = ${JSON.stringify({ mapsApiKey })};`);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Rain map server listening on http://0.0.0.0:${PORT}`);
});
