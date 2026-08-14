"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Check, FileSpreadsheet, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Guardian } from "@/components/guardian/Guardian";
import { cn } from "@/lib/cn";
import {
  ExcelParseError,
  parseInventarioFile,
  parsePedidosWithProductNames,
  parseRecursosFile,
} from "@/lib/parsing/parseExcel";
import { buildOperationalModel } from "@/lib/model/buildOperationalModel";
import type { OperationalModel } from "@/lib/types";

const SLOTS = [
  { key: "pedidos", label: "Pedidos.xlsx", file: "Pedidos_Guardian_Demo.xlsx" },
  { key: "inventario", label: "Inventario.xlsx", file: "Inventario_Guardian_Demo.xlsx" },
  { key: "recursos", label: "Recursos.xlsx", file: "Recursos_Guardian_Demo.xlsx" },
] as const;

type SlotKey = (typeof SLOTS)[number]["key"];

export function UploadScreen({
  companyName,
  industry,
  onModelReady,
}: {
  companyName: string;
  industry: string;
  onModelReady: (model: OperationalModel) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const allPresent = SLOTS.every((s) => files[s.key]);

  async function buildFromBuffers(buffers: Record<SlotKey, ArrayBuffer>) {
    setError(null);
    setBuilding(true);
    try {
      const { orders, productNames } = parsePedidosWithProductNames(buffers.pedidos);
      const { materials, inventory } = parseInventarioFile(buffers.inventario);
      const resources = parseRecursosFile(buffers.recursos);

      const model = buildOperationalModel({
        company: { name: companyName, industry },
        orders,
        productNames,
        materials,
        inventory,
        resources,
      });
      onModelReady(model);
    } catch (e) {
      const message = e instanceof ExcelParseError ? e.message : "No se pudo leer alguno de los archivos.";
      setError(message);
      setBuilding(false);
    }
  }

  async function handleUseDemoData() {
    setError(null);
    setBuilding(true);
    try {
      const entries = await Promise.all(
        SLOTS.map(async (s) => {
          const res = await fetch(`/demo/${s.file}`);
          if (!res.ok) throw new Error(`No se pudo cargar ${s.file}`);
          return [s.key, await res.arrayBuffer()] as const;
        }),
      );
      const buffers = Object.fromEntries(entries) as Record<SlotKey, ArrayBuffer>;
      await buildFromBuffers(buffers);
    } catch {
      setError("No se pudieron cargar los archivos de demo.");
      setBuilding(false);
    }
  }

  async function handleBuildFromUploads() {
    if (!allPresent) return;
    const entries = await Promise.all(
      SLOTS.map(async (s) => [s.key, await files[s.key]!.arrayBuffer()] as const),
    );
    const buffers = Object.fromEntries(entries) as Record<SlotKey, ArrayBuffer>;
    await buildFromBuffers(buffers);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <Guardian
        state={building ? "analyzing" : "idle"}
        size={104}
        message={
          building
            ? "Estoy leyendo tus archivos..."
            : "Cargá Pedidos, Inventario y Recursos para construir tu Operational Model."
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <div className="glass-panel rounded-[var(--radius-lg)] p-8">
          <div className="mb-6 flex items-center justify-between">
            <Button
              variant="ghost"
              type="button"
              onClick={handleUseDemoData}
              disabled={building}
              className="gap-2"
            >
              <Sparkles size={16} />
              Usar datos demo de Laboratorio Genus
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SLOTS.map((slot) => {
              const selected = files[slot.key];
              return (
                <label
                  key={slot.key}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-3 rounded-[var(--radius-md)] border border-dashed p-5 text-center transition-all duration-200",
                    selected
                      ? "border-accent/50 bg-accent-soft"
                      : "border-border-default bg-white/[0.015] hover:border-border-strong hover:bg-white/[0.03]",
                  )}
                >
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFiles((prev) => ({ ...prev, [slot.key]: f }));
                    }}
                  />
                  {selected ? (
                    <Check size={22} className="text-accent-bright" />
                  ) : (
                    <Upload size={22} className="text-text-tertiary" />
                  )}
                  <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                    <FileSpreadsheet size={14} className="text-text-tertiary" />
                    {slot.label}
                  </span>
                  <span className="truncate text-xs text-text-tertiary max-w-full">
                    {selected ? selected.name : "Click para seleccionar"}
                  </span>
                </label>
              );
            })}
          </div>

          {error && (
            <p className="mt-4 rounded-[var(--radius-sm)] border border-risk-high/30 bg-risk-high-soft px-4 py-3 text-sm text-risk-high">
              {error}
            </p>
          )}

          <Button
            className="mt-6 w-full"
            disabled={!allPresent || building}
            onClick={handleBuildFromUploads}
          >
            {building ? "Construyendo..." : "Construir Operational Model"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
