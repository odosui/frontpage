import { Api } from "./api";

export type RouteConfig = {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  handler: (params: {
    pathParams: Record<string, string>;
    query: Record<string, string>;
    body: any;
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

  // Channels and the feed, scoped to a dashboard
  {
    method: "get",
    path: "/api/dashboards/:dashboardId",
    handler: async ({ pathParams }) =>
      api.getDashboard(pathParams.dashboardId ?? ""),
  },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/feed",
    handler: async ({ pathParams }) =>
      api.getFeed(pathParams.dashboardId ?? ""),
  },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/channels",
    handler: async ({ pathParams }) =>
      api.listChannels(pathParams.dashboardId ?? ""),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/channels",
    handler: async ({ pathParams, body }) =>
      api.addChannel(pathParams.dashboardId ?? "", body),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/channels/:id/refresh",
    handler: async ({ pathParams }) =>
      api.refreshChannel(pathParams.dashboardId ?? "", pathParams.id ?? ""),
  },
  {
    method: "delete",
    path: "/api/dashboards/:dashboardId/channels/:id",
    handler: async ({ pathParams }) =>
      api.deleteChannel(pathParams.dashboardId ?? "", pathParams.id ?? ""),
  },

  // Jobs
  { method: "get", path: "/api/jobs", handler: async ({ query }) =>
      api.listJobs(query) },
  { method: "get", path: "/api/jobs/stats", handler: async () =>
      api.jobStats() },

  // Settings
  {
    method: "get",
    path: "/api/stats/database",
    handler: async () => api.databaseStats(),
  },
];
