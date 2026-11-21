export function renderLoginPage(opts: {
  tenantId: string;
  error?: string;
  returnTo: string;
}): string {
  const error = opts.error
    ? `<p class="error">${escapeHtml(opts.error)}</p>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ms-sandbox login</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: linear-gradient(160deg, #0f2744, #1c4d7a 45%, #f3f6f9); }
    main { width: min(420px, 92vw); background: #fff; border-radius: 12px; padding: 1.5rem;
      box-shadow: 0 18px 50px rgba(15,39,68,.25); }
    .banner { background: #fff3cd; color: #664d03; border: 1px solid #ffecb5;
      border-radius: 8px; padding: .75rem; font-size: .85rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
    p.sub { color: #5b6b7c; margin: 0 0 1rem; font-size: .9rem; }
    label { display: block; font-size: .85rem; margin: .75rem 0 .35rem; }
    input { width: 100%; box-sizing: border-box; padding: .65rem .75rem; border: 1px solid #c9d3df;
      border-radius: 8px; font: inherit; }
    button { margin-top: 1rem; width: 100%; border: 0; border-radius: 8px; padding: .75rem;
      background: #0f2744; color: #fff; font: inherit; cursor: pointer; }
    .error { color: #b42318; background: #fef3f2; border: 1px solid #fecdca;
      border-radius: 8px; padding: .6rem .75rem; }
    .hint { margin-top: 1rem; font-size: .8rem; color: #5b6b7c; }
    code { background: #f2f5f8; padding: .1rem .3rem; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <div class="banner">Herramienta local de desarrollo. No ingresar cuentas ni secretos reales.</div>
    <h1>ms-sandbox</h1>
    <p class="sub">Iniciar sesión en el tenant Contoso</p>
    ${error}
    <form method="post" action="/${opts.tenantId}/login">
      <input type="hidden" name="return_to" value="${escapeHtml(opts.returnTo)}" />
      <label for="username">Usuario</label>
      <input id="username" name="username" autocomplete="username" value="alice@contoso.test" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" value="Password1!" required />
      <button type="submit">Continuar</button>
    </form>
    <p class="hint">Demo: <code>alice@contoso.test</code> / <code>Password1!</code></p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
