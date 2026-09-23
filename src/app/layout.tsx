import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { ThemeProvider, themeScript } from "@/components/ThemeProvider";
import AIActivityPanel from "@/components/AIActivityPanel";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Inkshore Studio",
    template: "%s · Inkshore Studio",
  },
  description:
    "Build your story bible, draft chapters with AI that knows your book, and export a finished manuscript.",
  applicationName: "Inkshore Studio",
  icons: { icon: "/logo.svg", apple: "/logo.png" },
  openGraph: {
    title: "Inkshore Studio",
    description:
      "Build your story bible, draft chapters with AI that knows your book, and export a finished manuscript.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#131316" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // <html> deliberately carries no className: the inline theme script below
    // adds/removes `dark` on this element before React hydrates, and an
    // attribute React also renders is one React will compare and reject.
    // Its layout styles live in globals.css instead. suppressHydrationWarning
    // additionally covers attributes injected by browser extensions.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/* First child of <body> rather than inside <head>: Next reorders
            head content around its own preloads, and a raw inline script
            there desynchronises hydration. It still runs before the page
            paints, which is all the theme needs. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
        >
          Skip to content
        </a>
        <SessionProvider>
          <ThemeProvider>
            {children}
            <AIActivityPanel />
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "var(--surface)",
                  color: "var(--ink)",
                  border: "1px solid var(--line)",
                  // Square, like everything else in the system.
                  borderRadius: 0,
                  fontFamily: "var(--font-sans)",
                },
              }}
            />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
