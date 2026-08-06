import type { Route } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CircleDollarSign,
  FileSearch2,
  Gauge,
  ReceiptText,
  Scale,
  Settings2,
  Store,
  SlidersHorizontal,
  Users
} from "lucide-react";

const nav = [
  ["/admin", "Điều hành", Gauge],
  ["/admin/users", "Người dùng", Users],
  ["/admin/catalog", "Đối tác & campaign", Store],
  ["/admin/rules", "Tỷ lệ chia", SlidersHorizontal],
  ["/admin/connectors", "Connectors", Activity],
  ["/admin/reconciliation", "Đối soát", FileSearch2],
  ["/admin/ledger", "Ledger", BookOpen],
  ["/admin/payouts", "Payout", CircleDollarSign],
  ["/admin/finance/health", "Finance health", Activity],
  ["/admin/adjustments", "Adjustments", Scale],
  ["/admin/audit", "Audit log", ReceiptText],
  ["/admin/flags", "Kill switches", Settings2]
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f3f1ea] lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-r bg-[#161d1a] p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#d8bd6e]">
          Admin control plane
        </p>
        <nav className="mt-8 grid gap-1">
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href as Route}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 hover:bg-white/8 hover:text-white"
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/tenant"
          className="mt-10 flex items-center gap-2 px-3 text-sm text-white/45 hover:text-white"
        >
          <ArrowLeft className="size-4" /> User dashboard
        </Link>
      </aside>
      <main className="min-w-0 p-5 lg:p-8">{children}</main>
    </div>
  );
}
