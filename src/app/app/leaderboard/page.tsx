import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";
import { Award, Flame, Medal, ShieldCheck, Trophy, UserCheck } from "lucide-react";
import Link from "next/link";

export default async function LeaderboardPage({
  searchParams
}: {
  searchParams: Promise<{ period?: string; scope?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const period = params.period || "month";
  const scope = params.scope || "global";

  // Owned tenant check
  const ownedTenant = await db.tenant.findFirst({
    where: { ownerUserId: user.id }
  });

  // Calculate actual user rankings from Ledger / Conversions
  const userWallets = await db.walletProjection.findMany({
    orderBy: { availableVnd: "desc" },
    take: 50,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          tenant: { select: { name: true, slug: true } }
        }
      }
    }
  });

  // Anonymize user names for privacy compliance (e.g., "Nguyen V. A***")
  const rankings = userWallets.map((w, index) => {
    const rawName = w.user.name || w.user.email?.split("@")[0] || "Thành viên";
    const isCurrentUser = w.userId === user.id;

    let displayName = rawName;
    if (!isCurrentUser) {
      const parts = rawName.split(" ");
      const first = parts[0];
      const last = parts[parts.length - 1];
      if (parts.length > 1 && first && last) {
        displayName = `${first} ${last.charAt(0)}.***`;
      } else {
        displayName = `${rawName.substring(0, 3)}***`;
      }
    }

    return {
      rank: index + 1,
      userId: w.userId,
      name: displayName,
      rawName,
      isCurrentUser,
      image: w.user.image,
      tenantName: w.user.tenant?.name,
      lifetimeCashbackVnd: w.availableVnd
    };
  });

  // Current logged in user ranking info
  const currentUserRankObj = rankings.find((r) => r.isCurrentUser);
  const currentUserRank = currentUserRankObj ? currentUserRankObj.rank : ">50";
  const currentUserEarnings = rankings.find((r) => r.isCurrentUser)?.lifetimeCashbackVnd ?? 0n;

  const top1 = rankings[0];
  const top2 = rankings[1];
  const top3 = rankings[2];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-[#102c24] via-[#173b31] to-[#0a1e18] p-6 text-white shadow-xl lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-2">
            <Badge className="bg-amber-400/20 text-amber-300 hover:bg-amber-400/30">
              <Trophy className="mr-1 size-3.5" /> Bảng Vinh Danh KOC & Thành Viên
            </Badge>
            <h1 className="display-type text-3xl sm:text-4xl">Bảng xếp hạng hoàn tiền.</h1>
            <p className="max-w-xl text-sm text-emerald-100/70">
              Vinh danh những KOC và mua sắm có tổng tiền hoàn thực nhận cao nhất hệ thống. Cập nhật theo thời gian thực từ Ledger Kế toán.
            </p>
          </div>

          {/* Current User Quick Rank Card */}
          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur sm:min-w-[240px]">
            <p className="text-xs font-medium text-emerald-200/80">Thứ hạng của bạn</p>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="display-type text-3xl font-bold text-amber-400">#{currentUserRank}</span>
              <span className="text-sm font-semibold text-emerald-100">{formatVnd(currentUserEarnings)}</span>
            </div>
            <p className="mt-1 text-[11px] text-white/50">Tích lũy cashback khả dụng</p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-white/10">
          <div className="flex rounded-xl bg-black/20 p-1">
            <Link
              href="/app/leaderboard?period=month"
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                period === "month" ? "bg-emerald-600 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Tháng này
            </Link>
            <Link
              href="/app/leaderboard?period=all"
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                period === "all" ? "bg-emerald-600 text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Tất cả thời gian
            </Link>
          </div>

          {ownedTenant ? (
            <div className="flex rounded-xl bg-black/20 p-1">
              <Link
                href="/app/leaderboard?scope=global"
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  scope === "global" ? "bg-emerald-600 text-white" : "text-white/60 hover:text-white"
                }`}
              >
                Toàn hệ thống
              </Link>
              <Link
                href="/app/leaderboard?scope=tenant"
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  scope === "tenant" ? "bg-emerald-600 text-white" : "text-white/60 hover:text-white"
                }`}
              >
                Kênh KOC của tôi
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* Top 3 Podium Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Hạng 2 - Silver */}
        {top2 ? (
          <Card className="relative overflow-hidden border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-md sm:order-1">
            <div className="absolute right-3 top-3 rounded-full bg-slate-200 p-2 text-slate-700">
              <Award className="size-5" />
            </div>
            <CardHeader className="text-center pb-2">
              <Badge variant="secondary" className="mx-auto w-max bg-slate-200 text-slate-700">
                Hạng 2 — Bạc
              </Badge>
              <div className="mt-3 flex justify-center">
                <Avatar className="size-16 border-2 border-slate-300">
                  <AvatarImage src={top2.image || ""} />
                  <AvatarFallback className="bg-slate-200 font-semibold text-slate-700">
                    {top2.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="mt-2 text-base">{top2.name}</CardTitle>
              {top2.tenantName ? (
                <p className="text-xs text-muted-foreground">Kênh: {top2.tenantName}</p>
              ) : null}
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-xl font-bold text-slate-800">{formatVnd(top2.lifetimeCashbackVnd)}</p>
              <p className="text-xs text-muted-foreground">Cashback đã nhận</p>
            </CardContent>
          </Card>
        ) : null}

        {/* Hạng 1 - Gold */}
        {top1 ? (
          <Card className="relative overflow-hidden border-amber-300 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-white shadow-xl sm:order-2 sm:-translate-y-2">
            <div className="absolute right-3 top-3 rounded-full bg-amber-400 p-2 text-amber-950">
              <Trophy className="size-6" />
            </div>
            <CardHeader className="text-center pb-2">
              <Badge className="mx-auto w-max bg-amber-400 text-amber-950 hover:bg-amber-400">
                🥇 Quán Quân — Vàng
              </Badge>
              <div className="mt-3 flex justify-center">
                <Avatar className="size-20 border-4 border-amber-400 shadow-md">
                  <AvatarImage src={top1.image || ""} />
                  <AvatarFallback className="bg-amber-100 font-bold text-amber-900">
                    {top1.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="mt-2 text-lg text-amber-950">{top1.name}</CardTitle>
              {top1.tenantName ? (
                <p className="text-xs text-amber-800/70 font-medium">Kênh: {top1.tenantName}</p>
              ) : null}
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-2xl font-black text-amber-600">{formatVnd(top1.lifetimeCashbackVnd)}</p>
              <p className="text-xs text-muted-foreground">Cashback đã nhận</p>
            </CardContent>
          </Card>
        ) : null}

        {/* Hạng 3 - Bronze */}
        {top3 ? (
          <Card className="relative overflow-hidden border-amber-800/20 bg-gradient-to-b from-amber-900/5 to-white shadow-md sm:order-3">
            <div className="absolute right-3 top-3 rounded-full bg-amber-800/20 p-2 text-amber-800">
              <Medal className="size-5" />
            </div>
            <CardHeader className="text-center pb-2">
              <Badge variant="secondary" className="mx-auto w-max bg-amber-900/10 text-amber-800">
                Hạng 3 — Đồng
              </Badge>
              <div className="mt-3 flex justify-center">
                <Avatar className="size-16 border-2 border-amber-800/30">
                  <AvatarImage src={top3.image || ""} />
                  <AvatarFallback className="bg-amber-100 font-semibold text-amber-800">
                    {top3.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle className="mt-2 text-base">{top3.name}</CardTitle>
              {top3.tenantName ? (
                <p className="text-xs text-muted-foreground">Kênh: {top3.tenantName}</p>
              ) : null}
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-xl font-bold text-amber-900">{formatVnd(top3.lifetimeCashbackVnd)}</p>
              <p className="text-xs text-muted-foreground">Cashback đã nhận</p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Full Leaderboard Table (#4 to #50) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="size-5 text-amber-500" /> Bảng xếp hạng chi tiết (Top 50)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {rankings.map((item) => (
              <div
                key={item.userId}
                className={`flex items-center justify-between p-4 transition-colors ${
                  item.isCurrentUser ? "bg-amber-50/70 dark:bg-amber-950/20" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span
                    className={`grid size-8 place-items-center rounded-full text-xs font-bold ${
                      item.rank === 1
                        ? "bg-amber-400 text-amber-950"
                        : item.rank === 2
                        ? "bg-slate-300 text-slate-800"
                        : item.rank === 3
                        ? "bg-amber-800/30 text-amber-900"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    #{item.rank}
                  </span>

                  <Avatar className="size-10">
                    <AvatarImage src={item.image || ""} />
                    <AvatarFallback className="font-semibold">{item.name.charAt(0)}</AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-sm">
                        {item.name}
                      </p>
                      {item.isCurrentUser ? (
                        <Badge variant="default" className="bg-emerald-600 text-[10px]">
                          <UserCheck className="mr-0.5 size-3" /> Bạn
                        </Badge>
                      ) : null}
                    </div>
                    {item.tenantName ? (
                      <p className="text-xs text-muted-foreground">Kênh KOC: {item.tenantName}</p>
                    ) : null}
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-bold text-sm text-emerald-600">{formatVnd(item.lifetimeCashbackVnd)}</p>
                  <p className="text-[11px] text-muted-foreground">Tích lũy khả dụng</p>
                </div>
              </div>
            ))}

            {!rankings.length ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu xếp hạng.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
