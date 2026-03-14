import { Api } from "./api";

export type RouteConfig = {
  method: "get" | "post" | "patch" | "put" | "delete";
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

  // Dashboard management
  {
    method: "get",
    path: "/api/dashboards",
    handler: async () => api.listDashboards(),
  },
  {
    method: "post",
    path: "/api/dashboards",
    handler: async ({ body }) => api.createDashboard(body),
  },
  {
    method: "delete",
    path: "/api/dashboards/:id",
    handler: async ({ pathParams }) => api.deleteDashboard(pathParams.id ?? ""),
  },
  {
    method: "patch",
    path: "/api/dashboards/:id",
    handler: async ({ pathParams, body }) =>
      api.renameDashboard(pathParams.id ?? "", body),
  },

  // Layout operations scoped to dashboard
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/layout",
    handler: async ({ pathParams }) =>
      api.getLayout(pathParams.dashboardId ?? ""),
  },
  {
    method: "put",
    path: "/api/dashboards/:dashboardId/layout",
    handler: async ({ pathParams, body }) =>
      api.saveLayout(pathParams.dashboardId ?? "", body),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/widget",
    handler: async ({ pathParams, body }) =>
      api.addWidget(pathParams.dashboardId ?? "", body),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/widget/:id/refresh",
    handler: async ({ pathParams }) =>
      api.refreshWidget(
        pathParams.dashboardId ?? "",
        pathParams.id ?? "",
      ),
  },
  {
    method: "delete",
    path: "/api/dashboards/:dashboardId/widget/:id",
    handler: async ({ pathParams }) =>
      api.deleteWidget(
        pathParams.dashboardId ?? "",
        pathParams.id ?? "",
      ),
  },
];
