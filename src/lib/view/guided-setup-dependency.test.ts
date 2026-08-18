import { describe, expect, it } from "vitest";
import type { GuidedSetupResourceInput } from "@/lib/model/buildModelInputsFromGuidedSetup";
import type { NluEntities } from "@/lib/nlu/types";
import {
  processEntriesFromNluEntities,
  removeProcessAndDependents,
  removeResourceAndCapacity,
  resourcesFromNluEntities,
  type CapacityByResource,
} from "./guided-setup-dependency";

function emptyEntities(overrides: Partial<NluEntities> = {}): NluEntities {
  return {
    resources: [],
    processes: [],
    goal: null,
    disruption: null,
    industry: null,
    products: [],
    equipmentV2: [],
    batchInfo: [],
    staffingCount: null,
    schedule: null,
    presentations: [],
    capacityVariants: [],
    ...overrides,
  };
}

describe("removeProcessAndDependents — cambiar un proceso invalida sus recursos", () => {
  it("quitar un proceso elimina los recursos que dependían de él", () => {
    const processEntries = ["Elaboración", "Envasado"];
    const resources: GuidedSetupResourceInput[] = [
      { name: "Reactor 1", processRaw: "Elaboración", quantityAvailable: 2 },
      { name: "Llenadora 1", processRaw: "Envasado", quantityAvailable: 1 },
    ];
    const result = removeProcessAndDependents(processEntries, resources, 1); // quita "Envasado"
    expect(result.processEntries).toEqual(["Elaboración"]);
    expect(result.resources).toEqual([{ name: "Reactor 1", processRaw: "Elaboración", quantityAvailable: 2 }]);
    expect(result.removedResourceNames).toEqual(["Llenadora 1"]);
  });

  it("quitar un proceso sin recursos dependientes no toca la lista de recursos", () => {
    const processEntries = ["Elaboración", "Codificado"];
    const resources: GuidedSetupResourceInput[] = [{ name: "Reactor 1", processRaw: "Elaboración", quantityAvailable: 1 }];
    const result = removeProcessAndDependents(processEntries, resources, 1); // quita "Codificado", sin recursos
    expect(result.resources).toEqual(resources);
    expect(result.removedResourceNames).toEqual([]);
  });

  it("quitar un proceso no soportado (nunca normalizado) no rompe nada", () => {
    const processEntries = ["Pasteurización"];
    const resources: GuidedSetupResourceInput[] = [];
    const result = removeProcessAndDependents(processEntries, resources, 0);
    expect(result.processEntries).toEqual([]);
    expect(result.removedResourceNames).toEqual([]);
  });

  it("nunca deja un recurso apuntando a un proceso que ya no está en processEntries", () => {
    const processEntries = ["Envasado"];
    const resources: GuidedSetupResourceInput[] = [
      { name: "Llenadora 1", processRaw: "Envasado", quantityAvailable: 1 },
      { name: "Llenadora 2", processRaw: "Envasado", quantityAvailable: 1 },
    ];
    const result = removeProcessAndDependents(processEntries, resources, 0);
    expect(result.resources).toEqual([]);
    expect(result.removedResourceNames).toEqual(["Llenadora 1", "Llenadora 2"]);
  });
});

describe("removeResourceAndCapacity — borrar un recurso invalida su capacidad", () => {
  it("quitar un recurso elimina también su entrada de capacidad", () => {
    const resources: GuidedSetupResourceInput[] = [
      { name: "Reactor 1", processRaw: "Elaboración", quantityAvailable: 1 },
      { name: "Llenadora 1", processRaw: "Envasado", quantityAvailable: 1 },
    ];
    const capacityByResource: CapacityByResource = {
      "Reactor 1": { value: "500", unit: "kg/batch", unknown: false },
      "Llenadora 1": { value: "1800", unit: "unidades/hora", unknown: false },
    };
    const result = removeResourceAndCapacity(resources, capacityByResource, "Llenadora 1");
    expect(result.resources).toEqual([{ name: "Reactor 1", processRaw: "Elaboración", quantityAvailable: 1 }]);
    expect(result.capacityByResource).toEqual({ "Reactor 1": { value: "500", unit: "kg/batch", unknown: false } });
    expect("Llenadora 1" in result.capacityByResource).toBe(false);
  });

  it("quitar un recurso sin capacidad cargada no rompe (no había nada que borrar)", () => {
    const resources: GuidedSetupResourceInput[] = [{ name: "Reactor 1", processRaw: "Elaboración", quantityAvailable: 1 }];
    const result = removeResourceAndCapacity(resources, {}, "Reactor 1");
    expect(result.resources).toEqual([]);
    expect(result.capacityByResource).toEqual({});
  });
});

describe("processEntriesFromNluEntities", () => {
  it("prefiere la clasificación de la IA (process) sobre el texto crudo, para que sobreviva a la re-normalización determinística", () => {
    const entities = emptyEntities({
      processes: [
        { rawPhrase: "primro se mescla", process: "Elaboración" },
        { rawPhrase: "dsp va a los pote", process: "Envasado" },
      ],
    });
    // "mescla" (typo) nunca matchearía normalizeProcessName() de nuevo — por
    // eso se usa el process ya clasificado por la IA, no el texto crudo.
    expect(processEntriesFromNluEntities(entities)).toEqual(["Elaboración", "Envasado"]);
  });

  it("usa rawPhrase cuando la IA no pudo clasificar el proceso (process: null) — nunca se inventa uno", () => {
    const entities = emptyEntities({
      processes: [{ rawPhrase: "tenemos un horno de fundición", process: null }],
    });
    expect(processEntriesFromNluEntities(entities)).toEqual(["tenemos un horno de fundición"]);
  });

  it("descarta entradas completamente vacías (ni rawPhrase ni process)", () => {
    const entities = emptyEntities({ processes: [{ rawPhrase: "  ", process: null }] });
    expect(processEntriesFromNluEntities(entities)).toEqual([]);
  });
});

describe("resourcesFromNluEntities", () => {
  it("mapea recursos con capacidad conocida", () => {
    const entities = emptyEntities({
      resources: [
        { name: "Llenadora 1", process: "Envasado", quantity: 1, capacity: 1800, capacityUnit: "unidades/hora" },
        { name: "Llenadora 2", process: "Envasado", quantity: 1, capacity: 1500, capacityUnit: "unidades/hora" },
      ],
    });
    const result = resourcesFromNluEntities(entities);
    expect(result).toEqual([
      { name: "Llenadora 1", process: "Envasado", quantity: 1, capacity: { value: "1800", unit: "unidades/hora", unknown: false } },
      { name: "Llenadora 2", process: "Envasado", quantity: 1, capacity: { value: "1500", unit: "unidades/hora", unknown: false } },
    ]);
  });

  it("capacidad desconocida (null) nunca se inventa — queda capacity: null, no un número", () => {
    const entities = emptyEntities({
      resources: [{ name: "Llenadora 1", process: "Envasado", quantity: 1, capacity: null, capacityUnit: null }],
    });
    const result = resourcesFromNluEntities(entities);
    expect(result[0].capacity).toBeNull();
  });

  it("un recurso sin proceso reconocido nunca se incluye — nunca se fuerza un proceso", () => {
    const entities = emptyEntities({
      resources: [{ name: "Horno", process: null, quantity: 1, capacity: null, capacityUnit: null }],
    });
    expect(resourcesFromNluEntities(entities)).toEqual([]);
  });

  it("nombre vacío se descarta", () => {
    const entities = emptyEntities({
      resources: [{ name: "  ", process: "Envasado", quantity: 1, capacity: null, capacityUnit: null }],
    });
    expect(resourcesFromNluEntities(entities)).toEqual([]);
  });

  it("cantidad ausente/inválida (<=0) por defecto es 1, nunca 0 o negativa", () => {
    const entities = emptyEntities({
      resources: [{ name: "Reactor 1", process: "Elaboración", quantity: 0, capacity: null, capacityUnit: null }],
    });
    expect(resourcesFromNluEntities(entities)[0].quantity).toBe(1);
  });
});
