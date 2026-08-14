"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Guardian, type GuardianState } from "@/components/guardian/Guardian";
import { Button } from "@/components/ui/Button";

export function OnboardingScreen({
  companyName,
  onContinue,
}: {
  companyName: string;
  onContinue: () => void;
}) {
  const [state, setState] = useState<GuardianState>("enter");

  useEffect(() => {
    const t = setTimeout(() => setState("hello"), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <Guardian
        state={state}
        size={160}
        message={
          state === "hello"
            ? `Hola, ${companyName}. Soy Guardian.\nCargá tus archivos y voy a entender cómo funciona tu operación.`
            : undefined
        }
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: state === "hello" ? 1 : 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Button onClick={onContinue} disabled={state !== "hello"}>
          Continuar
        </Button>
      </motion.div>
    </div>
  );
}
