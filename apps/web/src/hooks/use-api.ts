import { useContext } from "react";
import { ApiContext } from "@/app/api-context";
import type { ApiClient } from "@/lib/api";

export function useApi(): ApiClient {
  return useContext(ApiContext);
}
