const GITHUB_USER = "yiwan74";
const GITHUB_REPO = "stremio";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1. Handle Manifest Request
    if (url.pathname === "/manifest.json" || url.pathname === "/") {
      return json({
        id: "com.stremio.jimtpersubtitles",
        version: "3.0.0",
        name: "JIMTPER Subtitles",
        description: "Fully automated GitHub subtitle addon",
        types: ["movie"],
        idPrefixes: ["tt"],
        resources: ["subtitles"],
        catalogs: []
      });
    }

    // 2. Handle Subtitles Request from Stremio (e.g., /subtitles/movie/tt0306685.json)
    const match = url.pathname.match(/^\/subtitles\/movie\/(tt\d+)\.json$/);
    if (match) {
      const imdbId = match[1];

      try {
        // Query GitHub's API to see what files exist in the movie folder
        const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/subtitles/movie/${imdbId}`;
        const ghResponse = await fetch(apiUrl, {
          headers: { "User-Agent": "Cloudflare-Worker" } // GitHub API requires a User-Agent header
        });

        if (!ghResponse.ok) {
          return json({ subtitles: [] }); // No folder found yet for this movie
        }

        const files = await ghResponse.json();

        // Filter only .srt files and build the Stremio subtitle list dynamically
        const subtitlesList = files
          .filter(file => file.name.endsWith(".srt"))
          .map((file, index) => {
            // Extract language code or build a clean label from the filename
            // e.g., "tt0306685-srp-titlovi-2.srt" -> extracts "srp"
            const parts = file.name.replace(".srt", "").split("-");
            const langCode = parts[1] || "eng"; 
            
            // Turn the filename into a readable label (e.g., "srp-titlovi-2")
            const descriptiveLabel = parts.slice(2).join(" ") || file.name;

            return {
              id: `${imdbId}-${index}`,
              url: `${url.origin}/proxy-srt/${imdbId}/${file.name}`,
              lang: langCode,
              label: `[${langCode.toUpperCase }] ${descriptiveLabel}`
            };
          });

        return json({ subtitles: subtitlesList });
      } catch (err) {
        return json({ subtitles: [] });
      }
    }

    // 3. Proxy route to stream the exact .srt file content from GitHub
    if (url.pathname.startsWith("/proxy-srt/")) {
      const parts = url.pathname.split("/");
      const imdbId = parts[2];
      const fileName = parts[3];

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