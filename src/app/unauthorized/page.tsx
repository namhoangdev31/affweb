import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <ShieldX className="mx-auto size-12 text-destructive" />
        <h1 className="display-type mt-5 text-5xl">Không có quyền truy cập.</h1>
        <Button asChild className="mt-7">
          <Link href="/tenant">Về dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
