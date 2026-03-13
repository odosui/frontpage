import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { ok } from "./helpers";

dayjs.extend(relativeTime);

export const createApi = () => {
  return {
    health: () => ok({ status: "ok" }),
  };
};

export type Api = ReturnType<typeof createApi>;
