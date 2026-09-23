import type { Metadata } from "next";
import ProductLanding from "@/components/marketing/ProductLanding";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: "Your next draft starts here",
  description:
    "A local-first writing studio for your world, chapters, and voice. Revise with AI, review every change, and export your manuscript. No account needed on desktop.",
  openGraph: {
    title: "Inkshore Studio — Your next draft starts here",
    description: "Your story. Your voice. A little help with the next draft.",
    images: [
      {
        url: "/screenshots/chapter-assistant-light.png",
        width: 1280,
        height: 960,
        alt: "Inkshore Studio chapter editor and assistant",
      },
    ],
  },
};

export default function WebsitePage() {
  return <ProductLanding />;
}
