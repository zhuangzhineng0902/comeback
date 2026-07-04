import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "私人教师 Agent",
  description: "初中错题辅导与知识漏洞复习"
};

const navItems = [
  { href: "/", label: "AI 老师" },
  { href: "/mistakes", label: "错题本" },
  { href: "/gaps", label: "知识漏洞" },
  { href: "/tree", label: "期末知识树" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
              <Link href="/" className="text-lg font-semibold text-ink">
                私人教师 Agent
              </Link>
              <nav className="flex gap-2 text-sm">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-ink"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
