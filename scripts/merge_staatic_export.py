"""Merge a reviewed Books Staatic export into the curated static site.

Dry run by default. The merge does not delete destination-only files. It
publishes WordPress's original postmap, keeps curated robots and redirector files, and
refreshes the canonical feed and sitemap that the Worker serves.
"""

import argparse
from collections import Counter
from html import escape
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


def site_file(root: Path, url_path: str) -> Path:
    relative = url_path.lstrip("/")
    if not relative or url_path.endswith("/"):
        relative += "index.html"
    return root / relative


def prepared_content(path: Path, relative: Path) -> bytes:
    """Preserve canonical comment threads and repair Staatic's local font URLs."""
    content = path.read_bytes()
    if relative.suffix == ".css":
        return content.replace(b"/:8080/wp-content/", b"/wp-content/")
    if relative.suffix != ".html" or b"<comentario-comments" not in content:
        return content

    page_path = "/" + relative.parent.as_posix().strip("./") + "/"
    if page_path == "//":
        page_path = "/"

    def set_identity(match: re.Match[bytes]) -> bytes:
        tag = re.sub(rb'\s+(?:page-id|domain-id)="[^"]*"', b"", match.group())
        identity = (f' domain-id="e0ff7c95-eedf-4e45-8059-d805b2273b2b"'
                    f' page-id="{page_path}"').encode("ascii")
        return tag[:-1] + identity + b">"

    return re.sub(rb"<comentario-comments\b[^>]*>", set_identity, content)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true", help="Fail if the export has not been merged")
    args = parser.parse_args()
    if args.apply and args.check:
        parser.error("--apply and --check cannot be combined")

    repo = args.repo.resolve()
    source = repo / ".staatic-export"
    site = repo / "site"
    if not (repo / "worker.mjs").is_file() or not (source / "index.html").is_file() or not site.is_dir():
        raise RuntimeError("Unexpected Books repository or incomplete export")

    files = sorted(path for path in source.rglob("*") if path.is_file())
    if len(files) < 400 or any(path.is_symlink() for path in files):
        raise RuntimeError("Export is incomplete or contains a symlink")
    allowed_extensions = {".css", ".html", ".jpg", ".js", ".png", ".ttf", ".txt", ".webp", ".woff2", ".xml", ".xsl"}
    if any(path.suffix.lower() not in allowed_extensions | {".json"} for path in files):
        raise RuntimeError("Export contains an unexpected file type")

    raw_map = json.loads((source / "postmap.json").read_text(encoding="utf-8"))
    if set(raw_map) != {"map"} or not isinstance(raw_map["map"], dict):
        raise RuntimeError("Unexpected WordPress postmap format")
    wordpress_map_path = Path(
        r"C:\Repos\neil\code\neilennis.com\books.neilennis.com\wordpress_data\postmap.json"
    )
    if not wordpress_map_path.is_file():
        raise RuntimeError(f"WordPress source postmap is missing: {wordpress_map_path}")
    wordpress_map = json.loads(wordpress_map_path.read_text(encoding="utf-8"))
    if wordpress_map != raw_map:
        raise RuntimeError(
            "The Staatic postmap differs from the WordPress source. "
            "Run a new full publication before syncing."
        )
    existing_map = json.loads((site / "postmap.json").read_text(encoding="utf-8"))
    if not isinstance(existing_map, dict):
        raise RuntimeError("Unexpected public postmap format")
    existing_ids = existing_map.get("map", existing_map)
    if not isinstance(existing_ids, dict):
        raise RuntimeError("Unexpected public postmap entries")
    added_ids = {}
    for post_id, slug in raw_map["map"].items():
        if post_id in existing_ids:
            continue
        if not post_id.isdecimal() or not isinstance(slug, str) or "/" in slug:
            raise RuntimeError(f"New ID {post_id} needs manual mapping")
        destination = f"/{slug}/"
        if not site_file(source, destination).is_file():
            raise RuntimeError(f"New ID {post_id} has no exported page")
        added_ids[post_id] = destination

    copy_ops = []
    skipped = Counter()
    for path in files:
        relative = path.relative_to(source)
        if relative.as_posix() in {"robots.txt", "p/index.html"}:
            skipped["curated root file"] += 1
            continue
        if relative.parts[0] == "wp-json" or (len(relative.parts) == 1 and relative.name.startswith("wp-sitemap")):
            skipped["unneeded WordPress service file"] += 1
            continue
        destination = site / relative
        prepared = prepared_content(path, relative)
        if destination.is_file() and destination.read_bytes() == prepared:
            skipped["identical"] += 1
            continue
        copy_ops.append((path, destination, "replace" if destination.exists() else "new", prepared if prepared != path.read_bytes() else None))

    # The Worker serves /feed.xml, while Staatic stores the RSS response at
    # /feed/index.html. Keep the Worker's route current.
    feed = (source / "feed" / "index.html").read_bytes()
    if ET.fromstring(feed).tag != "rss":
        raise RuntimeError("Exported feed is not RSS")
    feed_target = site / "feed.xml"

    # Preserve every existing canonical URL and add newly exported pages from
    # WordPress's sitemap fragments when their files exist in either tree.
    old_sitemap = ET.parse(site / "sitemap.xml").getroot()
    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = {node.text for node in old_sitemap.findall("s:url/s:loc", namespace) if node.text}
    original_url_count = len(urls)
    for fragment in source.glob("wp-sitemap-*.xml"):
        xml = ET.parse(fragment).getroot()
        for node in xml.findall("s:url/s:loc", namespace):
            path = urlparse(node.text or "").path
            if path and (site_file(source, path).is_file() or site_file(site, path).is_file()):
                urls.add("https://books.neilennis.com" + path)
    for destination in added_ids.values():
        urls.add("https://books.neilennis.com" + destination)
    if any("https://books.neilennis.com" + destination not in urls for destination in added_ids.values()):
        raise RuntimeError("A new page is absent from the resulting sitemap")
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               + "".join(f"  <url><loc>{escape(url)}</loc></url>\n" for url in sorted(urls))
               + "</urlset>\n").encode("utf-8")
    sitemap_target = site / "sitemap.xml"
    feed_changed = feed_target.read_bytes() != feed
    sitemap_changed = sitemap_target.read_bytes() != sitemap

    print(f"Export files: {len(files)}")
    print(f"Copy: {Counter(action for _, _, action, _ in copy_ops)}; skipped: {dict(skipped)}")
    print(f"New shortlinks: {added_ids or 'none; already mapped'}")
    print(f"Sitemap: {original_url_count} existing URLs, {len(urls) - original_url_count} added")
    print(f"RSS: {'update' if feed_changed else 'unchanged'}")
    if args.check:
        if copy_ops or feed_changed or sitemap_changed:
            raise SystemExit("The export has changed. Run Prepare and review the preview before publishing.")
        print("The reviewed export is fully merged.")
        return
    if not args.apply:
        print("Dry run only. Use --apply after review.")
        return

    for path, destination, _, prepared in copy_ops:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if prepared is None:
            shutil.copy2(path, destination)
        else:
            destination.write_bytes(prepared)
    if feed_changed:
        feed_target.write_bytes(feed)
    if sitemap_changed:
        sitemap_target.write_bytes(sitemap)
    print("Merged into site/ without deleting destination-only files.")


if __name__ == "__main__":
    main()
