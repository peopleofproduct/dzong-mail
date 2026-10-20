import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegistrar } from "@/components/mail/pwa-registrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dzong Mail",
  description: "Open-source, local-first AI email client. Your data stays on your machine.",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

const themeInit = `
(function () {
  try {
    var pref = localStorage.getItem("dzong-theme") || "system";
    var dark = pref === "dark" || (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    var density = (document.cookie.match(/(?:^|;\s*)dzong-density=(\w+)/) || [])[1];
    document.documentElement.classList.toggle("density-compact", density === "compact");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The theme-init script may add .dark before hydration — that's
      // intentional, so React shouldn't warn about the className diff.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      {/* Browser extensions may inject attributes (e.g. cz-shortcut-listen)
          into <body> before hydration - suppress the resulting warning. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
        <PwaRegistrar />
      </body>
    </html>
  );
}
