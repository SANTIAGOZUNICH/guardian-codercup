"use client";

import { ArrowLeft } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";

export function AskGuardianPlaceholder({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Guardian state="idle" size={104} />
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">Ask Guardian</h2>
        <p className="mt-2 text-sm text-text-secondary">Coming in the next checkpoint.</p>
      </div>
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft size={15} />
        Back to Command Center
      </Button>
    </div>
  );
}
