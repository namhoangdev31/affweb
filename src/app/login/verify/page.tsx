import type { Route } from "next";
import { redirect } from "next/navigation";

export default function LegacyVerifyPage() {
  redirect("/sign-in" as Route);
}
