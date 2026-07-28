import { InternalTools } from "@/components/internal-tools";

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Công cụ nội bộ, không gọi private API của bên thứ ba
        </p>
        <h1 className="display-type mt-1 text-4xl">Công cụ.</h1>
      </div>
      <InternalTools />
    </div>
  );
}
