"use client";

import { useFormStatus } from "react-dom";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TenantSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full h-13 bg-primary text-primary-foreground font-extrabold hover:bg-emerald-600 dark:hover:bg-emerald-500 text-base shadow-xl rounded-2xl transition-all cursor-pointer disabled:opacity-80"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="size-5 animate-spin text-primary-foreground" />
          Đang khởi tạo Kênh KOC của bạn...
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Building2 className="mr-2 size-5" /> Kích Hoạt Kênh KOC & Bắt Đầu Ngay (Miễn Phí 14 Ngày)
        </span>
      )}
    </Button>
  );
}
