"use client";

import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminPasskey({
  apiBase = "/api/admin/passkeys",
  description = "Bắt buộc trước review, approve và adjustment."
}: {
  apiBase?: string;
  description?: string;
} = {}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function register() {
    setLoading(true);
    try {
      const optionsResponse = await fetch(`${apiBase}/register/options`, {
        method: "POST"
      });
      const optionsJSON = await optionsResponse.json();
      if (!optionsResponse.ok)
        throw new Error(optionsJSON.error?.message ?? "Không thể tạo challenge.");
      const response = await startRegistration({ optionsJSON });
      const verification = await fetch(`${apiBase}/register/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response)
      });
      if (!verification.ok) throw new Error("Không thể đăng ký passkey.");
      setMessage("Passkey đã đăng ký và step-up có hiệu lực 10 phút.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey thất bại.");
    } finally {
      setLoading(false);
    }
  }

  async function stepUp() {
    setLoading(true);
    try {
      const optionsResponse = await fetch(`${apiBase}/authenticate/options`, {
        method: "POST"
      });
      const optionsJSON = await optionsResponse.json();
      if (!optionsResponse.ok)
        throw new Error(optionsJSON.error?.message ?? "Hãy đăng ký passkey trước.");
      const response = await startAuthentication({ optionsJSON });
      const verification = await fetch(`${apiBase}/authenticate/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response)
      });
      if (!verification.ok) throw new Error("Không thể xác minh passkey.");
      setMessage("Đã step-up. Finance actions mở trong 10 phút.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-5">
      <Fingerprint className="size-6 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Finance passkey</p>
        <p className="text-sm text-muted-foreground">{message ?? description}</p>
      </div>
      <Button type="button" variant="outline" onClick={register} disabled={loading}>
        Đăng ký
      </Button>
      <Button type="button" onClick={stepUp} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <Fingerprint />} Step-up
      </Button>
    </div>
  );
}
