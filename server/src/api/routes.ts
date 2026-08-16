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
    path: "/api/dashboards/:dashboardId/stories",
    handler: async ({ pathParams }) =>
      api.getStories(pathParams.dashboardId ?? ""),
  },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/storylines/:slug",
    handler: async ({ pathParams }) =>
      api.getStoryline(pathParams.dashboardId ?? "", pathParams.slug ?? ""),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/storylines/:slug/facts",
    handler: async ({ pathParams, body }) =>
      api.createFact(
        pathParams.dashboardId ?? "",
        pathParams.slug ?? "",
        body,
      ),
  },
  {
    method: "patch",
    path: "/api/dashboards/:dashboardId/facts/:id",
    handler: async ({ pathParams, body }) =>
      api.updateFact(pathParams.dashboardId ?? "", pathParams.id ?? "", body),
  },
  {
    method: "delete",
    path: "/api/dashboards/:dashboardId/facts/:id",
    handler: async ({ pathParams }) =>
      api.deleteFact(pathParams.dashboardId ?? "", pathParams.id ?? ""),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/articles/:id/content",
    handler: async ({ pathParams }) =>
      api.extractArticleContent(
        pathParams.dashboardId ?? "",
        pathParams.id ?? "",
      ),
  },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/articles/:id/content",
    handler: async ({ pathParams }) =>
      api.getArticleContent(pathParams.dashboardId ?? "", pathParams.id ?? ""),
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

  // Agents
  { method: "get", path: "/api/agents", handler: async () => api.listAgents() },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/agents/sessions",
    handler: async ({ pathParams, query }) =>
      api.listAgentSessions(pathParams.dashboardId ?? "", query),
  },
  {
    method: "get",
    path: "/api/agents/sessions/:id",
    handler: async ({ pathParams }) =>
      api.getAgentSession(pathParams.id ?? ""),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/agents/run",
    handler: async ({ pathParams, body }) =>
      api.runAgent(pathParams.dashboardId ?? "", body),
  },
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/agents/chats",
    handler: async ({ pathParams, body }) =>
      api.startChat(pathParams.dashboardId ?? "", body),
  },
  {
    method: "post",
    path: "/api/agents/proposals/:id/decide",
    handler: async ({ pathParams, body }) =>
      api.decideProposal(pathParams.id ?? "", body),
  },
  {
    method: "post",
    path: "/api/agents/sessions/:id/messages",
    handler: async ({ pathParams, body }) =>
      api.sendChatMessage(pathParams.id ?? "", body),
  },

  // Settings
  {
    method: "get",
    path: "/api/stats/database",
    handler: async () => api.databaseStats(),
  },
];
