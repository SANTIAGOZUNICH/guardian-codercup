import type {
  Company,
  InventoryItem,
  Material,
  OperationalModel,
  OperationalModelCounts,
  Order,
  Product,
  Resource,
} from "@/lib/types";
import { PRODUCTION_PROFILES } from "@/data/production-profiles";

export interface RawModelInput {
  company: Company;
  orders: Order[];
  productNames: Map<string, string>;
  materials: Material[];
  inventory: InventoryItem[];
  resources: Resource[];
}

/**
 * Construye el Operational Model a partir de los datos parseados de los 3
 * Excel + los ProductionProfiles de referencia. Products se deriva de los
 * nombres de producto realmente presentes en Pedidos.xlsx (dato cargado),
 * nunca de una lista fija.
 */
export function buildOperationalModel(input: RawModelInput): OperationalModel {
  const products: Product[] = Array.from(input.productNames.entries()).map(
    ([id, name]) => ({ id, name, unit: "unidades" }),
  );

  const knownProfileIds = new Set(PRODUCTION_PROFILES.map((p) => p.productId));
  const profiles = PRODUCTION_PROFILES.filter((p) => knownProfileIds.has(p.productId));

  return {
    company: input.company,
    orders: input.orders,
    products,
    materials: input.materials,
    inventory: input.inventory,
    resources: input.resources,
    profiles,
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
