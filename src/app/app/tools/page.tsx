import { InternalTools } from "@/components/internal-tools";

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Các công cụ hỗ trợ tra cứu và tính toán hoa hồng
        </p>
        <h1 className="display-type mt-1 text-4xl">Công cụ.</h1>
      </div>
      <InternalTools />
    </div>
  );
}
