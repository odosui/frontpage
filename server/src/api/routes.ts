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

  // Sources. Independent of any dashboard: they are created, edited and
  // deleted here, and only *assigned* to a dashboard further down.
  { method: "get", path: "/api/sources", handler: async () => api.listSources() },
  {
    method: "post",
    path: "/api/sources",
    handler: async ({ body }) => api.createSource(body),
  },
  {
    method: "patch",
    path: "/api/sources/:id",
    handler: async ({ pathParams, body }) =>
      api.updateSource(pathParams.id ?? "", body),
  },
  {
    method: "delete",
    path: "/api/sources/:id",
    handler: async ({ pathParams }) => api.deleteSource(pathParams.id ?? ""),
  },
  {
    method: "post",
    path: "/api/sources/:id/refresh",
    handler: async ({ pathParams }) => api.refreshSource(pathParams.id ?? ""),
  },

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

  // One dashboard: the arc, its stories, what they establish and what they
  // point to — everything the page renders.
  {
    method: "get",
    path: "/api/dashboards/:dashboardId",
    handler: async ({ pathParams }) =>
      api.getDashboard(pathParams.dashboardId ?? ""),
  },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/feed",
    handler: async ({ pathParams }) => api.getFeed(pathParams.dashboardId ?? ""),
  },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/stories",
    handler: async ({ pathParams }) =>
      api.getStories(pathParams.dashboardId ?? ""),
  },
  {
    method: "patch",
    path: "/api/dashboards/:dashboardId/stories/:id",
    handler: async ({ pathParams, body }) =>
      api.renameStory(pathParams.dashboardId ?? "", pathParams.id ?? "", body),
  },
  {
    method: "delete",
    path: "/api/dashboards/:dashboardId/stories/:id",
    handler: async ({ pathParams }) =>
      api.deleteStory(pathParams.dashboardId ?? "", pathParams.id ?? ""),
  },

  // Which sources this dashboard reads
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/sources",
    handler: async ({ pathParams }) =>
      api.listDashboardSources(pathParams.dashboardId ?? ""),
  },
  // Assigns a source. An existing one by `sourceId`, or a brand new one
  // described inline — creating and assigning in one round trip, which is what
  // "add a source" means from inside a dashboard.
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/sources",
    handler: async ({ pathParams, body }) =>
      api.assignSource(pathParams.dashboardId ?? "", body),
  },
  {
    method: "delete",
    path: "/api/dashboards/:dashboardId/sources/:id",
    handler: async ({ pathParams }) =>
      api.unassignSource(pathParams.dashboardId ?? "", pathParams.id ?? ""),
  },

  // Facts: what this dashboard is taken to have established
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/facts",
    handler: async ({ pathParams, body }) =>
      api.createFact(pathParams.dashboardId ?? "", body),
  },
  {
    method: "get",
    path: "/api/dashboards/:dashboardId/facts/history",
    handler: async ({ pathParams }) =>
      api.getFactsHistory(pathParams.dashboardId ?? ""),
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

  // Predictions: the reader writes the claim, the analyst puts odds on it
  {
    method: "post",
    path: "/api/dashboards/:dashboardId/predictions",
    handler: async ({ pathParams, body }) =>
      api.createPrediction(pathParams.dashboardId ?? "", body),
  },
  {
    method: "patch",
    path: "/api/dashboards/:dashboardId/predictions/:id",
    handler: async ({ pathParams, body }) =>
      api.updatePrediction(
        pathParams.dashboardId ?? "",
        pathParams.id ?? "",
        body,
      ),
  },
  {
    method: "delete",
    path: "/api/dashboards/:dashboardId/predictions/:id",
    handler: async ({ pathParams }) =>
      api.deletePrediction(pathParams.dashboardId ?? "", pathParams.id ?? ""),
  },

  // One article's own text
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

  // Jobs
  {
    method: "get",
    path: "/api/jobs",
    handler: async ({ query }) => api.listJobs(query),
  },
  { method: "get", path: "/api/jobs/stats", handler: async () => api.jobStats() },

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
    handler: async ({ pathParams }) => api.getAgentSession(pathParams.id ?? ""),
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
