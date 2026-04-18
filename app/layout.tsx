import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieNotice from "@/components/CookieNotice";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import Onboarding from "@/components/Onboarding";
import ScrollToTop from "@/components/ScrollToTop";
import { ToastProvider } from "@/components/Toast";
import ViewModeBanner from "@/components/ViewModeBanner";
import { ThemeProvider } from "@/components/ThemeProvider";
import Analytics from "@/components/Analytics";
import SkipToContent from "@/components/SkipToContent";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://aiflex.app";

export const metadata: Metadata = {
  title: {
    default: "AIflex — Streame. Crée. Deviens réalisateur.",
    template: "%s — AIflex",
  },
  description:
    "La première plateforme de streaming où chaque spectateur peut devenir créateur. Transforme une idée en film entier grâce à l'intelligence artificielle.",
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
  ],
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#08080c" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AIflex",
  },
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: BASE_URL,
    siteName: "AIflex",
    title: "AIflex — Streame. Crée. Deviens réalisateur.",
    description:
      "La première plateforme de streaming où chaque spectateur peut devenir créateur. Transforme une idée en film entier grâce à l'intelligence artificielle.",
    images: [
      {
        url: `${BASE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "AIflex — Plateforme de création de films IA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIflex — Streame. Crée. Deviens réalisateur.",
    description:
      "La première plateforme de streaming où chaque spectateur peut devenir créateur.",
    images: [`${BASE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "google-site-verification": process.env.GOOGLE_SITE_VERIFICATION || "",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "AIflex",
              url: BASE_URL,
              description:
                "La première plateforme de streaming où chaque spectateur peut devenir créateur.",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-flex-bg text-flex-text font-sans antialiased selection:bg-flex-accent/30 selection:text-white">
        <ThemeProvider>
          <ToastProvider>
            <SkipToContent />
            <ScrollToTop />
            <ViewModeBanner />
            <Navbar />
            <main id="main-content" className="relative z-10 pt-20">{children}</main>
            <Footer />
            <CookieNotice />
            <Onboarding />
            <KeyboardShortcuts />
            <Suspense fallback={null}>
              <Analytics />
            </Suspense>
            <ServiceWorkerRegister />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
