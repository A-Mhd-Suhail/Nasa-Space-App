import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { OnboardingForm } from "@/components/workspace/OnboardingForm";
import { requirePageUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const u = await requirePageUser("/app/onboarding");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Set up your workspace" description="Tell us how you plan to use MoonNav. You can change this later in Settings." />
      <OnboardingForm name={u.name} />
    </div>
  );
}
