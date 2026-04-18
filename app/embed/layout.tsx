/**
 * Embed shell. Route-group layout that bypasses the global AIflex chrome
 * (navbar, cookie banner, InstallPrompt) so the iframe renders clean.
 *
 * Next.js allows a nested layout to redefine <html>/<body>; when Next sees
 * one it uses the closest layout to the page rather than the root one.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full bg-black">
      <body className="h-full m-0 p-0 bg-black text-white overflow-hidden">
        {children}
      </body>
    </html>
  );
}
