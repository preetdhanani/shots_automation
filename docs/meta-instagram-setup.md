# Meta Official Graph API Setup Guide for Instagram Reels

This guide walks through connecting an Instagram Business or Creator account to this local studio using the official Meta Graph API (`graph.facebook.com` and `rupload.facebook.com`).
Using Facebook Login for Business enables direct binary MP4 resumable uploads straight from your Mac without paying for cloud video hosting.

## Prerequisites

1. Switch your Instagram account to a **Business** or **Creator** professional account in the Instagram app.
2. Create or use a **Facebook Page** and link your Instagram professional account to that Facebook Page inside Instagram or Meta Business Suite.
3. Place both the Facebook Page and the linked Instagram account inside a **Meta Business Portfolio** at `business.facebook.com`.
4. Register as a Meta Developer at `developers.facebook.com`.

## Step 1 - Create a Meta App

1. Open `developers.facebook.com/apps` and click **Create App**.
2. Choose **Business** / **Other** (or **Authenticate and request data from users with Facebook Login for Business**) as the app type.
3. Add the **Facebook Login for Business** and **Instagram** (Instagram Graph API) products inside the App Dashboard.
4. Keep the app in **Development Mode** if you are only posting to your own Instagram account.
5. Under **App Roles -> Roles**, confirm your own Facebook account (and any test admin accounts) is listed and has accepted the invite.

## Step 2 - Required Permissions

Whether generating a Business Portfolio System User token or testing via Graph API Explorer, grant all five permissions below:
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`
- `pages_show_list`
- `business_management`

Missing `pages_show_list` or `business_management` commonly causes `GET /me/accounts` to return an empty list when looking up your linked Instagram Business ID.

## Step 3 - Generate a Non-Expiring System User Token (Recommended)

A Business Portfolio System User Access Token does not expire every 60 days, making it the smoothest option for local automation.

1. Open Meta Business Settings at `business.facebook.com/settings`.
2. Go to **Users -> System Users** and create an **Admin** system user (for example `reels-publisher`).
3. Click **Assign Assets** and assign your **App**, your **Facebook Page** (Full control), and your **Instagram Account** (Full control) to that system user.
4. Click **Generate New Token**, pick your Meta App, set token expiration to **Never**, select all five permissions listed above, and copy the generated token.

### Alternative - Exchange a Short-Lived Token into a 60-Day Token

If you prefer generating a short-lived User Token in Graph API Explorer:
1. Put `META_APP_ID` and `META_APP_SECRET` in `.env`.
2. Run:

```bash
npm run reel -- meta:exchange-token <SHORT_LIVED_TOKEN>
```

3. Copy the printed 60-day token into `META_ACCESS_TOKEN` in `.env`.
Note that Facebook Login User Tokens expire after roughly 60 days and must be re-generated manually because Meta does not offer rolling server-side renewal for Facebook User Tokens.

## Step 4 - Find Your `META_IG_USER_ID`

Run this `curl` command using your new access token (or query `/me/accounts?fields=id,name,instagram_business_account{id,username}` in Graph API Explorer):

```bash
curl -s "https://graph.facebook.com/v27.0/me/accounts?fields=id,name,instagram_business_account{id,username}" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Copy the `instagram_business_account.id` string (not the Facebook Page ID) into `META_IG_USER_ID` inside `.env`.

## Step 5 - Add Credentials to `.env` and Verify

Add these lines to `.env` in `/Users/pritsandbox/Post`:

```env
META_GRAPH_API_VERSION=v27.0
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_IG_USER_ID=your_ig_business_user_id
META_ACCESS_TOKEN=your_access_token
```

Verify the full connection from the dashboard (**Settings -> Verify Instagram Connection**) or from the terminal:

```bash
npm run reel -- meta:check
```

A healthy check shows your connected `@username`, confirms whether the token is non-expiring or shows remaining days, and reports your 24-hour Meta Reels publishing quota.
