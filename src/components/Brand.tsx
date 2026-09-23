import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      priority
    />
  );
}

export function Wordmark({
  href = "/",
  size = 15,
  short = false,
  className,
}: {
  href?: string | null;
  size?: number;
  short?: boolean;
  className?: string;
}) {
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-[-0.02em] text-ink",
        className
      )}
      style={{ fontSize: size }}
    >
      <Logo size={Math.round(size * 1.25)} />
      {short ? "Inkshore" : "Inkshore Studio"}
    </span>
  );
  return href ? (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {inner}
    </Link>
  ) : (
    inner
  );
}
