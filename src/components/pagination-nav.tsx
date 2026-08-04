import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaginationNav({
  currentPage,
  totalItems,
  pageSize,
  pathname,
  query = {},
  pageParam = "page",
  itemLabel
}: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  pathname: string;
  query?: Record<string, string | undefined>;
  pageParam?: string;
  itemLabel: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const pageWindowStart = Math.min(Math.max(1, currentPage - 2), Math.max(1, totalPages - 4));
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => pageWindowStart + index
  );
  const href = (page: number) => ({
    pathname,
    query: { ...query, [pageParam]: String(page) }
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Hiển thị {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)}{" "}
        trong tổng số {totalItems} {itemLabel}
      </p>
      <nav aria-label={`Phân trang ${itemLabel}`} className="flex items-center gap-1">
        {currentPage > 1 ? (
          <Button asChild variant="outline" size="icon-sm">
            <Link href={href(currentPage - 1)} aria-label="Trang trước">
              <ChevronLeft />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon-sm" disabled aria-label="Trang trước">
            <ChevronLeft />
          </Button>
        )}

        {visiblePages.map((page) => (
          <Button
            key={page}
            asChild
            variant={page === currentPage ? "default" : "outline"}
            size="icon-sm"
          >
            <Link
              href={href(page)}
              aria-label={`Trang ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </Link>
          </Button>
        ))}

        {currentPage < totalPages ? (
          <Button asChild variant="outline" size="icon-sm">
            <Link href={href(currentPage + 1)} aria-label="Trang sau">
              <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon-sm" disabled aria-label="Trang sau">
            <ChevronRight />
          </Button>
        )}
      </nav>
    </div>
  );
}
