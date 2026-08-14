"use client";

import { useState } from "react";
import { LoginScreen, type LoginPayload } from "@/components/login/LoginScreen";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { UploadScreen } from "@/components/upload/UploadScreen";
import { ModelBuildingScreen } from "@/components/model/ModelBuildingScreen";
import { AlertScreen } from "@/components/alert/AlertScreen";
import { evaluateAllOrders } from "@/lib/engine/shortage-engine";
import type { OperationalModel } from "@/lib/types";

export type CompanySession = {
  companyName: string;
  industry: string;
};

type Phase = "login" | "greeting" | "upload" | "building" | "alert";

export function GuardianApp() {
  const [session, setSession] = useState<CompanySession | null>(null);
  const [phase, setPhase] = useState<Phase>("login");
  const [model, setModel] = useState<OperationalModel | null>(null);

  function handleLogin(payload: LoginPayload) {
    setSession({ companyName: payload.companyName, industry: payload.industry });
    setPhase("greeting");
  }

  if (phase === "login" || !session) {
    return <LoginScreen onSubmit={handleLogin} />;
  }

  if (phase === "greeting") {
    return (
      <OnboardingScreen
        companyName={session.companyName}
        onContinue={() => setPhase("upload")}
      />
    );
  }

  if (phase === "upload") {
    return (
      <UploadScreen
        companyName={session.companyName}
        industry={session.industry}
        onModelReady={(m) => {
          setModel(m);
          setPhase("building");
        }}
      />
    );
  }

  if (phase === "building" && model) {
    return <ModelBuildingScreen model={model} onReady={() => setPhase("alert")} />;
  }

  if (phase === "alert" && model) {
    return <AlertScreen alerts={evaluateAllOrders(model)} />;
  }

  return null;
}
