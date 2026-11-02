/** The sign-in page. Self-contained: no scripts, no outside files. */
export function loginPage(opts: { failed?: boolean; tooMany?: boolean }): string {
  const message = opts.tooMany
    ? "Too many attempts. Wait a few minutes and try again."
    : opts.failed
      ? "That password isn't right. Try again."
      : "";
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in</title>
<style>
:root { color-scheme: light dark; --bg:#f6f7f8; --surface:#fff; --fg:#161b1f; --muted:#5d6872; --line:#dde2e6; --accent:#1f4fd8; --err:#8c1d18; --errbg:#fdecea; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1316; --surface:#171c20; --fg:#e8ecef; --muted:#94a0a9; --line:#2b333a; --accent:#7ea6f0; --err:#ffb4ad; --errbg:#3b1613; } }
* { box-sizing: border-box; }
body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width:100%; max-width:360px; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:24px; }
h1 { font-size:20px; margin:0 0 4px; }
p { margin:0 0 16px; color:var(--muted); }
label { display:block; font-size:13px; color:var(--muted); margin-bottom:4px; }
input { width:100%; font:inherit; color:inherit; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:10px 12px; min-height:44px; }
button { width:100%; margin-top:16px; font:inherit; font-weight:600; color:#fff; background:var(--accent); border:0; border-radius:8px; min-height:44px; cursor:pointer; }
@media (prefers-color-scheme: dark) { button { color:#0e1416; } }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.err { background:var(--errbg); color:var(--err); border-radius:8px; padding:8px 12px; margin:0 0 16px; font-size:14px; }
</style>
</head>
<body>
<main>
<h1>Product roadmap</h1>
<p>Sign in to see the roadmap.</p>
${message ? `<div class="err" role="alert">${message}</div>` : ""}
<form method="post" action="/login">
<label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" autofocus required maxlength="200">
<button type="submit">Sign in</button>
</form>
</main>
</body>
</html>`;
}
