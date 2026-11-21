import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "ms-sandbox panel",
  description: "Local Microsoft 365 emulator admin (dev only)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="banner">
          Herramienta local de desarrollo. No ingresar cuentas ni secretos reales.
        </div>
        <header className="header">
          <strong>ms-sandbox</strong>
          <nav>
            <a href="/">Tenants</a>
            <a href="/health">Health</a>
          </nav>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
