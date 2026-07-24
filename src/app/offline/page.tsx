import Image from "next/image";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 text-center">
      <div>
        <Image src="/brand-mark.svg" alt="" width={64} height={64} className="mx-auto" />
        <WifiOff className="mx-auto mt-8 size-8 text-muted-foreground" />
        <h1 className="display-type mt-4 text-5xl">Bạn đang ngoại tuyến.</h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          Nội dung tài chính không được cache. Hãy kết nối mạng để xem số dư, đơn hàng hoặc tạo
          payout.
        </p>
      </div>
    </main>
  );
}
