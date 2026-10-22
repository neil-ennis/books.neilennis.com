import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "../worker.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const maps = {
  "/postmap.json": JSON.parse(readFileSync(join(root, "site/postmap.json"), "utf8")),
  "/redirects.json": JSON.parse(readFileSync(join(root, "site/redirects.json"), "utf8")),
};
const env = {
  ASSETS: {
    async fetch(request) {
      const path = (request instanceof URL ? request : new URL(request.url)).pathname;
      return Object.hasOwn(maps, path)
        ? Response.json(maps[path])
        : new Response("page", { status: 200 });
    },
  },
};

async function response(path, host = "books.neilennis.com") {
  return worker.fetch(new Request("https://" + host + path), env);
}

const postmap = maps["/postmap.json"].map || maps["/postmap.json"];
const redirects = maps["/redirects.json"];
function destinationFor(value) {
  if (/^https?:\/\//i.test(value)) return value;
  const path = value.startsWith("/") ? value : "/" + value + "/";
  return redirects[path] || path;
}

for (const [id, value] of Object.entries(postmap)) {
  const actual = await response("/p/" + id);
  assert.equal(actual.status, 301, "post ID " + id);
  assert.equal(actual.headers.get("location"), new URL(destinationFor(value), "https://books.neilennis.com").href);
}
assert.equal((await response("/p/index.html?id=695")).headers.get("location"), "https://books.neilennis.com/assassins-apprentice/");
assert.equal((await response("/p/?id=695")).headers.get("location"), "https://books.neilennis.com/assassins-apprentice/");
assert.equal((await response("/p/?695")).headers.get("location"), "https://books.neilennis.com/assassins-apprentice/");
assert.equal((await response("/?p=695")).headers.get("location"), "https://books.neilennis.com/assassins-apprentice/");
assert.equal((await response("/p/999999")).status, 404);
assert.equal((await response("/feed/")).headers.get("location"), "https://books.neilennis.com/feed.xml");
assert.equal((await response("/about-me/")).headers.get("location"), "https://books.neilennis.com/about/about-me/");
assert.equal((await response("/technical/")).headers.get("location"), "https://tech.neilennis.com/");
assert.equal((await response("/assassins-apprentice/?q=1", "www.books.neilennis.com")).headers.get("location"), "https://books.neilennis.com/assassins-apprentice/?q=1");
assert.equal((await response("/p/695", "books-neilennis-com.aged-night-bf73.workers.dev")).headers.get("location"), "https://books-neilennis-com.aged-night-bf73.workers.dev/assassins-apprentice/");
assert.equal((await response("/", "books-neilennis-com.aged-night-bf73.workers.dev")).headers.get("X-Robots-Tag"), "noindex, nofollow");

// Keep the flat map from the first Cloudflare snapshot compatible too.
maps["/postmap.json"] = Object.fromEntries(
  Object.entries(postmap).map(([id, value]) => [id, destinationFor(value)]),
);
for (const [id, destination] of Object.entries(maps["/postmap.json"])) {
  const actual = await response("/p/" + id);
  assert.equal(actual.headers.get("location"), new URL(destination, "https://books.neilennis.com").href);
}

console.log("Worker redirects passed for " + Object.keys(postmap).length + " post IDs in both map formats and key aliases.");
