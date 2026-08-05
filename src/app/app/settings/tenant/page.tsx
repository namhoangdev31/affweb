import type { Route } from "next";
import { redirect } from "next/navigation";

export default function LegacyTenantSettingsPage() {
  redirect("/tenant/settings" as Route);
}
