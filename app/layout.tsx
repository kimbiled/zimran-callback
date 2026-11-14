import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";
import { Header } from "@/components/Header";
import { JsReady } from "@/components/JsReady";
import { Effects } from "@/components/Effects";
import { AntdProvider } from "@/components/AntdProvider";
import { Analytics } from "@vercel/analytics/next";

const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-bricolage", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  // Absolute base for OG/Twitter image URLs: explicit site URL, else Vercel's production domain.
  metadataBase: (() => {
    const fallback = "https://zimran-callback.vercel.app";
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
    try {
      return new URL(process.env.NEXT_PUBLIC_SITE_URL || vercel || fallback);
    } catch {
      return new URL(fallback);
    }
  })(),
  title: "Callback · Practice the cold call before the interview",
  description:
    "Call an AI buyer with hidden pains and real objections, watch the interest meter react to every sentence, and get a debrief with quotes and better lines. No sign-up.",
  openGraph: {
    type: "website",
    siteName: "Callback",
    title: "Callback · Practice the cold call before the interview",
    description: "Call an AI buyer with hidden pains and real objections. Live interest meter, debrief with quotes and better lines. No sign-up.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Callback · Practice the cold call before the interview",
    description: "Call an AI buyer with hidden pains and real objections. Live interest meter, debrief with quotes and better lines. No sign-up.",
  },
};

export const viewport: Viewport = { themeColor: "#05050a", viewportFit: "cover", colorScheme: "dark" };

// Marks the document before first paint so entrance animations can start hidden.
// Without JS this never runs and every block stays visible. If the app bundle fails
// to load within 3s (JsReady sets window.__rv), the mark is removed so nothing stays hidden.
const MARK_JS =
  "(function(d){d.classList.add('js');setTimeout(function(){if(!window.__rv)d.classList.remove('js')},3000)})(document.documentElement)";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MARK_JS }} />
      </head>
      <body className="min-h-screen">
        {/* Ambient background: drifting aurora, a fading grid and film grain */}
        <div className="aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="grid-bg" aria-hidden="true" />
        <div className="noise" aria-hidden="true" />
        <div className="scroll-progress" aria-hidden="true" />

        <AntdRegistry>
          <AntdProvider>
            <Header />
            <main>{children}</main>
            <Footer />
          </AntdProvider>
        </AntdRegistry>
        <Effects />
        <JsReady />
        <Analytics />
      </body>
    </html>
  );
}
