"use client";

import { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    const response = await fetch("/api/v1/beneficiaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankBin: form.get("bankBin"),
        accountNumber: form.get("accountNumber"),
        accountName: form.get("accountName")
      })
    });
    const body = (await response.json()) as { error?: { message?: string } };
    setMessage(
      response.ok
        ? "Đã lưu an toàn. Payout tạm khóa theo thời gian bảo vệ sau thay đổi."
        : (body.error?.message ?? "Không thể lưu tài khoản.")
    );
    setLoading(false);
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
