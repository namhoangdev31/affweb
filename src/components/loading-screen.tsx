import Image from "next/image";

export function LoadingScreen({
  title = "Đang tải dữ liệu...",
  subtitle = "Vui lòng chờ trong giây lát"
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="relative flex min-h-[60vh] w-full flex-col items-center justify-center px-4 py-16 text-foreground overflow-hidden">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 size-[30rem] rounded-full bg-emerald-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-20 left-1/2 -translate-x-1/2 size-[24rem] rounded-full bg-teal-500/10 blur-[110px]" />

      <div className="relative z-10 flex flex-col items-center space-y-6 text-center">
        {/* Animated Brand Mark / Pulse Spinner */}
        <div className="relative flex items-center justify-center">
          <div className="absolute size-20 animate-ping rounded-full bg-emerald-500/20 duration-1000" />
          <div className="relative grid size-16 place-items-center rounded-2xl border border-emerald-500/30 bg-background/80 p-3 shadow-2xl backdrop-blur-xl">
            <Image
              src="/brand-mark.svg"
              alt="Hoàn Tiền"
              width={40}
              height={40}
              className="animate-pulse"
              priority
            />
          </div>
        </div>

        {/* Loading Spinner Dots / Bar */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="size-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
          <div className="size-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]" />
          <div className="size-2 animate-bounce rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  );
}
