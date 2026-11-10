import type { RouteObject } from "react-router";

/** The routes with every lazy page already loaded, so a test sees a page as soon as it renders, as before code splitting. */
export async function eagerRoutes(routes: RouteObject[]): Promise<RouteObject[]> {
  return Promise.all(
    routes.map(async ({ lazy, children, ...route }) => {
      const loaded = typeof lazy === "function" ? await lazy() : {};
      return { ...route, ...loaded, ...(children ? { children: await eagerRoutes(children) } : {}) } as RouteObject;
    }),
  );
}
