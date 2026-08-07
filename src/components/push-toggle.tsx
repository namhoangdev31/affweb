"use client";

import { useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { savePushSubscriptionAction } from "@/app/app/actions";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "enabled" | "unsupported">("idle");

  async function enable() {
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    setState("loading");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState("idle");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    try {
      await savePushSubscriptionAction(subscription, navigator.userAgent);
      setState("enabled");
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
      <div>
        <p className="font-medium">Thông báo đẩy</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Chỉ hỏi quyền sau khi bạn bấm bật. Nội dung khóa màn hình không chứa số tiền hay PII.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={enable}
        disabled={state === "loading" || state === "enabled"}
      >
        {state === "loading" ? (
          <Loader2 className="animate-spin" />
        ) : state === "enabled" ? (
          <Bell />
        ) : state === "unsupported" ? (
          <BellOff />
        ) : (
          <Bell />
        )}
        {state === "enabled"
          ? "Đã bật"
          : state === "unsupported"
            ? "Không hỗ trợ"
            : "Bật thông báo"}
      </Button>
    </div>
  );
}
