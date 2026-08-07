"use client";

import { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveBeneficiaryAction } from "@/app/app/settings/actions";

export function BeneficiaryForm({
  current
}: {
  current?: { bankBin: string; accountLast4: string } | null;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await saveBeneficiaryAction({
        bankBin: String(form.get("bankBin") ?? ""),
        accountNumber: String(form.get("accountNumber") ?? ""),
        accountName: String(form.get("accountName") ?? "")
      });
      setMessage("Đã lưu an toàn. Payout tạm khóa theo thời gian bảo vệ sau thay đổi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu tài khoản.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {current ? (
        <Alert>
          <Landmark className="size-4" />
          <AlertTitle>Tài khoản hiện tại</AlertTitle>
          <AlertDescription>
            BIN {current.bankBin} · •••• {current.accountLast4}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="bankBin">Mã BIN ngân hàng (6 số)</Label>
        <Input id="bankBin" name="bankBin" inputMode="numeric" pattern="\d{6}" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="accountNumber">Số tài khoản</Label>
        <Input
          id="accountNumber"
          name="accountNumber"
          inputMode="numeric"
          pattern="\d{6,20}"
          autoComplete="off"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="accountName">Tên chủ tài khoản</Label>
        <Input id="accountName" name="accountName" autoCapitalize="characters" required />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <Landmark />} Lưu người thụ hưởng
      </Button>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}
