# Books static site

This repository contains the public static copy of `books.neilennis.com` for
Cloudflare Workers Static Assets. Its editable WordPress source is in
`C:\Repos\neil\code\neilennis.com\books.neilennis.com`. Never add the
WordPress database, PHP installation, backups, caches, or credentials here.

## Contents

- `site/`: 122 public HTML pages, 367 referenced assets, RSS, sitemap, and maps
  for 71 old WordPress IDs and 11 redirected page slugs.
- `worker.mjs`: serves the site, redirects `www` to the primary domain, and
  preserves old `/p/ID`, `/p/?id=ID`, `/?p=ID`, and `/?page_id=ID` shortlinks.
  This also keeps `nbe.me/b/ID` links working because that domain sends visitors
  to `/p/ID` on this site.
- `scripts/export_public.py`: reproducible public snapshot procedure. It reads
  the source site's sitemap and postmap, follows linked pages, and downloads
  only referenced assets. If a public asset is missing, it can use an exact-path
  local WordPress copy after validating the file signature. Review every
  export before publishing because a later run against this static site would
  merely reproduce the deployed copy; updated posts require the WordPress
  source or its new public export as input.
- `scripts/check_site.py`: checks all local HTML references, mapped post IDs,
  and image signatures before deployment.
- `scripts/check_worker.mjs`: checks redirects for every mapped post ID and the
  main legacy URL forms without contacting Cloudflare.

## Deployment and updates

Cloudflare builds this Worker from the GitHub `main` branch. `wrangler.jsonc`
declares `site/` as the asset directory. Worker-first routing is required for
the legacy redirects. After changing content, run `python scripts/check_site.py`
and `node scripts/check_worker.mjs`,
and review the Cloudflare preview/build before treating the new copy as live.

The HTML retains the site's familiar WordPress appearance. Google Custom
Search, Comentario, and the Google Apps Script contact form remain external
services. The Comentario embed uses the existing Books domain and each page's
live path so the preview and live domain refer to the same thread. The preview
hostname must also be listed in that domain's allowed Comentario origins.

## Migration notes

The initial snapshot was exported on 16 October 2026 from the public AWS-hosted
site. All 122 pages were fetched successfully. Of 367 assets, 32 font files
came from the local WordPress source because the old public font URLs were
broken. No image needed a local fallback. The old AWS setup should remain
available for rollback until the new site is accepted on both live addresses.
