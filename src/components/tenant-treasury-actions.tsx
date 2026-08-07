"use client";

import { useState } from "react";
import { ArrowRightLeft, Landmark, Loader2, QrCode } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createTenantFundingOrderAction,
  transferMasterWalletToTreasuryAction,
  requestTreasuryWithdrawalAction
} from "@/app/shop/[tenantId]/treasury/actions";

export function TenantTreasuryActions({
  beneficiaryId,
  masterWalletAvailableVnd
}: {
  beneficiaryId: string | null;
  masterWalletAvailableVnd: string;
}) {
  const [amount, setAmount] = useState("100000");
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(kind: "fund" | "transfer" | "withdraw") {
    setLoading(kind);
    setMessage(null);
    try {
      if (kind === "fund") {
        const body = (await createTenantFundingOrderAction({
          amountVnd: amount,
          idempotencyKey: crypto.randomUUID()
        })) as { order?: { checkoutUrl?: string } };
        if (body.order?.checkoutUrl) window.location.assign(body.order.checkoutUrl);
        else setMessage("Funding order đã được tạo.");
      } else if (kind === "transfer") {
        await transferMasterWalletToTreasuryAction({
          amountVnd: amount,
          idempotencyKey: crypto.randomUUID()
        });
        setMessage("Đã chuyển từ ví master sang treasury.");
      } else {
        if (!beneficiaryId) throw new Error("Hãy cấu hình tài khoản ngân hàng trước.");
        const body = (await requestTreasuryWithdrawalAction({
          amountVnd: amount,
          beneficiaryId,
          idempotencyKey: crypto.randomUUID()
        })) as { payout?: { reference?: string } };
        setMessage(`Đã gửi ${body.payout?.reference ?? "yêu cầu rút quỹ"}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Giao dịch thất bại.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tenant-treasury-amount">Số tiền VND</Label>
        <Input
          id="tenant-treasury-amount"
          type="number"
          min="100000"
          max="50000000"
          step="1000"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Ví master khả dụng:{" "}
          {new Intl.NumberFormat("vi-VN").format(Number(masterWalletAvailableVnd))} ₫
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => run("fund")} disabled={loading !== null}>
          {loading === "fund" ? <Loader2 className="animate-spin" /> : <QrCode />} Nạp PayOS
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => run("transfer")}
          disabled={loading !== null}
        >
          {loading === "transfer" ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Từ ví
          master
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => run("withdraw")}
          disabled={loading !== null || !beneficiaryId}
        >
          {loading === "withdraw" ? <Loader2 className="animate-spin" /> : <Landmark />} Gửi yêu cầu
          Owner duyệt
        </Button>
      </div>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
