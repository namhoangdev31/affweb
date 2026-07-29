"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Provider = "LAZADA_OPEN_API" | "ACCESSTRADE_API";

export type TenantProviderAccountView = {
  id: string;
  provider: Provider;
  label: string;
  externalAccountId: string;
  fingerprint: string | null;
  status: "ACTIVE" | "CREDENTIAL_REQUIRED";
  validationHoldDays: number | null;
};

export function TenantProviderCredentials({
  planAllowsCredentials,
  credentialFeatureEnabled,
  initialAccounts
}: {
  planAllowsCredentials: boolean;
  credentialFeatureEnabled: boolean;
  initialAccounts: TenantProviderAccountView[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [provider, setProvider] = useState<Provider>("LAZADA_OPEN_API");
  const current = accounts.find((account) => account.provider === provider) ?? null;
  const [externalAccountId, setExternalAccountId] = useState("");
  const [label, setLabel] = useState("");
  const [validationHoldDays, setValidationHoldDays] = useState("30");
  const [apiKey, setApiKey] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [userToken, setUserToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const accountIdentity = current?.externalAccountId ?? externalAccountId;

  async function saveCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let accountId = current?.id;
      if (!accountId) {
        const createResponse = await fetch("/api/v1/provider-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            externalAccountId: accountIdentity.trim(),
            label: label.trim()
          })
        });
        const created = (await createResponse.json()) as {
          data?: { id?: string };
          error?: { message?: string };
        };
        if (!createResponse.ok || !created.data?.id) {
          throw new Error(created.error?.message ?? "Không thể tạo provider account.");
        }
        accountId = created.data.id;
      }

      const credential =
        provider === "ACCESSTRADE_API"
          ? {
              provider,
              apiKey,
              publisherId: accountIdentity.trim(),
              validationHoldDays: Number(validationHoldDays)
            }
          : {
              provider,
              appKey,
              appSecret,
              userToken,
              affiliateId: accountIdentity.trim(),
              validationHoldDays: Number(validationHoldDays)
            };
      const response = await fetch(`/api/v1/provider-accounts/${accountId}/credential`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential)
      });
      const body = (await response.json()) as {
        data?: {
          fingerprint?: string;
          status?: "ACTIVE";
          validationHoldDays?: number;
        };
        error?: { message?: string };
      };
      if (!response.ok || !body.data?.fingerprint || body.data.status !== "ACTIVE") {
        throw new Error(body.error?.message ?? "Credential preflight không thành công.");
      }
      setAccounts((existing) => {
        const next: TenantProviderAccountView = {
          id: accountId,
          provider,
          label: current?.label ?? label.trim(),
          externalAccountId: accountIdentity.trim(),
          fingerprint: body.data!.fingerprint!,
          status: "ACTIVE",
          validationHoldDays: body.data!.validationHoldDays ?? Number(validationHoldDays)
        };
        return [...existing.filter((account) => account.provider !== provider), next];
      });
      setApiKey("");
      setAppKey("");
      setAppSecret("");
      setUserToken("");
      setSuccess("Credential đã qua preflight. Secret đã được xóa khỏi form.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu provider credential.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <CardTitle>Lazada / AccessTrade credential</CardTitle>
          </div>
          <Badge variant={planAllowsCredentials ? "default" : "secondary"}>
            {planAllowsCredentials ? "Khả dụng" : "Business only"}
          </Badge>
        </div>
        <CardDescription>
          Credential được nhập một lần, mã hóa phía server và chỉ hiển thị fingerprint/trạng thái.
          Order API chỉ validate; settlement vẫn cần Finance hoặc đối soát tenant bên ngoài.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!planAllowsCredentials ? (
          <p className="text-sm text-muted-foreground">
            Gói hiện tại không có entitlement cho API credential. Nâng cấp Business để cấu hình.
          </p>
        ) : !credentialFeatureEnabled ? (
          <Alert>
            <ShieldCheck />
            <AlertTitle>Đang khóa bằng kill switch</AlertTitle>
            <AlertDescription>
              Admin phải bật provider credential management sau khi encryption key và provider
              contract sẵn sàng.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={saveCredential} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider-kind">Provider</Label>
                <select
                  id="provider-kind"
                  value={provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as Provider;
                    const nextAccount =
                      accounts.find((account) => account.provider === nextProvider) ?? null;
                    setProvider(nextProvider);
                    setExternalAccountId("");
                    setLabel("");
                    setValidationHoldDays(String(nextAccount?.validationHoldDays ?? 30));
                    setApiKey("");
                    setAppKey("");
                    setAppSecret("");
                    setUserToken("");
                    setError("");
                    setSuccess("");
                  }}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="LAZADA_OPEN_API">Lazada Open API</option>
                  <option value="ACCESSTRADE_API">AccessTrade Publisher API</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-hold-days">Validation hold (4–60 ngày)</Label>
                <Input
                  id="provider-hold-days"
                  type="number"
                  min="4"
                  max="60"
                  required
                  value={validationHoldDays}
                  onChange={(event) => setValidationHoldDays(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-account-id">
                  {provider === "LAZADA_OPEN_API" ? "Lazada Affiliate ID" : "Publisher ID"}
                </Label>
                <Input
                  id="provider-account-id"
                  required
                  disabled={Boolean(current)}
                  value={accountIdentity}
                  onChange={(event) => setExternalAccountId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-label">Tên gợi nhớ</Label>
                <Input
                  id="provider-label"
                  required={!current}
                  disabled={Boolean(current)}
                  value={current?.label ?? label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Tài khoản affiliate chính"
                />
              </div>
              {provider === "ACCESSTRADE_API" ? (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="provider-api-key">AccessTrade API access key mới</Label>
                  <Input
                    id="provider-api-key"
                    type="password"
                    autoComplete="off"
                    minLength={16}
                    required
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="provider-app-key">Lazada App Key</Label>
                    <Input
                      id="provider-app-key"
                      autoComplete="off"
                      required
                      value={appKey}
                      onChange={(event) => setAppKey(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-app-secret">Lazada App Secret</Label>
                    <Input
                      id="provider-app-secret"
                      type="password"
                      autoComplete="off"
                      minLength={8}
                      required
                      value={appSecret}
                      onChange={(event) => setAppSecret(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="provider-user-token">Lazada User Token</Label>
                    <Input
                      id="provider-user-token"
                      type="password"
                      autoComplete="off"
                      minLength={8}
                      required
                      value={userToken}
                      onChange={(event) => setUserToken(event.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            {current ? (
              <p className="text-xs text-muted-foreground">
                Trạng thái: {current.status} · fingerprint:{" "}
                <span className="font-mono">{current.fingerprint ?? "chưa có"}</span>
              </p>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Không thể lưu credential</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {success ? (
              <Alert>
                <ShieldCheck />
                <AlertTitle>Preflight thành công</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? "Đang preflight…" : current ? "Rotate credential" : "Lưu và preflight"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
