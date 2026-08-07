"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary caught error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-8" />
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-tight">Đã xảy ra lỗi kết nối</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {error.message || "Không thể tải trang lúc này. Vui lòng thử lại."}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground/60">Mã lỗi: {error.digest}</p>
      ) : null}
      <Button onClick={() => reset()} className="mt-6 gap-2">
        <RefreshCw className="size-4" /> Thử lại
      </Button>
    </div>
  );
}
