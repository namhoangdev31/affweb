import type { Route } from "next";
import { redirect } from "next/navigation";

export default function LegacyLoginPage() {
  redirect("/sign-in" as Route);
}
