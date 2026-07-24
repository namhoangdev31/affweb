"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <ServiceWorkerRegistration />
    </TooltipProvider>
  );
}
