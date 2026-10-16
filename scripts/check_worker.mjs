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
  return worker.fetch(new Request(`https://${host}${path}`), env);
}

for (const [id, destination] of Object.entries(maps["/postmap.json"])) {
  const actual = await response(`/p/${id}`);
  assert.equal(actual.status, 301, `post ID ${id}`);
  assert.equal(actual.headers.get("location"), new URL(destination, "https://books.neilennis.com").href);
}
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

console.log(`Worker redirects passed for ${Object.keys(maps["/postmap.json"]).length} post IDs and key aliases.`);
