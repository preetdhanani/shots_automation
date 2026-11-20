import type { AppEnv } from '../config/env.js';
import type { MetaHealthStatus } from './publisher.js';

export const REQUIRED_META_PERMISSIONS = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_read_engagement',
  'pages_show_list',
  'business_management',
] as const;

export async function checkMetaHealth(
  env: AppEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<MetaHealthStatus> {
  const version = env.META_GRAPH_API_VERSION;
  const igUserId = env.META_IG_USER_ID.trim();
  const token = env.META_ACCESS_TOKEN.trim();

  if (!igUserId || !token) {
    return {
      configured: false,
      ok: false,
      version,
      igUserId: igUserId || null,
      username: null,
      name: null,
      tokenType: 'unknown',
      expiresAt: null,
      daysRemaining: null,
      scopes: [],
      missingPermissions: [...REQUIRED_META_PERMISSIONS],
      quotaUsed: null,
      quotaTotal: null,
      message: 'META_IG_USER_ID or META_ACCESS_TOKEN is not set in .env.',
    };
  }

  try {
    const profileRes = await fetchImpl(
      `https://graph.facebook.com/${version}/${encodeURIComponent(igUserId)}?fields=id,username,name`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const profileJson = (await profileRes.json()) as {
      id?: string;
      username?: string;
      name?: string;
      error?: { message?: string; code?: number; error_subcode?: number };
    };

    if (!profileRes.ok || profileJson.error) {
      return {
        configured: true,
        ok: false,
        version,
        igUserId,
        username: null,
        name: null,
        tokenType: 'unknown',
        expiresAt: null,
        daysRemaining: null,
        scopes: [],
        missingPermissions: [],
        quotaUsed: null,
        quotaTotal: null,
        message:
          profileJson.error?.message ?? `Meta Graph API returned HTTP ${profileRes.status}.`,
      };
    }

    // Best-effort 24h content publishing quota lookup
    let quotaUsed: number | null = null;
    let quotaTotal: number | null = null;
    try {
      const limitRes = await fetchImpl(
        `https://graph.facebook.com/${version}/${encodeURIComponent(igUserId)}/content_publishing_limit?fields=config,quota_usage`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (limitRes.ok) {
        const limitJson = (await limitRes.json()) as {
          data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }>;
        };
        const entry = limitJson.data?.[0];
        if (entry) {
          quotaUsed = typeof entry.quota_usage === 'number' ? entry.quota_usage : null;
          quotaTotal =
            typeof entry.config?.quota_total === 'number' ? entry.config.quota_total : null;
        }
      }
    } catch {
      // Optional quota check failure should not invalidate account health
    }

    // Token expiry & permissions check when App ID + App Secret are set
    let tokenType: MetaHealthStatus['tokenType'] = 'unknown';
    let expiresAt: string | null = null;
    let daysRemaining: number | null = null;
    let scopes: string[] = [];
    let missingPermissions: string[] = [];

    if (env.META_APP_ID.trim() && env.META_APP_SECRET.trim()) {
      try {
        const appToken = `${env.META_APP_ID.trim()}|${env.META_APP_SECRET.trim()}`;
        const debugUrl = new URL(`https://graph.facebook.com/${version}/debug_token`);
        debugUrl.searchParams.set('input_token', token);
        debugUrl.searchParams.set('access_token', appToken);

        const debugRes = await fetchImpl(debugUrl.toString());
        if (debugRes.ok) {
          const debugJson = (await debugRes.json()) as {
            data?: {
              is_valid?: boolean;
              expires_at?: number;
              scopes?: string[];
            };
          };
          const info = debugJson.data;
          if (info) {
            scopes = info.scopes ?? [];
            missingPermissions = REQUIRED_META_PERMISSIONS.filter((p) => !scopes.includes(p));
            if (info.expires_at === 0) {
              tokenType = 'system_user_or_non_expiring';
            } else if (typeof info.expires_at === 'number' && info.expires_at > 0) {
              tokenType = 'user_long_lived';
              expiresAt = new Date(info.expires_at * 1000).toISOString();
              daysRemaining = Math.max(
                0,
                Math.round(((info.expires_at * 1000 - Date.now()) / 86_400_000) * 10) / 10,
              );
            }
          }
        }
      } catch {
        // Optional debug_token failure handled gracefully
      }
    }

    return {
      configured: true,
      ok: true,
      version,
      igUserId: profileJson.id ?? igUserId,
      username: profileJson.username ?? null,
      name: profileJson.name ?? null,
      tokenType,
      expiresAt,
      daysRemaining,
      scopes,
      missingPermissions,
      quotaUsed,
      quotaTotal,
      message: profileJson.username
        ? `Connected to Instagram @${profileJson.username}.`
        : 'Connected to Instagram Business account.',
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      version,
      igUserId,
      username: null,
      name: null,
      tokenType: 'unknown',
      expiresAt: null,
      daysRemaining: null,
      scopes: [],
      missingPermissions: [],
      quotaUsed: null,
      quotaTotal: null,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function exchangeShortLivedToken(
  env: AppEnv,
  shortLivedToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number | null;
  expiresAt: string | null;
}> {
  if (!env.META_APP_ID.trim() || !env.META_APP_SECRET.trim()) {
    throw new Error('META_APP_ID and META_APP_SECRET are required in .env to exchange tokens.');
  }
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', env.META_APP_ID.trim());
  url.searchParams.set('client_secret', env.META_APP_SECRET.trim());
  url.searchParams.set('fb_exchange_token', shortLivedToken.trim());

  const res = await fetchImpl(url.toString());
  const data = (await res.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message ?? `Token exchange failed with HTTP ${res.status}.`);
  }

  const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : null;
  const expiresAt =
    expiresInSeconds !== null ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : null;

  return {
    accessToken: data.access_token,
    tokenType: data.token_type ?? 'bearer',
    expiresInSeconds,
    expiresAt,
  };
}
