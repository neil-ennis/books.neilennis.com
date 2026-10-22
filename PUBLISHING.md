# Publishing a Books post

Keep using your familiar WordPress process:

1. Write and publish the post in the local Books WordPress site.
2. Update
   C:\Repos\neil\code\neilennis.com\books.neilennis.com\wordpress_data\postmap.json.
3. Run a full-site publication in Staatic, using its configured local-folder
   destination. Wait for Staatic to finish successfully.
4. Double-click C:\Repos\books.neilennis.com\sync-books.cmd.

The command copies the completed export from .staatic-export into site/,
skips byte-identical files, keeps the site's special files, refreshes its
feed and sitemap, and checks links and shortlinks. It does not ask for a post
ID or slug. It does not commit, push, or change the live website.

Review the changed files in GitHub Desktop. When satisfied, commit and push
the Books repository. Cloudflare builds the pushed main branch. Check the
new post and its shortlink on the live site after the build succeeds.

## Why not export straight into site/?

Staatic could be pointed there, but its raw output would overwrite the
site's adjusted redirector and robots file, omit the Worker's feed.xml
update, and restore incorrect comment IDs and local font paths. The sync
command performs those small adjustments and keeps restored files that
Staatic does not emit. This is safer than an unfiltered RoboCopy.

Staatic rebuilds more than the new post. Archive pages, the homepage, RSS,
and older pages with a Recent Posts list can change when a post is added.
RoboCopy also considers timestamps and sizes; the sync command compares
file contents and skips identical files.

If the sync command stops, read the message in its window. Its detailed
link-check report is in C:\Repos\books.neilennis.com\.local\books-site-check.log.
