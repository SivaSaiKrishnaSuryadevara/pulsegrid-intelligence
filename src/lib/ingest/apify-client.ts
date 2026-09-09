/**
 * Minimal Apify Dataset API client — direct HTTPS fetch rather than the
 * `@apify/client` package. A single paginated GET loop is all this project
 * needs; pulling in a full SDK dependency for that would be disproportionate
 * (matches the same call this codebase already made for the classification
 * webhook, which also avoided adding SDK dependencies where a plain fetch
 * covers the need).
 *
 * Docs: https://docs.apify.com/api/v2#/reference/datasets/item-collection/get-items
 */

const APIFY_API_BASE = 'https://api.apify.com/v2';
const PAGE_SIZE = 1000;

export class ApifyDatasetFetchError extends Error {}
export class ApifyRunStartError extends Error {}

export interface AdHocWebhookConfig {
  eventTypes: string[];
  requestUrl: string;
  /** JSON-encoded (stringified) header map, e.g. '{"x-apify-secret":"..."}' — matches Apify's headersTemplate shape. */
  headersTemplate?: string;
}

/**
 * Starts a new run of `actorId` (store-actor form, e.g. `apify/instagram-profile-scraper`
 * — converted to the API's tilde form internally) with the given input, and
 * attaches an ad-hoc webhook to that specific run via the documented
 * `webhooks` query param (base64-encoded JSON array of WebhookRepresentation
 * objects, `isAdHoc: true`). No persistent webhook needs to exist on the
 * actor/task for this — the webhook is scoped to just this one run.
 *
 * Docs: https://docs.apify.com/api/v2/act-runs-post
 */
export async function startApifyActorRun(
  actorId: string,
  input: Record<string, unknown>,
  apiToken: string,
  webhooks: AdHocWebhookConfig[] = []
): Promise<{ runId: string; datasetId: string }> {
  const apiActorId = actorId.replace('/', '~');
  const webhooksParam = webhooks.length > 0
    ? Buffer.from(JSON.stringify(webhooks.map((w) => ({ ...w, isAdHoc: true })))).toString('base64')
    : undefined;

  const url = new URL(`${APIFY_API_BASE}/actors/${encodeURIComponent(apiActorId)}/runs`);
  if (webhooksParam) {
    url.searchParams.set('webhooks', webhooksParam);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApifyRunStartError(`Failed to start ${actorId} run (${response.status}): ${body || response.statusText}`);
  }

  const data = (await response.json()) as { data?: { id?: string; defaultDatasetId?: string } };
  const runId = data.data?.id;
  const datasetId = data.data?.defaultDatasetId;
  if (!runId || !datasetId) {
    throw new ApifyRunStartError(`Unexpected response starting ${actorId} run: missing id/defaultDatasetId.`);
  }

  return { runId, datasetId };
}

/**
 * Fetches every item in an Apify dataset, paginating with `offset`/`limit`
 * until a page returns fewer items than requested (the reliable
 * end-of-dataset signal — no dependency on exact pagination header names).
 */
export async function fetchApifyDatasetItems(datasetId: string, apiToken: string): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;

  for (;;) {
    const url = `${APIFY_API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?offset=${offset}&limit=${PAGE_SIZE}&clean=true`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ApifyDatasetFetchError(
        `Apify dataset fetch failed (${response.status}) for dataset ${datasetId}: ${body || response.statusText}`
      );
    }

    const page = (await response.json()) as unknown;
    if (!Array.isArray(page)) {
      throw new ApifyDatasetFetchError(`Apify dataset ${datasetId} returned a non-array response.`);
    }

    items.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return items;
}
