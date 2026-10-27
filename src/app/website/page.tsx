import type { Metadata } from "next";
import ProductLanding from "@/components/marketing/ProductLanding";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: "A quieter place to write your story",
  description:
    "Plan your world, write your chapters, and review every revision in one calm writing studio. Use Inkshore on the web or keep a local desktop library.",
  openGraph: {
    title: "Inkshore Studio — A quieter place to write your story",
    description: "Plan, write, and revise in one calm studio.",
    images: [
      {
        url: "/screenshots/studio-writing-workspace.png",
        width: 1280,
        height: 720,
        alt: "Inkshore Studio chapter writing workspace",
      },
    ],
  },
};

export default function WebsitePage() {
  return <ProductLanding />;
}
