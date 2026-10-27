import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { enabledOAuthProviders } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";
import { LoadingState } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell kicker="Your web library" title="Welcome back" description="Sign in and return to the story you were writing."
      footer={<>New here? <Link href="/register" className="font-medium text-accent hover:underline">Create an account</Link></>}>
      <Suspense fallback={<LoadingState />}><LoginForm oauth={enabledOAuthProviders} /></Suspense>
    </AuthShell>
  );
}
