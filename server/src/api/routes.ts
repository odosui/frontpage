import { Api } from "./api";

export type RouteConfig = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  multipart?: boolean;
  handler: (params: {
    pathParams: Record<string, string>;
    query: Record<string, string>;
    body: any;
    file?: { originalname: string; buffer: Buffer };
  }) => Promise<{ status: number; json: unknown }>;
};

export const createRoutes = (api: Api): RouteConfig[] => [
  { method: "get", path: "/api/health", handler: async () => api.health() },
];
