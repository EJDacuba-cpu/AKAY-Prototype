import { useSyncExternalStore } from "react";
import { getMockRegistry, subscribeMockRegistry } from "../services/mockFamilyRegistry";

export default function useMockFamilyRegistry() {
  return useSyncExternalStore(subscribeMockRegistry, getMockRegistry, getMockRegistry);
}
