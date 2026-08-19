"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Fuente global del nombre del laboratorio para Guardian — evita pasar
 * `companyName` a mano en cada pantalla nueva para siempre (Hotfix
 * Personalización Global). `Guardian` lo lee automáticamente como fallback
 * cuando no recibe `companyName` explícito; una pantalla puede seguir
 * pasándolo a mano si alguna vez necesita overridearlo.
 */
const CompanyNameContext = createContext<string | null>(null);

export function CompanyNameProvider({ value, children }: { value: string | null; children: ReactNode }) {
  return <CompanyNameContext.Provider value={value}>{children}</CompanyNameContext.Provider>;
}

export function useCompanyName(): string | null {
  return useContext(CompanyNameContext);
}
