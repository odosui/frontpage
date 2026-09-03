import * as settings from "../../models/settings";
import { modelExists } from "./catalog";

const DEFAULT_SMALL_MODEL = "google/gemini-3.1-flash-lite";
// picked by benchmarking ten models over the same 50-article batch: clean
// running arcs and the best coverage per second, at a fifth of the cost of
// the models that matched it on quality
const DEFAULT_BIG_MODEL = "openai/gpt-5.6-sol";

/** The settings keys these live under. Also what the api patches. */
export const SMALL_MODEL_KEY = "ai.model.small";
export const BIG_MODEL_KEY = "ai.model.big";

export type ModelSlot = {
  key: string;
  /** Shown beside the field: what this model is actually spent on. */
  label: string;
  description: string;
  /** Where the value falls back to when nothing is stored. */
  fallback: string;
  /** The build-in default, before any env override. */
  builtIn: string;
  /** Set when the fallback is an env var rather than the built-in default. */
  envVar: string | null;
  envValue: string | null;
};

/**
 * Resolution order, most specific first:
 *   1. the settings table — what the reader chose on the settings page
 *   2. FRONTPAGE_MODEL_SMALL / _BIG — a deployment pinning the model
 *   3. the defaults above
 *
 * The stored setting wins over the environment on purpose: a reader who picks
 * a model in the ui and gets the old one back has been ignored, and there is
 * nothing on the page that could explain why.
 */
export async function smallModel(): Promise<string> {
  return (await settings.get(SMALL_MODEL_KEY)) || smallFallback();
}

export async function bigModel(): Promise<string> {
  return (await settings.get(BIG_MODEL_KEY)) || bigFallback();
}

const smallFallback = () =>
  process.env.FRONTPAGE_MODEL_SMALL || DEFAULT_SMALL_MODEL;

const bigFallback = () => process.env.FRONTPAGE_MODEL_BIG || DEFAULT_BIG_MODEL;

/** The two slots, as the settings page needs to describe them. */
export function modelSlots(): ModelSlot[] {
  return [
    {
      key: SMALL_MODEL_KEY,
      label: "Small model",
      description:
        "Pulls the articles out of every page fetched. Runs constantly, " +
        "on long html — cost and speed matter more than depth here.",
      fallback: smallFallback(),
      builtIn: DEFAULT_SMALL_MODEL,
      envVar: "FRONTPAGE_MODEL_SMALL",
      envValue: process.env.FRONTPAGE_MODEL_SMALL || null,
    },
    {
      key: BIG_MODEL_KEY,
      label: "Big model",
      description:
        "Every agent run and chat turn: filing stories, establishing facts, " +
        "answering questions. Needs to hold a long conversation and use tools.",
      fallback: bigFallback(),
      builtIn: DEFAULT_BIG_MODEL,
      envVar: "FRONTPAGE_MODEL_BIG",
      envValue: process.env.FRONTPAGE_MODEL_BIG || null,
    },
  ];
}

export function isModelKey(key: string): boolean {
  return key === SMALL_MODEL_KEY || key === BIG_MODEL_KEY;
}

/**
 * Stores one of the two model slots, refusing anything OpenRouter does not
 * serve. An empty value clears the setting and goes back to the default.
 *
 * The check is not a nicety: a model id that does not exist is accepted by
 * nothing and fails at call time, in the worker, on every job at once — long
 * after whoever typed it has left the page.
 */
export async function setModel(
  key: string,
  value: string,
): Promise<{ error: string } | { model: string }> {
  if (!isModelKey(key)) return { error: `unknown setting "${key}"` };

  const id = value.trim();
  if (!id) {
    await settings.unset(key);
    return { model: key === SMALL_MODEL_KEY ? smallFallback() : bigFallback() };
  }

  let exists: boolean;
  try {
    exists = await modelExists(id);
  } catch (e) {
    // Unverifiable is not the same as invalid, but storing it anyway would
    // defeat the point of checking at all.
    return {
      error: `could not verify "${id}" against OpenRouter: ${
        (e as Error).message
      }`,
    };
  }
  if (!exists) return { error: `OpenRouter has no model called "${id}"` };

  await settings.set(key, id);
  return { model: id };
}
