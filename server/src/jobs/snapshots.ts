import { query } from "../db/pool";
import { PageSnapshot } from "../components/websites/fetcher";

/** Park a fetched page for the analyze_page job that follows. */
export async function saveSnapshot(
  url: string,
  snapshot: PageSnapshot,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `insert into page_snapshots (url, html, hrefs)
     values ($1, $2, $3::jsonb) returning id`,
    [url, snapshot.html, JSON.stringify(snapshot.hrefs)],
  );
  return String(rows[0]!.id);
}

export async function loadSnapshot(
  id: string,
): Promise<(PageSnapshot & { url: string }) | null> {
  const { rows } = await query<{ url: string; html: string; hrefs: string[] }>(
    "select url, html, hrefs from page_snapshots where id = $1",
    [id],
  );
  const row = rows[0];
  return row ? { url: row.url, html: row.html, hrefs: row.hrefs } : null;
}

export async function deleteSnapshot(id: string) {
  await query("delete from page_snapshots where id = $1", [id]);
}
