import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { mailIsLocalOnly } from "@/lib/mail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthCard title="Create your MoonNav account" subtitle="Save scenarios, run analyses, compare sites and export reports. We only ask for what we need." footer={<>Already registered? <Link className="text-accent hover:underline" href="/login">Sign in</Link></>}>
      <RegisterForm localMail={mailIsLocalOnly()} />
    </AuthCard>
  );
}
