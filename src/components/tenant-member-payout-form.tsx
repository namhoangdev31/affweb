"use client";

import { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestMemberWithdrawalAction } from "@/app/[slug]/app/actions";

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
    try {
      const result = (await requestMemberWithdrawalAction({
        beneficiaryId,
        amountVnd: amount,
        idempotencyKey: crypto.randomUUID()
      })) as { payout?: { reference?: string } };
      setMessage(`Đã gửi thành công ${result.payout?.reference ?? "yêu cầu rút tiền"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể gửi yêu cầu rút tiền.");
    } finally {
      setLoading(false);
    }
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
