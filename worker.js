const GITHUB_USER = "yiwan74";
const GITHUB_REPO = "stremio";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1. Handle Manifest Request
    if (url.pathname === "/manifest.json" || url.pathname === "/") {
      return json({
        id: "com.stremio.jimtpersubtitles",
        version: "3.4.0",
        name: "JIMTPER Subtitles",
        description: "Fully automated GitHub subtitle addon",
        types: ["movie"],
        idPrefixes: ["tt"],
        resources: [{
          name: "subtitles",
          types: ["movie"],
          idPrefixes: ["tt"]
        }],
        catalogs: []
      });
    }

    // 2. Handle Subtitles Request from Stremio
    const match = url.pathname.match(/^\/subtitles\/movie\/(tt\d+)\.json$/);
    if (match) {
      const imdbId = match[1];

      try {
        const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/subtitles/movie/${imdbId}`;
        const ghResponse = await fetch(apiUrl, {
          headers: { "User-Agent": "Cloudflare-Worker" }
        });

        if (!ghResponse.ok) {
          return json({ subtitles: [] });
        }

        const files = await ghResponse.json();

        const subtitlesList = files
          .filter(file => file.type === "file" && file.name.toLowerCase().endsWith(".srt"))
          .map((file, index) => {
            const cleanName = file.name.replace(".srt", "");
            const languageMatch = cleanName.match(/(?:^|-)(eng|srp|hrv|bos|slv)(?:-|$)/i);
            const langCode = languageMatch ? languageMatch[1].toLowerCase() : "und";
            const variantName = cleanName
              .replace(new RegExp(`^${imdbId}-`), "")
              .replace(new RegExp(`-${langCode}(?=-|$)`, "i"), "")
              .replace(/-/g, " ") || "DEFAULT";

            return {
              id: `${imdbId}-${index}-${cleanName}`,
              url: `${url.origin}/proxy-srt/${imdbId}/${encodeURIComponent(file.name)}`,
              lang: langCode,
              label: `[${langCode.toUpperCase()}] ${variantName.toUpperCase()}`
            };
          })
          .sort((left, right) => left.lang.localeCompare(right.lang) || left.label.localeCompare(right.label));

        return json({ subtitles: subtitlesList });
      } catch (err) {
        return json({ subtitles: [] });
      }
    }

    // 3. Proxy route to stream the exact .srt file content from GitHub
    if (url.pathname.startsWith("/proxy-srt/")) {
      const parts = url.pathname.split("/");
      const imdbId = parts[2];
      const fileName = decodeURIComponent(parts.slice(3).join("/"));

      const githubSrtUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/subtitles/movie/${imdbId}/${fileName}`;

      try {
        const srtResponse = await fetch(githubSrtUrl);
        
        if (!srtResponse.ok) {
          return new Response("Subtitle file not found", { status: 404 });
        }

        const srtText = await srtResponse.text();
        
        return new Response(srtText, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store"
          }
        });
      } catch (err) {
        return new Response("Error fetching subtitle file", { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  }
};

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}