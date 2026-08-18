import type {
  Company,
  InventoryItem,
  Material,
  OperationalModel,
  OperationalModelCounts,
  Order,
  Product,
  ProductionProfile,
  Resource,
} from "@/lib/types";

export interface RawModelInput {
  company: Company;
  orders: Order[];
  productNames: Map<string, string>;
  materials: Material[];
  inventory: InventoryItem[];
  resources: Resource[];
  /**
   * Production Reference + Material Formula del laboratorio (Checkpoint 9B.2).
   * Opcional y vacío por defecto — cada laboratorio declara los suyos. Este
   * builder NUNCA inyecta un dataset ajeno (ej. Laboratorio Genus) por
   * defecto: eso violaría el aislamiento entre laboratorios. El único lugar
   * que adjunta los perfiles de referencia de Genus es
   * `buildGenusDemoModel()` en `@/data/production-profiles`.
   */
  profiles?: ProductionProfile[];
}

/**
 * Construye el Operational Model a partir de los datos parseados de los 3
 * Excel (+ opcionalmente las Production Profiles propias del laboratorio,
 * Checkpoint 9B.2). Products se deriva de los nombres de producto realmente
 * presentes en Pedidos.xlsx (dato cargado), nunca de una lista fija.
 */
export function buildOperationalModel(input: RawModelInput): OperationalModel {
  const products: Product[] = Array.from(input.productNames.entries()).map(
    ([id, name]) => ({ id, name, unit: "unidades" }),
  );

  return {
    company: input.company,
    orders: input.orders,
    products,
    materials: input.materials,
    inventory: input.inventory,
    resources: input.resources,
    profiles: input.profiles ?? [],
  };
}

export function computeModelCounts(model: OperationalModel): OperationalModelCounts {
  return {
    orders: model.orders.length,
    products: model.products.length,
    materials: model.materials.length,
    resources: model.resources.length,
  };
}

/** Productos cargados en Pedidos.xlsx que no tienen ProductionProfile de referencia definido. */
export function productsWithoutProfile(model: OperationalModel): Product[] {
  const profileIds = new Set(model.profiles.map((p) => p.productId));
  return model.products.filter((p) => !profileIds.has(p.id));
}
