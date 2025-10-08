import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Simple Task Manager built with Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // ここに suppressHydrationWarning を付ける
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* 初回レンダ直前に <html> に .dark を付与（localStorage の theme を反映） */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  try {
    var theme = localStorage.getItem('theme');
    var enable = theme === 'dark';
    document.documentElement.classList.toggle('dark', enable);
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
