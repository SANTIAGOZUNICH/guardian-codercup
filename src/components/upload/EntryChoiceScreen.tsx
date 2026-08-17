"use client";

import { motion } from "framer-motion";
import { FileSpreadsheet, MessageCircle } from "lucide-react";
import { Guardian } from "@/components/guardian/Guardian";

/**
 * Punto de entrada con dos caminos de igual peso hacia el mismo destino: un
 * OperationalModel construido por buildOperationalModel() (ver Checkpoint 7).
 * Import Company Data reusa UploadScreen sin cambios; Describe My Operation
 * abre la entrevista guiada.
 */
export function EntryChoiceScreen({
  companyName,
  onChooseUpload,
  onChooseGuidedSetup,
}: {
  companyName: string;
  onChooseUpload: () => void;
  onChooseGuidedSetup: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <Guardian
        state="idle"
        size={104}
        message={`${companyName}, ¿cómo querés construir tu Operational Twin?`}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <button
          type="button"
          onClick={onChooseUpload}
          className="glass-panel flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-border-default p-6 text-left transition-all duration-200 hover:border-border-strong hover:bg-white/[0.03]"
        >
          <FileSpreadsheet size={24} className="text-accent-bright" />
          <span className="text-base font-semibold text-text-primary">Import company data</span>
          <span className="text-sm text-text-tertiary">
            Cargá Pedidos, Inventario y Recursos (.xlsx) para construir el Twin desde tus datos reales.
          </span>
        </button>

        <button
          type="button"
          onClick={onChooseGuidedSetup}
          className="glass-panel flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-border-default p-6 text-left transition-all duration-200 hover:border-border-strong hover:bg-white/[0.03]"
        >
          <MessageCircle size={24} className="text-accent-bright" />
          <span className="text-base font-semibold text-text-primary">Describe my operation</span>
          <span className="text-sm text-text-tertiary">
            Contale a Guardian cómo funciona tu operación, una pregunta a la vez — sin Excel.
          </span>
        </button>
      </motion.div>
    </div>
  );
}
