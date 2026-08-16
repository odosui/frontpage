import * as proposals from "../../../models/proposals";
import * as stories from "../../../models/stories";
import { AgentTool } from "../types";

/**
 * The first tool that changes anything. It does not change anything.
 *
 * What it does is write down what it would do and hand it to the reader, who
 * approves or refuses it in the chat. The agent gets told that it has been
 * asked, not that it has been done — so it reports a proposal rather than a
 * result, and cannot talk itself into believing the merge happened.
 */
export const mergeStories: AgentTool = {
  name: "MERGE_STORIES",
  usage:
    '<|MERGE_STORIES "Novorossiysk grain terminals halt" "Novorossiysk oil terminal halts"|>',
  mutates: true,
  description:
    "Call this on its own, never in the same message as anything else — batched beside your own lookups it would run before their results came back, and it would be refused. " +
    "Proposes folding one story into another: every article under the first story moves to the second, and the first is deleted. Two arguments, both exact story titles — the one being absorbed first, the one that survives second. " +
    "Nothing new is created and the surviving story keeps its own title, so put the better title second; that is the one the reader will be left with. " +
    "Nothing happens when you call this. The reader is shown what you propose and decides; you will not learn the outcome in this turn, so say that you have proposed it and stop. " +
    "Propose a merge only when the stories are one event that was filed twice, and read both with GET_STORY first — the articles are what tell you whether two similar titles are the same event or two days of it.",
  run: async (args, ctx) => {
    const [from, into] = args;
    if (!from || !into) {
      return "ERROR: MERGE_STORIES needs two story titles — the one to absorb, then the one that survives.";
    }

    const source = await stories.detail(ctx.dashboardId, from, 1);
    if (!source) {
      return `ERROR: no story matching "${from}" — use the exact titles GET_STORIES gives you.`;
    }

    const target = await stories.detail(ctx.dashboardId, into, 1);
    if (!target) {
      return `ERROR: no story matching "${into}" — use the exact titles GET_STORIES gives you.`;
    }

    if (source.story.id === target.story.id) {
      return `ERROR: both titles resolved to the same story ("${source.story.title}"), so there is nothing to merge.`;
    }

    const summary =
      `Merge "${source.story.title}" (${source.totalArticles} articles) ` +
      `into "${target.story.title}" (${target.totalArticles} articles).\n` +
      `"${source.story.title}" is then deleted; ` +
      `"${target.story.title}" keeps its title and storyline.`;

    const proposal = await proposals.create({
      sessionId: ctx.sessionId,
      dashboardId: ctx.dashboardId,
      kind: "merge_stories",
      // ids, not titles: approving acts on the rows the reader was shown, even
      // if something is re-filed or retitled in between
      payload: { sourceId: source.story.id, targetId: target.story.id },
      summary,
    });

    return (
      `Proposed (#${proposal.id}), waiting on the reader to approve it. ` +
      `Nothing has changed yet, and you will not find out here whether they ` +
      `said yes — tell them what you proposed and why.\n\n${summary}`
    );
  },
};
