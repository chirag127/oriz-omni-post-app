/**
 * Buttondown adapter — REAL impl.
 *
 * API: POST https://api.buttondown.com/v1/emails
 *   docs:        https://docs.buttondown.com/api-emails-create
 *   auth:        header `Authorization: Token <api-key>`
 *                (key from https://buttondown.com/settings/programming)
 *   rate-limit:  60 req/min default; 429 → Retry-After
 *   free-tier:   100 subscribers, unlimited drafts/sends, full API
 *   markdown:    native — `body` accepts Markdown (CommonMark + extensions)
 *   canonical:   no canonical_url; we prepend a "originally posted at" line
 *
 * Schedules supported via `status: "scheduled"` + `publish_date` ISO 8601.
 */

import {
  type Adapter,
  AdapterError,
  AdapterRateLimited,
  type PostResult,
} from '../adapter.ts'
import type { Article } from '../article.ts'

const ENDPOINT = 'https://api.buttondown.com/v1/emails'

export type ButtondownStatus = 'draft' | 'scheduled' | 'about_to_send'

export interface ButtondownConfig {
  /** API key from https://buttondown.com/settings/programming */
  apiKey: string
  /** Default lifecycle when posting. Defaults to `'draft'` (safe). */
  defaultStatus?: ButtondownStatus
  /** When status === 'scheduled', how many minutes ahead of `now`. */
  scheduleOffsetMinutes?: number
}

interface ButtondownCreateResponse {
  id: string
  absolute_url?: string
}

export function buttondown(config: ButtondownConfig): Adapter {
  return {
    name: 'buttondown',
    supports: {
      markdownNative: true,
      htmlNative: false,
      canonicalUrl: false,
      maxBodyLength: 0, // no documented hard cap
      rateLimit: { perMinute: 60, burst: 10 },
    },
    async post(article: Article): Promise<PostResult> {
      const status = config.defaultStatus ?? 'draft'
      const body =
        `*Originally posted at [${article.canonicalUrl}](${article.canonicalUrl}).*\n\n` +
        article.mdxBody

      const payload: Record<string, unknown> = {
        subject: article.title,
        body,
        status,
      }
      if (status === 'scheduled') {
        const offset = (config.scheduleOffsetMinutes ?? 5) * 60_000
        payload.publish_date = new Date(Date.now() + offset).toISOString()
      }

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Token ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '60')
        throw new AdapterRateLimited('buttondown', Number.isFinite(retryAfter) ? retryAfter : 60)
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new AdapterError(
          `buttondown: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
        )
      }

      const json = (await res.json()) as ButtondownCreateResponse
      return {
        adapter: 'buttondown',
        status: 'posted',
        externalId: json.id,
        externalUrl: json.absolute_url,
        postedAt: new Date().toISOString(),
      }
    },
  }
}
