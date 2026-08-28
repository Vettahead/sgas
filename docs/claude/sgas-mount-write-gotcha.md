---
name: sgas-mount-write-gotcha
description: Sandbox mount keeps stale tail bytes when the Write tool shrinks a file
metadata: 
  node_type: memory
  type: reference
  originSessionId: 37fa9fa9-1677-4be0-b37a-8f7f4478acf3
---

In this environment, when the Write/Edit tool overwrites a file with SHORTER content, the Linux sandbox mount (`/sessions/.../mnt/...`) can keep stale trailing bytes from the previous longer version — seen as either truncation or NUL (`\0`) padding. This breaks `vite build`/esbuild with cryptic "Unexpected end of file" or "Unexpected character '\\0'" errors even though the Read tool (Windows side) shows correct content.

Fix: rewrite the affected file from the sandbox side via bash (`cat > file << 'EOF' ... EOF` or `printf`), which writes the mount cleanly, then rebuild. To detect: `for f in $(find src -type f); do grep -qP '\x00' "$f" && echo "NUL: $f"; done`. Relevant to [[sgas-frontend]].

CONFIRMED AGAIN 8 Jun 2026 (and worse than thought): ANY Edit/Write that CHANGES a file's length — including GROWING it — can leave the bash mount view truncated/stale, while the Read tool (Windows side) shows the file 100% correct. So `cp`-ing src from the mount into /tmp picks up the truncated versions and `vite build` fails mid-file. Reliable workflow when you must build/verify in the sandbox: after editing with Edit/Write, REWRITE each changed file via bash heredoc to the mount (heredoc writes propagate correctly to BOTH the mount AND the Windows/Read view — verified), THEN `cp` to a fresh /tmp dir and build. Also: a stale `/tmp/sgasbuild` from a previous session may be owned by another uid (rm → "Permission denied"); just use a new dir name like `/tmp/sgasv2`. node_modules on the mount is Windows-native (rollup `@rollup/rollup-linux-x64-gnu` missing) so you MUST `npm install` fresh in the /tmp copy to build on Linux.

## Git lock files (28 Aug 2026)

The mount refuses `unlink` by default, so **git cannot delete its own
`.git/index.lock`**. Every `git add` / `git commit` succeeds but leaves the lock
behind, and the *next* git write dies with:

    fatal: Unable to create '.../.git/index.lock': File exists.

`mv`-ing the lock aside clears one command's worth, then the next one recreates
it. The actual fix is to ask for delete permission on the connected folder once
per session (`device_request_delete_permission` on
`C:\Users\chris\Documents\Claude\Projects\Sgas project`), after which
`rm -f .git/*.lock` works and git behaves normally for the rest of the session.

Do this BEFORE the first commit of a session rather than after it fails. The same
restriction is why `vite build` dies in `emptyDir` — `npx vite build
--emptyOutDir false` is the workaround if you would rather not ask.
