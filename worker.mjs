const LIVE_HOST = "books.neilennis.com";

async function assetJson(env, url, path) {
  const response = await env.ASSETS.fetch(new URL(path, url));
  if (!response.ok) throw new Error(`Missing site data: ${path}`);
  return response.json();
}

function redirect(destination, requestUrl, status = 301) {
  const target = new URL(destination, requestUrl);
  // Keep same-site aliases on the preview address while it is reviewed.
  if (target.hostname === LIVE_HOST && requestUrl.hostname !== LIVE_HOST) {
    target.hostname = requestUrl.hostname;
  }
  return Response.redirect(target, status);
}

function withPreviewHeader(response, url) {
  if (!url.hostname.endsWith(".workers.dev")) return response;
  const result = new Response(response.body, response);
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

function oldPostId(url) {
  if (url.pathname === "/") {
    return url.searchParams.get("p") || url.searchParams.get("page_id");
  }
  const match = /^\/p\/(\d+)\/?$/.exec(url.pathname);
  if (match) return match[1];
  if (url.pathname === "/p" || url.pathname === "/p/") {
    return url.searchParams.get("id") || /^\?(\d+)(?:&|$)/.exec(url.search)?.[1];
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === `www.${LIVE_HOST}`) {
      url.hostname = LIVE_HOST;
      return Response.redirect(url, 301);
    }

    let response;
    const postId = oldPostId(url);
    if (postId && /^\d+$/.test(postId)) {
      try {
        const map = await assetJson(env, url, "/postmap.json");
        response = map[postId]
          ? redirect(map[postId], url)
          : new Response("Unknown post ID", { status: 404 });
      } catch {
        response = new Response("Shortlink map unavailable", { status: 503 });
      }
    }

    if (!response && url.pathname === "/feed/") response = redirect("/feed.xml", url);
    if (!response && url.pathname === "/wp-sitemap.xml") response = redirect("/sitemap.xml", url);
    if (!response && url.pathname.startsWith("/index.php/")) {
      response = redirect(url.pathname.slice("/index.php".length) + url.search, url);
    }
    if (!response) {
      try {
        const map = await assetJson(env, url, "/redirects.json");
        if (map[url.pathname]) response = redirect(map[url.pathname], url);
      } catch {
        response = new Response("Redirect map unavailable", { status: 503 });
      }
    }
    if (!response) response = await env.ASSETS.fetch(request);
    return withPreviewHeader(response, url);
  },
};
