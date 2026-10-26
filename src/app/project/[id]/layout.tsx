"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { BookOpenText, BookText, LayoutDashboard, Map, Settings2 } from "lucide-react";
import ProjectName from "@/components/ProjectName";
import ProjectTopBar from "@/components/ProjectTopBar";
import MasterCommand from "@/components/MasterCommand";
import { Wordmark } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeProvider";
import { UserMenu } from "@/components/UserMenu";
import { Container, cn } from "@/components/ui";

const TABS = [
  { href: "bible", label: "Story bible", Icon: BookOpenText },
  { href: "chapters", label: "Chapters", Icon: BookText },
  { href: "storyboard", label: "Storyboard", Icon: Map },
  { href: "book", label: "Book & cover", Icon: LayoutDashboard },
  { href: "settings", label: "Settings", Icon: Settings2 },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const isOnboarding = pathname?.includes("/onboarding");
  const isChapterWorkspace = /\/chapters\/[^/]+\/?$/.test(pathname ?? "");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-md">
        <Container className="flex h-14 items-center gap-3">
          <Wordmark href="/dashboard" />
          <ProjectName key={params.id} projectId={params.id} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!isOnboarding && <MasterCommand projectId={params.id} />}
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            <UserMenu />
          </div>
        </Container>

        {!isOnboarding && (
          <Container className="lg:hidden">
            <nav aria-label="Project sections" className="-mb-px overflow-x-auto">
              <ul className="flex min-w-max gap-1">
                {TABS.map((tab) => {
                  const href = `/project/${params.id}/${tab.href}`;
                  const active = pathname?.startsWith(href);
                  return (
                    <li key={tab.href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block whitespace-nowrap border-b-2 px-2.5 pb-2.5 pt-1 text-[13px] transition-colors",
                          active
                            ? "border-ink font-medium text-ink"
                            : "border-transparent text-ink-muted hover:text-ink"
                        )}
                      >
                        {tab.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </Container>
        )}
      </header>

      <div className="flex flex-1">
        {!isOnboarding && (
          <aside className="hidden w-52 shrink-0 border-r border-line bg-surface px-3 py-6 lg:block">
            <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">Workspace</div>
            <nav aria-label="Project sections" className="mt-4 space-y-1">
              {TABS.map(({ href, label, Icon }) => {
                const target = `/project/${params.id}/${href}`;
                const active = pathname?.startsWith(target);
                return (
                  <Link
                    key={href}
                    href={target}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                      active
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <Link href="/dashboard" className="mt-8 block border-t border-line px-3 pt-5 text-xs text-ink-muted hover:text-ink">
              ← Your library
            </Link>
          </aside>
        )}
        <div className="min-w-0 flex-1">
          {!isOnboarding && !isChapterWorkspace && <ProjectTopBar projectId={params.id} />}
          <main id="main" className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
