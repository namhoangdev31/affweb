"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let mounted = true;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      if (!mounted) return;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller)
            setWaiting(worker);
        });
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let hadController = Boolean(navigator.serviceWorker?.controller);
    const onControllerChange = () => {
      if (hadController) {
        window.location.reload();
        return;
      }
      hadController = true;
    };
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    return () =>
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!waiting) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl border bg-card p-3 shadow-2xl">
      <RefreshCw className="size-5 text-primary" aria-hidden="true" />
      <p className="flex-1 text-sm">
        Có phiên bản mới. Cập nhật khi bạn đã hoàn tất thao tác hiện tại.
      </p>
      <Button size="sm" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>
        Cập nhật
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={() => setWaiting(null)} aria-label="Đóng">
        <X />
      </Button>
    </div>
  );
}
