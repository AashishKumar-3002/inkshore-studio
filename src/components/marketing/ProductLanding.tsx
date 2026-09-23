import { z } from "zod";
import LandingSite, { type DesktopDownloads } from "./LandingSite";

const releaseSchema = z.array(
  z.object({
    tag_name: z.string(),
    draft: z.boolean(),
    assets: z.array(
      z.object({ name: z.string(), browser_download_url: z.string().url() }),
    ),
  }),
);

/** Only offer files from a published release; drafts must never look downloadable. */
async function publishedDownloads(): Promise<DesktopDownloads> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/AashishKumar-3002/inkshore-studio/releases?per_page=10",
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) return {};
    const releases = releaseSchema.parse(await response.json());
    const release = releases.find(
      (item) =>
        !item.draft &&
        item.assets.some((asset) =>
          /\.(dmg|exe|AppImage|deb)$/.test(asset.name),
        ),
    );
    if (!release) return {};
    const asset = (pattern: RegExp) =>
      release.assets.find(
        (item) =>
          pattern.test(item.name) &&
          item.browser_download_url.startsWith(
            "https://github.com/AashishKumar-3002/inkshore-studio/releases/download/",
          ),
      )?.browser_download_url;
    return {
      version: release.tag_name,
      macArm: asset(/-mac-arm64\.dmg$/),
      macIntel: asset(/-mac-x64\.dmg$/),
      windows: asset(/-win-x64\.exe$/),
      appImage: asset(/-linux-x64\.AppImage$/),
      deb: asset(/-linux-x64\.deb$/),
    };
  } catch {
    // The product site remains usable when GitHub is unavailable or rate-limited.
    return {};
  }
}

export default async function ProductLanding() {
  return <LandingSite downloads={await publishedDownloads()} />;
}
