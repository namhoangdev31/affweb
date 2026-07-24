import { PublicShell } from "@/components/public-shell";

export function LegalPage({
  title,
  updated,
  children
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-5 py-20">
        <p className="text-sm text-muted-foreground">Cập nhật: {updated}</p>
        <h1 className="display-type mt-3 text-6xl">{title}</h1>
        <div className="mt-12 space-y-5 leading-7 text-muted-foreground [&_h2]:pt-5 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground">
          {children}
        </div>
      </article>
    </PublicShell>
  );
}
