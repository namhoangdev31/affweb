"use client";

import { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PayoutForm({
  beneficiaryId,
  availableVnd
}: {
  beneficiaryId: string | null;
  availableVnd: string;
}) {
  const [amount, setAmount] = useState("100000");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!beneficiaryId) return;
    setLoading(true);
    const response = await fetch("/api/v1/payout-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beneficiaryId, amountVnd: amount })
    });
    const body = (await response.json()) as {
      ticket?: { reference: string };
      error?: { message: string };
    };
    setMessage(
      response.ok
        ? `Đã tạo ${body.ticket?.reference}.`
        : (body.error?.message ?? "Không thể tạo payout.")
    );
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="amount">Số tiền (VND)</Label>
        <Input
          id="amount"
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
        {loading ? <Loader2 className="animate-spin" /> : <Landmark />} Tạo payout ticket
      </Button>
      {!beneficiaryId ? (
        <p className="text-sm text-destructive">
          Hãy thêm tài khoản ngân hàng trong Cài đặt trước.
        </p>
      ) : null}
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
