import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { mailIsLocalOnly } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in to MoonNav" subtitle="One account for planners, analysts, curators and administrators — your role decides what you can open." footer={<>New here? <Link className="text-accent hover:underline" href="/register">Create an account</Link> · <Link className="text-accent hover:underline" href="/explore">Explore without an account</Link></>}>
      <Suspense><LoginForm localMail={mailIsLocalOnly()} /></Suspense>
    </AuthCard>
  );
}
