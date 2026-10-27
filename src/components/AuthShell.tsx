import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeProvider";
import { Wordmark } from "@/components/Brand";

export default function AuthShell({ kicker, title, description, footer, children }: {
  kicker: string;
  title: string;
  description: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return <main id="main" className="grid min-h-screen bg-paper lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
    <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#214f43] px-12 py-9 text-white lg:flex xl:px-16" aria-label="About Inkshore Studio">
      <div className="absolute -right-44 -top-44 h-[560px] w-[560px] rounded-full border border-white/10" aria-hidden />
      <div className="absolute -right-32 -top-32 h-[360px] w-[360px] rounded-full border border-white/10" aria-hidden />
      <Link href="/" className="relative inline-flex w-fit items-center gap-3 text-base font-semibold tracking-tight text-white hover:opacity-80">
        <Image src="/logo.svg" alt="" width={25} height={25} priority /> Inkshore Studio
      </Link>
      <div className="relative max-w-[560px] pb-8">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.17em] text-[#b7ddc9]">A quieter place to write</p>
        <h2 className="font-[family-name:var(--font-manuscript)] text-[clamp(46px,4.7vw,70px)] leading-[1.05] tracking-[-0.035em]">The words are yours.<br /><em className="font-normal text-[#b7ddc9]">The space is here.</em></h2>
        <p className="mt-6 max-w-[44ch] text-[15px] leading-7 text-[#d7e6dc]">Keep your world, chapters, and revisions together. Write at your own pace, with help available when you want it.</p>
        <div className="mt-12 rounded-xl border border-white/20 bg-white/10 p-6 shadow-lg backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b7ddc9]">From a work in progress</p>
          <p className="mt-5 font-[family-name:var(--font-manuscript)] text-[23px] leading-[1.55]">The lighthouse had been dark for seventeen years. Tonight, it blinked three times.</p>
          <div className="mt-6 h-px w-12 bg-[#b7ddc9]" />
        </div>
      </div>
      <p className="relative text-xs text-[#b7cfc0]">Write first. Revise with intention.</p>
    </section>

    <section className="flex min-h-screen flex-col px-5 py-6 sm:px-9 lg:px-12" aria-label={title}>
      <div className="flex items-center justify-between gap-4">
        <span className="lg:hidden"><Wordmark href="/" size={16} /></span>
        <Link href="/" className="hidden text-xs text-ink-muted hover:text-accent lg:inline">← Back to Inkshore</Link>
        <ThemeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-12">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{kicker}</p>
        <h1 className="font-[family-name:var(--font-manuscript)] text-[clamp(38px,5vw,50px)] leading-tight tracking-[-0.035em] text-ink">{title}</h1>
        <p className="mt-3 text-[14px] leading-6 text-ink-muted">{description}</p>
        <div className="mt-9">{children}</div>
        <div className="mt-7 border-t border-line pt-6 text-[13px] text-ink-muted">{footer}</div>
      </div>
      <p className="text-center text-[11px] text-ink-subtle">Your writing stays in your control.</p>
    </section>
  </main>;
}
