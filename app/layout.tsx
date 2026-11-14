import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Callback · Practice the cold call before the interview",
  description:
    "Call an AI buyer with hidden pains and real objections, watch the interest meter react to every sentence, and get a debrief with quotes and better lines. No sign-up.",
};

export const viewport: Viewport = { themeColor: "#12141f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen">
        <Header />
        <main>{children}</main>
        <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-mute">
          Callback · The buyer speaks through ElevenLabs. A separate judge model scores every turn. Metrics are computed in code.
        </footer>
      </body>
    </html>
  );
}
