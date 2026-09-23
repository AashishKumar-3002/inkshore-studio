"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
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

const REPO = "https://github.com/AashishKumar-3002/inkdrop-studio";
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

function PlatformIcon({ platform }: { platform: "mac" | "windows" | "linux" }) {
  if (platform === "windows")
    return (
      <svg
        width="35"
        height="35"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2 4.2 10.4 3v8.1H2zm9.4-1.4L22 1.3v9.8H11.4zM2 12.1h8.4v8.1L2 19zm9.4 0H22v9.8l-10.6-1.5z" />
      </svg>
    );
  if (platform === "mac")
    return (
      <svg
        width="35"
        height="35"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M16.5 12.9c0-2.2 1.8-3.3 1.9-3.4-1-1.4-2.5-1.6-3.1-1.6-1.3-.2-2.6.8-3.3.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.2 9 .8 1.1 1.7 2.3 2.9 2.2 1.2-.1 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-3.1-1.2-3.1-3.5ZM14.3 6.5c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1.1 2.9 1.1.1 2.2-.5 2.9-1.3Z" />
      </svg>
    );
  return <Monitor width={35} height={35} aria-hidden="true" />;
}

export default function LandingSite({
  downloads,
}: {
  downloads: DesktopDownloads;
}) {
  const [light, setLight] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
              The workspace
            </a>
            <a href="#your-ai" onClick={closeMenu}>
              Your AI
            </a>
            <a href="#questions" onClick={closeMenu}>
              FAQs
            </a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight size={12} className="inline" />
            </a>
            <a href="#download" onClick={closeMenu} className={styles.navCta}>
              Get Inkshore <ArrowDownToLine size={15} />
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
            <div className={styles.eyebrow}>
              <span className={styles.dot} />A home for the story only you can
              tell
            </div>
            <h1 id="hero-heading">
              Big ideas.
              <br />
              Meet your <em>next draft.</em>
            </h1>
            <p>
              Your world, your chapters, your voice. A writing studio with AI
              when you want it—and the final say, always yours.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#download">
                Get Inkshore Studio <ArrowDownToLine size={18} />
              </a>
              <a className={styles.secondary} href="#workspace">
                Take a look inside <ArrowDown size={17} />
              </a>
            </div>
            <p className={styles.small}>
              Local-first <span>·</span> No account to start <span>·</span> Open
              source
            </p>
          </div>
          <div className={styles.previewArea} id="workspace">
            <div className={styles.previewNote}>
              A little help. A lot of you.
              <ChevronDown size={32} strokeWidth={1.3} />
            </div>
            <div className={styles.previewTop}>
              <span className={styles.previewLabel}>
                <Monitor size={14} /> Your new writing space
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
                    ? "/screenshots/chapter-assistant-light.png"
                    : "/screenshots/chapter-assistant.png"
                }
                alt={`Inkshore Studio's chapter editor and revision assistant in ${light ? "light" : "dark"} mode, with a sample story called The Last Lighthouse`}
                width={1600}
                height={1100}
                sizes="(max-width: 1240px) 94vw, 1168px"
                loading="eager"
              />
            </div>
          </div>
          <div className={styles.benefits}>
            <span>
              <HardDrive /> Your library, on your computer
            </span>
            <span>
              <Check /> Review every AI revision
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
                You know when something feels off. Select the passage, say what
                you need, and work toward a version that feels like you.
              </p>
              <ul className={styles.featureList}>
                <li>
                  <Sparkles />
                  <div>
                    <strong>Ask, revise, or humanize</strong>
                    <p>Work on a passage or the whole chapter.</p>
                  </div>
                </li>
                <li>
                  <BookOpen />
                  <div>
                    <strong>Feedback you can work with</strong>
                    <p>
                      Five editorial scores, evidence, and priority
                      improvements.
                    </p>
                  </div>
                </li>
                <li>
                  <Undo2 />
                  <div>
                    <strong>
                      Keep what works. Revisit what doesn&rsquo;t.
                    </strong>
                    <p>Review revisions and return to saved originals.</p>
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
                <br />
                <br />
                Mara stopped halfway down the pier, her suitcase knocking
                against her knee.
              </div>
              <div className={styles.askBubble}>
                <Sparkles size={19} />
                <span>
                  Build the tension here. Keep the mystery, and let the details
                  do the work.
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
          <p className={styles.sectionLabel}>
            From the first spark to the last page
          </p>
          <div className={styles.gridHead}>
            <h2 id="book-heading">
              A whole world.
              <br />
              One place to write it.
            </h2>
            <p>
              Less jumping between scattered notes and drafts. More time with
              the story you came here to tell.
            </p>
          </div>
          <div className={styles.featureGrid}>
            <article className={styles.worldCard}>
              <h3>Keep your world close.</h3>
              <p>
                Build a story bible for your characters, setting, plot, and
                voice. Already have notes? Bring them in.
              </p>
              <div className={styles.worldTabs}>
                <span>Characters</span>
                <span>World</span>
                <span>Plot & stakes</span>
              </div>
              <div className={styles.character}>
                <small>Character notes · Sample story</small>
                <h4>Mara, the keeper&rsquo;s daughter</h4>
                <p>She came back for answers. The island has other plans.</p>
              </div>
            </article>
            <article className={styles.exportCard}>
              <h3>Put a book into the world.</h3>
              <p>
                Set your book details, create a cover, and take your manuscript
                with you.
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
                  <small>Your story, bound for somewhere</small>
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
                Write yourself, upload a draft, or generate from an idea.
              </span>
            </div>
            <div>
              <LockKeyhole />
              <span>
                Lock finished chapters and protect the words you love.
              </span>
            </div>
            <div>
              <ShieldCheck />
              <span>Keep your library local. AI runs only when you ask.</span>
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
              Connect your own API keys, or use your local Claude or Codex
              subscription sign-in on desktop.
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
                <LayersIcon /> NVIDIA NIM
              </span>
            </div>
            <p className={styles.aiFoot}>
              Provider charges and subscription limits apply. Subscription modes
              are desktop-only and support text. AI requests send relevant
              writing to your chosen provider; cover art needs an OpenAI API
              key.
            </p>
          </div>
        </section>

        <section
          id="download"
          className={`${styles.section} ${styles.wrap}`}
          aria-labelledby="download-heading"
        >
          <div className={styles.downloadHeader}>
            <p className={styles.sectionLabel}>
              Make room for your next chapter
            </p>
            <h2 id="download-heading">Your desk. Your studio.</h2>
            <p className={styles.sectionIntro}>
              Pick your platform. The desktop app brings its own database, so
              you can get straight to writing.
            </p>
          </div>
          <div className={styles.downloadGrid}>
            <article className={styles.downloadCard}>
              <PlatformIcon platform="mac" />
              <h3>macOS</h3>
              <p>Apple Silicon & Intel · DMG</p>
              <a href={downloads.macArm ?? releaseLink}>
                {downloads.macArm
                  ? "Download for Apple Silicon"
                  : "View macOS releases"}
                <ArrowDownToLine size={16} />
              </a>
              {downloads.macIntel && (
                <a href={downloads.macIntel}>
                  Download for Intel <ArrowDownToLine size={16} />
                </a>
              )}
              <small>
                {downloads.macArm || downloads.macIntel
                  ? downloads.version
                  : "Installers appear after publication"}
              </small>
            </article>
            <article className={styles.downloadCard}>
              <PlatformIcon platform="windows" />
              <h3>Windows</h3>
              <p>x64 · EXE installer</p>
              <a href={downloads.windows ?? releaseLink}>
                {downloads.windows
                  ? "Download for Windows"
                  : "View Windows releases"}
                <ArrowDownToLine size={16} />
              </a>
              <small>
                {downloads.windows
                  ? downloads.version
                  : "Installers appear after publication"}
              </small>
            </article>
            <article className={styles.downloadCard}>
              <PlatformIcon platform="linux" />
              <h3>Linux</h3>
              <p>x64 · AppImage & Debian</p>
              <a href={downloads.appImage ?? downloads.deb ?? releaseLink}>
                {downloads.appImage
                  ? "Download AppImage"
                  : downloads.deb
                    ? "Download Debian package"
                    : "View Linux releases"}
                <ArrowDownToLine size={16} />
              </a>
              {downloads.appImage && downloads.deb && (
                <a href={downloads.deb}>
                  Download Debian package <ArrowDownToLine size={16} />
                </a>
              )}
              <small>
                {downloads.appImage || downloads.deb
                  ? downloads.version
                  : "Installers appear after publication"}
              </small>
            </article>
          </div>
          <p className={styles.downloadNotes}>
            {hasDownloads
              ? "Early preview. "
              : "The first desktop preview is awaiting publication. "}
            Current installers are unsigned; macOS and Windows may warn or block
            installation. Automatic updates and device sync are not available
            yet.
            <br />
            <a
              href={`${REPO}/blob/feat/desktop-releases/README.md#running-from-source`}
            >
              Prefer running from source?
            </a>{" "}
            <span aria-hidden="true">·</span>{" "}
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
                <details key={question}>
                  <summary>
                    {question}
                    <Plus aria-hidden="true" />
                  </summary>
                  <p>{answer}</p>
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
              <em>Give it a home.</em>
            </h2>
            <p>
              Bring your notes. Bring your half-finished chapter. Start where
              you are.
            </p>
            <a href="#download" className={styles.primary}>
              Start with Inkshore <ArrowRight size={18} />
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
            <a href="/login">Web app</a>
            <a href={`${REPO}/blob/feat/desktop-releases/LICENSE`}>
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
