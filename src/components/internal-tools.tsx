"use client";

import { useState } from "react";
import { Calculator, Check, Copy, Link2, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatVnd } from "@/lib/utils";
import { detectAffiliateIdentifiers } from "@/modules/tools/link-inspector";
import {
  calculatePersonalIncomeTax2026,
  type PersonalIncomeTaxResult
} from "@/modules/tools/tax-2026";

function parseIntegerVnd(value: string): bigint {
  const normalized = value.replace(/[.\s₫đ]/gi, "");
  if (!/^\d+$/.test(normalized)) throw new Error("Vui lòng nhập số tiền VND nguyên.");
  return BigInt(normalized);
}

export function InternalTools() {
  const [cleanInput, setCleanInput] = useState("");
  const [cleanResult, setCleanResult] = useState("");
  const [cleanError, setCleanError] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detectInput, setDetectInput] = useState("");
  const [detectError, setDetectError] = useState("");
  const [detectSubmitted, setDetectSubmitted] = useState(false);
  const [detected, setDetected] = useState<ReturnType<typeof detectAffiliateIdentifiers>>([]);
  const [gross, setGross] = useState("");
  const [insurance, setInsurance] = useState("0");
  const [dependents, setDependents] = useState("0");
  const [taxError, setTaxError] = useState("");
  const [taxResult, setTaxResult] = useState<PersonalIncomeTaxResult | null>(null);

  async function cleanLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCleaning(true);
    setCleanError("");
    setCleanResult("");
    setCopied(false);
    try {
      const response = await fetch("/api/v1/tools/clean-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanInput.trim() })
      });
      const body = (await response.json()) as {
        data?: { cleanUrl?: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.data?.cleanUrl) {
        throw new Error(body.error?.message ?? "Không thể làm sạch link.");
      }
      setCleanResult(body.data.cleanUrl);
    } catch (error) {
      setCleanError(error instanceof Error ? error.message : "Không thể làm sạch link.");
    } finally {
      setCleaning(false);
    }
  }

  function findIdentifiers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDetectError("");
    setDetectSubmitted(true);
    try {
      setDetected(detectAffiliateIdentifiers(detectInput.trim()));
    } catch (error) {
      setDetected([]);
      setDetectError(error instanceof Error ? error.message : "URL không hợp lệ.");
    }
  }

  function calculateTax(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaxError("");
    try {
      const dependentCount = Number(dependents);
      setTaxResult(
        calculatePersonalIncomeTax2026({
          monthlyGrossVnd: parseIntegerVnd(gross),
          insuranceVnd: parseIntegerVnd(insurance),
          dependents: dependentCount
        })
      );
    } catch (error) {
      setTaxResult(null);
      setTaxError(error instanceof Error ? error.message : "Dữ liệu tính thuế không hợp lệ.");
    }
  }

  return (
    <Tabs defaultValue="clean-link" className="space-y-4">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="clean-link">
          <Link2 /> Clean Link
        </TabsTrigger>
        <TabsTrigger value="find-aff-id">
          <Search /> Find AFF ID
        </TabsTrigger>
        <TabsTrigger value="tax-2026">
          <Calculator /> Thuế TNCN 2026
        </TabsTrigger>
      </TabsList>

      <TabsContent value="clean-link">
        <Card>
          <CardHeader>
            <CardTitle>Làm sạch link Shopee/Lazada</CardTitle>
            <CardDescription>
              Mở redirect theo allowlist, bỏ tracking parameter và không gọi endpoint riêng của
              AddLiveTag.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={cleanLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clean-url">Link cần làm sạch</Label>
                <Input
                  id="clean-url"
                  type="url"
                  required
                  value={cleanInput}
                  onChange={(event) => setCleanInput(event.target.value)}
                  placeholder="https://shopee.vn/..."
                />
              </div>
              <Button type="submit" disabled={cleaning}>
                {cleaning ? "Đang xử lý…" : "Làm sạch link"}
              </Button>
            </form>
            {cleanError ? (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Không thể xử lý</AlertTitle>
                <AlertDescription>{cleanError}</AlertDescription>
              </Alert>
            ) : null}
            {cleanResult ? (
              <div className="mt-4 rounded-xl border bg-muted/40 p-4">
                <p className="break-all font-mono text-sm">{cleanResult}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={async () => {
                    await navigator.clipboard.writeText(cleanResult);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check /> : <Copy />} {copied ? "Đã sao chép" : "Sao chép"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="find-aff-id">
        <Card>
          <CardHeader>
            <CardTitle>Phát hiện AFF ID trong link</CardTitle>
            <CardDescription>
              Chỉ đọc parameter/path đã biết. Kết quả là “detected”, không phải credential đã
              verify.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={findIdentifiers} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="detect-url">Affiliate URL</Label>
                <Input
                  id="detect-url"
                  type="url"
                  required
                  value={detectInput}
                  onChange={(event) => setDetectInput(event.target.value)}
                />
              </div>
              <Button type="submit">Phát hiện</Button>
            </form>
            {detectError ? (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>URL không hợp lệ</AlertTitle>
                <AlertDescription>{detectError}</AlertDescription>
              </Alert>
            ) : null}
            {!detectError && detected.length === 0 && detectSubmitted ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Không phát hiện identifier đã biết trong URL này.
              </p>
            ) : null}
            {detected.length > 0 ? (
              <div className="mt-4 space-y-2">
                {detected.map((item) => (
                  <div
                    key={`${item.provider}:${item.field}:${item.value}`}
                    className="rounded-xl border bg-muted/40 p-3"
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {item.provider} · {item.field} · detected, chưa verify
                    </p>
                    <p className="mt-1 break-all font-mono text-sm">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tax-2026">
        <Card>
          <CardHeader>
            <CardTitle>Ước tính thuế TNCN 2026</CardTitle>
            <CardDescription>
              Rule VN-PIT-109-2025-QH15-2026 cho thu nhập tiền lương/công; tách biệt hoàn toàn khỏi
              rule khấu trừ cashback tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={calculateTax} className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="tax-gross">Thu nhập gross/tháng</Label>
                <Input
                  id="tax-gross"
                  inputMode="numeric"
                  required
                  value={gross}
                  onChange={(event) => setGross(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-insurance">Bảo hiểm được trừ</Label>
                <Input
                  id="tax-insurance"
                  inputMode="numeric"
                  required
                  value={insurance}
                  onChange={(event) => setInsurance(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-dependents">Số người phụ thuộc</Label>
                <Input
                  id="tax-dependents"
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={dependents}
                  onChange={(event) => setDependents(event.target.value)}
                />
              </div>
              <Button type="submit" className="md:col-span-3 md:w-fit">
                Tính ước tính
              </Button>
            </form>
            {taxError ? (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Không thể tính</AlertTitle>
                <AlertDescription>{taxError}</AlertDescription>
              </Alert>
            ) : null}
            {taxResult ? (
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Thu nhập tính thuế</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatVnd(taxResult.taxableIncomeVnd)}
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Thuế ước tính</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatVnd(taxResult.estimatedTaxVnd)}
                  </p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">Sau bảo hiểm và thuế</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatVnd(taxResult.netAfterTaxVnd)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground md:col-span-3">
                  Chỉ là ước tính, không phải tư vấn thuế hay kết quả quyết toán. Rule version:{" "}
                  {taxResult.ruleVersion}.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
