import { createContext } from "react";
import { type ApiClient, api as defaultApi } from "@/lib/api";

export const ApiContext = createContext<ApiClient>(defaultApi);

/** Lets tests pass a fake client. */
export const ApiProvider = ApiContext.Provider;
