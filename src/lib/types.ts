// Modelo de datos mínimo del Operational Model de GUARDIAN.
// Ver plan: Company -> Orders -> Products -> ProductionProfiles -> Materials -> Inventory -> Resources -> Capacities

export type Priority = "alta" | "normal" | "baja";

export interface Company {
  name: string;
  industry: string;
}

export interface Order {
  id: string;
  client: string;
  productId: string;
  quantity: number;
  deliveryDate: string; // ISO date (YYYY-MM-DD)
  priority: Priority;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
}

export interface Material {
  code: string;
  name: string;
  unit: string;
}

export interface InventoryItem {
  materialCode: string;
  stock: number;
  unit: string;
}

export type ResourceProcess = "Elaboración" | "Envasado" | "Codificado";

export interface Resource {
  id: string;
  name: string;
  type: string;
  process: ResourceProcess;
  quantityAvailable: number;
  capacity: number;
  capacityUnit: string;
}

/**
 * Receta operativa de un producto. Es "reference data": no viene de ningún
 * Excel cargado por la empresa en esta versión — está explícitamente
 * declarada en src/data/production-profiles.ts y marcada como referencia
 * en toda la UI que la consuma.
 */
export interface ProductionProfileStep {
  process: ResourceProcess;
  materialsPerUnit: { materialCode: string; qtyPerUnit: number }[];
  ratePerHour?: number;
  batchSize?: number;
}

export interface ProductionProfile {
  productId: string;
  steps: ProductionProfileStep[];
}

export interface OperationalModel {
  company: Company;
  orders: Order[];
  products: Product[];
  materials: Material[];
  inventory: InventoryItem[];
  resources: Resource[];
  profiles: ProductionProfile[];
}

export interface OperationalModelCounts {
  orders: number;
  products: number;
  materials: number;
  resources: number;
}

export type RiskLevel = "bajo" | "medio" | "alto";

/**
 * Resultado del motor de faltantes para un pedido puntual.
 * Todos los valores numéricos deben surgir del motor (engine/shortage-engine.ts),
 * nunca hardcodeados en la UI.
 */
export interface ShortageAlert {
  orderId: string;
  client: string;
  productId: string;
  productName: string;
  quantity: number;
  deliveryDate: string;
  materialCode: string;
  materialName: string;
  requiredQty: number;
  availableQty: number;
  missingQty: number;
  unit: string;
  risk: RiskLevel;
}
