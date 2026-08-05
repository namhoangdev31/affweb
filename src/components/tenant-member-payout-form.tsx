"use client";

import { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TenantMemberPayoutForm({
  beneficiaryId,
  availableVnd
}: {
  beneficiaryId: string | null;
  availableVnd: string;
}) {
  const [amount, setAmount] = useState("100000");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beneficiaryId) return;
    setLoading(true);
    const response = await fetch("/api/v1/tenant/member-payouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID()
      },
      body: JSON.stringify({ beneficiaryId, amountVnd: amount })
    });
    const body = (await response.json()) as {
      payout?: { reference?: string };
      error?: { message?: string };
    };
    setMessage(
      response.ok
        ? `Đã gửi ${body.payout?.reference ?? "yêu cầu payout"}.`
        : (body.error?.message ?? "Không thể gửi yêu cầu rút tiền.")
    );
    setLoading(false);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tenant-member-payout-amount">Số tiền VND</Label>
        <Input
          id="tenant-member-payout-amount"
          type="number"
          min="100000"
          max="500000"
          step="1000"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Khả dụng: {new Intl.NumberFormat("vi-VN").format(Number(availableVnd))} ₫
        </p>
      </div>
      <Button type="submit" disabled={!beneficiaryId || loading}>
        {loading ? <Loader2 className="animate-spin" /> : <Landmark />} Gửi yêu cầu rút tiền
      </Button>
      {!beneficiaryId ? (
        <p className="text-sm text-destructive">Hãy cấu hình tài khoản ngân hàng trước.</p>
      ) : null}
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
