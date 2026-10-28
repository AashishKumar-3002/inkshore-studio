"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Code2,
  FileText,
  HardDrive,
  LockKeyhole,
  Menu,
  Monitor,
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Undo2,
  X,
} from "lucide-react";
import styles from "./landing.module.css";

const REPO = "https://github.com/AashishKumar-3002/inkshore-studio";
export type DesktopDownloads = {
  version?: string;
  macArm?: string;
  macIntel?: string;
  windows?: string;
  appImage?: string;
  deb?: string;
};

const questions = [
  [
    "Can I use it without AI?",
    "Yes. Write, import chapters, organize your story bible, and export your manuscript without configuring an AI provider. AI is optional and is used when you choose generation, analysis, or revision actions.",
  ],
  [
    "Where does my writing live?",
    "The desktop app stores your library on your computer in an embedded database. When you request AI help, relevant text is sent to the provider you selected. Local storage does not make AI processing offline.",
  ],
  [
    "Can I use my Claude or ChatGPT subscription?",
    "On desktop, you can use the Claude and Codex subscription providers through your local sign-in. Usage counts toward your plan’s limits. Follow the sign-in instructions in Settings. Subscription modes support text; cover art needs an OpenAI API key.",
  ],
  [
    "Will AI overwrite my chapter?",
    "The chapter assistant prepares changes for you to review before applying them. You can apply a revision and return to saved originals. Finished chapters can also be locked to protect them from edits and regeneration.",
  ],
  [
    "Is Inkshore free?",
    "Inkshore Studio is MIT-licensed, and the current desktop preview does not charge for the app. API calls are billed by your provider; subscription generation uses your existing plan’s allowance. Hosted credits and subscriptions are planned separately.",
  ],
  [
    "Can I use it on my phone or sync devices?",
    "Not yet. Android, iOS, and device sync are on the roadmap. Today, each desktop installation has its own library. You can export your manuscript as Markdown, PDF, or EPUB.",
  ],
];

export default function LandingSite({
  downloads,
}: {
  downloads: DesktopDownloads;
}) {
  const [light, setLight] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  const releaseLink = `${REPO}/releases`;
  const hasDownloads = Boolean(
    downloads.macArm ||
    downloads.macIntel ||
    downloads.windows ||
    downloads.appImage ||
    downloads.deb,
  );
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={styles.site}>
      <header className={styles.wrap}>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#" className={styles.brand} aria-label="Inkshore Studio home">
            <Image src="/logo.svg" width={30} height={30} alt="" />
            Inkshore Studio
          </a>
          <button
            className={styles.menuButton}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
          <div
            id="landing-navigation"
            className={styles.navLinks}
            data-open={menuOpen}
          >
            <a href="#workspace" onClick={closeMenu}>
              Studio
            </a>
            <a href="#your-ai" onClick={closeMenu}>
              How it works
            </a>
            <a href="#questions" onClick={closeMenu}>
              FAQs
            </a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight size={12} className="inline" />
            </a>
            <a href="/login" onClick={closeMenu}>
              Sign in
            </a>
            <a href="/register" onClick={closeMenu} className={styles.navCta}>
              Start writing <ArrowRight size={15} />
            </a>
          </div>
        </nav>
      </header>

      <main id="main">
        <section
          className={`${styles.hero} ${styles.wrap}`}
          aria-labelledby="hero-heading"
        >
          <div className={styles.reveal}>
            <h1 id="hero-heading">
              Make room
              <br />
              for the story.
            </h1>
            <p>
              Plan, write, and revise your story in one place. AI is optional.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href="/register">
                Start writing <ArrowRight size={18} />
              </a>
              <a className={styles.secondary} href="#download">
                Explore desktop <ArrowDownToLine size={17} />
              </a>
            </div>
          </div>
          <div className={styles.previewArea} id="workspace">
            <div className={styles.previewTop}>
              <span className={styles.previewLabel}>
                <Monitor size={14} /> Inside the Studio
              </span>
              <div className={styles.themeSwitch} aria-label="Screenshot theme">
                <button aria-pressed={!light} onClick={() => setLight(false)}>
                  <Moon size={12} /> Dark
                </button>
                <button aria-pressed={light} onClick={() => setLight(true)}>
                  <Sun size={12} /> Light
                </button>
              </div>
            </div>
            <div className={styles.previewFrame}>
              <Image
                src={
                  light
                    ? "/screenshots/studio-writing-workspace.png"
                    : "/screenshots/studio-writing-workspace-dark.png"
                }
                alt={`Inkshore Studio chapter editor in ${light ? "light" : "dark"} mode, with a sample story called The Last Lighthouse`}
                width={1280}
                height={720}
                sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1000px) calc(100vw - 64px), 680px"
                priority
              />
            </div>
          </div>
          <div className={styles.benefits} aria-label="Studio highlights">
            <span>
              <HardDrive /> Local desktop library
            </span>
            <span>
              <Check /> Review before you apply
            </span>
            <span>
              <FileText /> Export your manuscript
            </span>
          </div>
        </section>

        <section
          className={`${styles.section} ${styles.editSection}`}
          aria-labelledby="revision-heading"
        >
          <div className={`${styles.wrap} ${styles.split}`}>
            <div>
              <p className={styles.sectionLabel}>
                <Sparkles size={15} /> A second pair of eyes
              </p>
              <h2 id="revision-heading">
                That one paragraph.
                <br />
                Let&rsquo;s make it sing.
              </h2>
              <p className={styles.sectionIntro}>
                Select a passage. Ask for a revision that still sounds like you.
              </p>
              <ul className={styles.featureList}>
                <li>
                  <Sparkles />
                  <div>
                    <strong>Ask, revise, or humanize</strong>
                    <p>Select a passage or chapter.</p>
                  </div>
                </li>
                <li>
                  <BookOpen />
                  <div>
                    <strong>Feedback you can work with</strong>
                    <p>
                      Five scores, evidence, and priorities.
                    </p>
                  </div>
                </li>
                <li>
                  <Undo2 />
                  <div>
                    <strong>
                      Keep what works. Revisit what doesn&rsquo;t.
                    </strong>
                    <p>Review changes and save versions.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div
              className={styles.passageCard}
              aria-label="Illustrative passage editing example"
            >
              <div className={styles.cardTop}>
                <span>The Last Lighthouse / Chapter 01</span>
                <span>Selected passage</span>
              </div>
              <div className={styles.passage}>
                The lighthouse had been dark for seventeen years.{" "}
                <mark>Tonight, it blinked three times.</mark>
              </div>
              <div className={styles.askBubble}>
                <Sparkles size={19} />
                <span>
                  Build tension. Keep the mystery in the details.
                </span>
              </div>
              <div className={styles.passageFooter}>
                <span>Prepare revision</span>You choose what stays.
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${styles.section} ${styles.wrap}`}
          aria-labelledby="book-heading"
        >
          <div className={styles.gridHead}>
            <h2 id="book-heading">
              A whole world.
              <br />
              One place to write it.
            </h2>
            <p>
              Keep drafts and world notes together.
            </p>
          </div>
          <div className={styles.featureGrid}>
            <article className={styles.worldCard}>
              <h3>Keep your world close.</h3>
              <p>
                Keep characters, setting, plot, and voice in a story bible.
                Import your notes.
              </p>
              <div className={styles.worldTabs}>
                <span>Characters</span>
                <span>World</span>
                <span>Plot & stakes</span>
              </div>
              <div className={styles.character}>
                <small>Character notes from a sample story</small>
                <h4>Mara, the keeper&rsquo;s daughter</h4>
                <p>She came back for answers.</p>
              </div>
            </article>
            <article className={styles.exportCard}>
              <h3>Put a book into the world.</h3>
              <p>
                Set book details, create a cover, and export.
              </p>
              <div
                className={styles.bookVisual}
                aria-label="Illustrative book cover and supported export formats"
              >
                <div className={styles.book}>
                  <small>A work in progress</small>
                  <span>
                    The Last
                    <br />
                    Lighthouse
                  </span>
                </div>
                <div className={styles.formats}>
                  <span>.epub</span>
                  <span>.pdf</span>
                  <span>.md</span>
                </div>
              </div>
            </article>
          </div>
          <div className={styles.controlBand}>
            <div>
              <PenIcon />
              <span>
                Write, import, or generate from an idea.
              </span>
            </div>
            <div>
              <LockKeyhole />
              <span>
                Lock finished chapters.
              </span>
            </div>
            <div>
              <ShieldCheck />
              <span>Local library. AI on request.</span>
            </div>
          </div>
        </section>

        <section
          id="your-ai"
          className={`${styles.section} ${styles.aiSection}`}
          aria-labelledby="ai-heading"
        >
          <div className={styles.wrap}>
            <p className={styles.sectionLabel}>Bring the AI you already use</p>
            <h2 id="ai-heading">
              Your writing partner.
              <br />
              Your choice.
            </h2>
            <p className={styles.sectionIntro}>
              Use API keys or sign in to Claude or Codex locally on desktop.
            </p>
            <div className={styles.providerRow}>
              <span className={styles.provider}>
                <Sparkles size={20} /> Claude
              </span>
              <span className={styles.provider}>
                <Code2 size={20} /> OpenAI / Codex
              </span>
              <span className={styles.provider}>
                <ArrowUpRight size={20} /> OpenRouter
              </span>
              <span className={styles.provider}>
                <LayersIcon /> Nvidia NIM
              </span>
            </div>
            <p className={styles.aiFoot}>
              Provider charges and limits apply. Desktop subscriptions support
              text only. Relevant writing goes to your chosen provider; cover
              art requires an OpenAI API key.
            </p>
          </div>
        </section>

        <section
          id="download"
          className={`${styles.section} ${styles.wrap}`}
          aria-labelledby="download-heading"
        >
          <div className={styles.downloadHeader}>
            <h2 id="download-heading">Your desk. Your studio.</h2>
            <p className={styles.sectionIntro}>
              Desktop keeps its own database. Choose your platform.
            </p>
          </div>
          <div className={styles.downloadGrid}>
            <article className={styles.downloadCard}>
              <h3>macOS</h3>
              <p>Apple Silicon, DMG</p>
              <a href={downloads.macArm ?? releaseLink}>
                {downloads.macArm
                  ? "Download for Apple Silicon"
                  : "Check macOS downloads"}
                <ArrowDownToLine size={16} />
              </a>
              <a href={downloads.macIntel ?? releaseLink}>
                {downloads.macIntel ? "Download for Intel Mac" : "Check Intel downloads"}
                <ArrowDownToLine size={16} />
              </a>
              <small>
                {downloads.version ?? "See published releases for availability"}
              </small>
            </article>
            <article className={styles.downloadCard}>
              <h3>Windows</h3>
              <p>x64, EXE installer</p>
              <a href={downloads.windows ?? releaseLink}>
                {downloads.windows ? "Download for Windows" : "Check Windows downloads"}
                <ArrowDownToLine size={16} />
              </a>
              <small>{downloads.version ?? "See published releases for availability"}</small>
            </article>
            <article className={styles.downloadCard}>
              <h3>Linux</h3>
              <p>x64, AppImage and Debian</p>
              <a href={downloads.appImage ?? releaseLink}>
                {downloads.appImage ? "Download AppImage" : "Check Linux downloads"}
                <ArrowDownToLine size={16} />
              </a>
              {downloads.deb && <a href={downloads.deb}>Download Debian package <ArrowDownToLine size={16} /></a>}
              <small>{downloads.version ?? "See published releases for availability"}</small>
            </article>
          </div>
          <p className={styles.downloadNotes}>
            {hasDownloads
              ? "Early preview. "
              : "The desktop preview is awaiting publication. "}
            Installers are unsigned and may trigger macOS or Windows warnings.
            No automatic updates or device sync yet.
            <br />
            <a
              href={`${REPO}/blob/main/README.md#running-from-source`}
            >
              Prefer running from source?
            </a>{" "}
            {" "}
            <a href={releaseLink}>Release notes & all downloads</a>
          </p>
        </section>

        <section
          id="questions"
          className={`${styles.section} ${styles.faq}`}
          aria-labelledby="faq-heading"
        >
          <div className={`${styles.wrap} ${styles.faqGrid}`}>
            <div>
              <p className={styles.sectionLabel}>A few things worth knowing</p>
              <h2 id="faq-heading">
                Before the
                <br />
                first page.
              </h2>
            </div>
            <div>
              {questions.map(([question, answer]) => (
                <details
                  key={question}
                  onToggle={(event) => {
                    const isOpen = event.currentTarget.open;
                    setOpenQuestions((current) =>
                      isOpen
                        ? current.includes(question)
                          ? current
                          : [...current, question]
                        : current.filter((item) => item !== question),
                    );
                  }}
                >
                  <summary>
                    {question}
                    <Plus aria-hidden="true" />
                  </summary>
                  {openQuestions.includes(question) && <p>{answer}</p>}
                </details>
              ))}
            </div>
          </div>
        </section>

        <div className={styles.wrap}>
          <section className={styles.closing} aria-labelledby="closing-heading">
            <h2 id="closing-heading">
              That story in your head?
              <br />
              Give it a home.
            </h2>
            <p>
              Bring your notes. Bring your half-finished chapter. Start where
              you are.
            </p>
            <a href="/register" className={styles.primary}>
              Try Inkshore on the web <ArrowRight size={18} />
            </a>
          </section>
        </div>
      </main>
      <footer className={`${styles.wrap} ${styles.footer}`}>
        <div className={styles.footerTop}>
          <a href="#" className={styles.brand}>
            <Image src="/logo.svg" alt="" width={30} height={30} />
            Inkshore Studio
          </a>
          <div className={styles.footerLinks}>
            <a href={REPO}>Source code</a>
            <a href={`${REPO}/issues`}>Feedback & issues</a>
            <a href="/register">Try on web</a>
            <a href={`${REPO}/blob/main/LICENSE`}>
              MIT License
            </a>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} Aashish Kumar</span>
          <span>Made for the stories still waiting to be written.</span>
        </div>
      </footer>
    </div>
  );
}

function PenIcon() {
  return <FileText aria-hidden="true" />;
}
function LayersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}
