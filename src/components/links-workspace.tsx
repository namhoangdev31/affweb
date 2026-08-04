"use client";

import { Clock3, ExternalLink, History, ImageIcon, Link2, MousePointerClick } from "lucide-react";
import { LinkBuilder } from "@/components/link-builder";
import { PaginationNav } from "@/components/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatVnd } from "@/lib/utils";

export type LinkHistoryItem = {
  id: string;
  redirectUrl: string;
  originUrl: string;
  platform: string;
  targetType: string;
  createdAt: string;
  clickedAt: string | null;
  shareBps: number;
  withholdingTaxBps: number;
  product: {
    title: string;
    shopName: string | null;
    imageUrl: string | null;
    priceVnd: string | null;
  } | null;
};

type CampaignItem = {
  id: string;
  name: string;
  merchantName: string;
  platform: string;
};

export function LinksWorkspace({
  campaigns,
  history,
  historyActive,
  currentPage,
  totalHistory,
  pageSize
}: {
  campaigns: CampaignItem[];
  history: LinkHistoryItem[];
  historyActive: boolean;
  currentPage: number;
  totalHistory: number;
  pageSize: number;
}) {
  return (
    <Tabs defaultValue={historyActive ? "history" : "create"} className="gap-6">
      <TabsList className="h-11 rounded-xl p-1">
        <TabsTrigger value="create" className="rounded-lg px-4">
          <Link2 className="size-4" /> Tạo link
        </TabsTrigger>
        <TabsTrigger value="history" className="rounded-lg px-4">
          <History className="size-4" /> Lịch sử ({totalHistory})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="create">
        <LinkBuilder campaigns={campaigns} />
      </TabsContent>

      <TabsContent value="history" className="space-y-4">
        <Card className="hidden overflow-hidden py-0 md:block">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Sản phẩm / URL</TableHead>
                <TableHead>Nền tảng</TableHead>
                <TableHead>Tỷ lệ</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead>Click</TableHead>
                <TableHead className="pr-5 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-sm pl-5 whitespace-normal">
                    <p className="line-clamp-1 font-medium">
                      {item.product?.title ?? `${item.targetType} · ${item.platform}`}
                    </p>
                    <p className="max-w-sm truncate text-xs text-muted-foreground">
                      {item.originUrl}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.platform.replaceAll("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>{item.shareBps / 100}%</TableCell>
                  <TableCell>{new Date(item.createdAt).toLocaleString("vi-VN")}</TableCell>
                  <TableCell>{item.clickedAt ? "Đã mở" : "Chưa mở"}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button asChild size="sm" variant="outline">
                      <a href={item.redirectUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Mở
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-4 md:hidden">
          {history.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="grid gap-4 p-4 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
                <div className="aspect-square overflow-hidden rounded-2xl border bg-muted">
                  {item.product?.imageUrl ? (
                    // Product image URL is a server-stored Shopee snapshot.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.title}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground">
                      <ImageIcon className="size-8" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{item.platform.replaceAll("_", " ")}</Badge>
                    <Badge variant="outline">{item.shareBps / 100}% tỷ lệ hoàn</Badge>
                    {item.withholdingTaxBps > 0 ? (
                      <Badge variant="outline">{item.withholdingTaxBps / 100}% thuế ước tính</Badge>
                    ) : null}
                  </div>
                  <div>
                    <p className="line-clamp-2 font-semibold">
                      {item.product?.title ?? `${item.targetType} · ${item.platform}`}
                    </p>
                    {item.product?.shopName ? (
                      <p className="text-xs text-muted-foreground">{item.product.shopName}</p>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground" title={item.originUrl}>
                    {item.originUrl}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock3 className="size-3.5" />
                      {new Date(item.createdAt).toLocaleString("vi-VN")}
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="size-3.5" />
                      {item.clickedAt ? "Đã mở link" : "Chưa mở link"}
                    </span>
                    {item.product?.priceVnd !== null && item.product?.priceVnd !== undefined ? (
                      <span>{formatVnd(BigInt(item.product.priceVnd))}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex gap-2 sm:flex-col">
                  <Button asChild size="sm" className="flex-1 rounded-full">
                    <a href={item.redirectUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="size-4" /> Mở link
                    </a>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        new URL(item.redirectUrl, window.location.origin).toString()
                      )
                    }
                  >
                    Sao chép
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {!history.length ? (
          <div className="rounded-3xl border border-dashed p-12 text-center">
            <History className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 font-semibold">Bạn chưa tạo link nào.</p>
            <p className="text-sm text-muted-foreground">
              Link mới sẽ xuất hiện ở đây cùng tỷ lệ đã snapshot.
            </p>
          </div>
        ) : (
          <PaginationNav
            currentPage={currentPage}
            totalItems={totalHistory}
            pageSize={pageSize}
            pathname="/app/links"
            query={{ tab: "history" }}
            itemLabel="link"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
