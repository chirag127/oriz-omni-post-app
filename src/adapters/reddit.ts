/**
 * Reddit adapter — REAL impl.
 *
 * API: POST https://oauth.reddit.com/api/submit
 *   docs:        https://www.reddit.com/dev/api#POST_api_submit
 *   auth:        OAuth2 bearer (script app — password grant) + user-agent
 *   rate-limit:  60 req/min/user authenticated; 429 → Retry-After
 *   free-tier:   posting is free; Reddit's *data* API is paid but submit is not
 *   markdown:    native — `text` accepts reddit-flavoured markdown
 *   canonical:   no canonical field; the post body links back to the source
 *
 * Caller MUST whitelist subreddits; per-subreddit rules are NOT enforced —
 * the consumer is responsible for checking each subreddit's posting policy.
 *
 * Auth: we mint a bearer via password grant on the fly. The "script" app
 * type at https://www.reddit.com/prefs/apps is the only one that supports
 * this without a browser round-trip.
 */

import {
  type Adapter,
  AdapterError,
  AdapterRateLimited,
  type PostResult,
} from '../adapter.ts'
import type { Article } from '../article.ts'

const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token'
const SUBMIT_ENDPOINT = 'https://oauth.reddit.com/api/submit'
const TITLE_MAX = 300

export interface RedditConfig {
  /** Reddit "script" app client id. */
  clientId: string
  /** Script app secret. */
  clientSecret: string
  /** Account username (script-app owner). */
  username: string
  /** Account password — paired with the script app. */
  password: string
  /** Whitelisted subreddits (without `r/`). At least one required. */
  subreddits: readonly string[]
  /** Reddit-required user-agent (e.g. `oriz-omnipost/0.1 (by u/chirag127)`). */
  userAgent: string
}

interface TokenResponse {
  access_token: string
  expires_in: number
}

interface SubmitResponse {
  json: {
    errors?: Array<[string, string, string]>
    data?: { url: string; id: string; name: string }
  }
}

export function reddit(config: RedditConfig): Adapter {
  if (config.subreddits.length === 0) {
    throw new AdapterError('reddit: at least one subreddit must be whitelisted')
  }
  let token: { value: string; expiresAt: number } | null = null

  async function getToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 30_000) return token.value
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const params = new URLSearchParams({
      grant_type: 'password',
      username: config.username,
      password: config.password,
    })
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': config.userAgent,
      },
      body: params.toString(),
    })
    if (!res.ok) {
      throw new AdapterError(`reddit: token endpoint ${res.status} ${res.statusText}`)
    }
    const json = (await res.json()) as TokenResponse
    token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
    return token.value
  }

  return {
    name: 'reddit',
    supports: {
      markdownNative: true,
      htmlNative: false,
      canonicalUrl: false,
      maxBodyLength: 40_000,
      rateLimit: { perMinute: 60, burst: 5 },
    },
    async post(article: Article): Promise<PostResult> {
      if (article.title.length > TITLE_MAX) {
        throw new AdapterError(`reddit: title exceeds ${TITLE_MAX} chars`)
      }
      const bearer = await getToken()
      const text =
        `*Originally posted at ${article.canonicalUrl}*\n\n${article.mdxBody}`

      const subreddit = config.subreddits[0]
      const form = new URLSearchParams({
        kind: 'self',
        sr: subreddit ?? '',
        title: article.title,
        text,
        api_type: 'json',
        sendreplies: 'true',
        resubmit: 'false',
      })

      const res = await fetch(SUBMIT_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': config.userAgent,
        },
        body: form.toString(),
      })
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '60')
        throw new AdapterRateLimited('reddit', Number.isFinite(retryAfter) ? retryAfter : 60)
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new AdapterError(`reddit: ${res.status} ${res.statusText} — ${t.slice(0, 200)}`)
      }
      const json = (await res.json()) as SubmitResponse
      if (json.json.errors && json.json.errors.length > 0) {
        throw new AdapterError(`reddit: ${JSON.stringify(json.json.errors)}`)
      }
      const data = json.json.data
      return {
        adapter: 'reddit',
        status: 'posted',
        externalId: data?.name,
        externalUrl: data?.url,
        postedAt: new Date().toISOString(),
      }
    },
  }
}
