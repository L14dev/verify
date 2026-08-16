# djoin-bot

A Discord bot that maintains a "backup" list of members who opted in, and can
add them to another server on command — using Discord's official OAuth2
`guilds.join` flow. It does **not** and cannot force-add anyone who hasn't
explicitly authorized it; that's a hard Discord API restriction, not just
this code's design.

## How it works

1. `!verify` — the bot DMs the user a Discord OAuth2 link (scopes: `identify guilds.join`).
2. The user clicks it, logs into Discord, and clicks **Authorize**. Discord redirects
   them to your `/callback` endpoint with a `code`.
3. The bot exchanges that code for an access token + refresh token and stores them
   locally (`verified.json`), tied to that user's ID.
4. `!djoin <serverId>` (admin-only, from `ADMIN_IDS`) — loops through every verified
   user and calls Discord's "Add Guild Member" endpoint using their stored token,
   dropping them into the target server.

## Requirements on the target server

The bot must already be a **member of the target server** and hold the
`CREATE_INSTANT_INVITE` permission there — Discord's API rejects the add-member
call otherwise. In practice, just invite the bot to every server you want it able
to `!djoin` people into, same as any normal bot invite.

## Setup

1. Create an application at https://discord.com/developers/applications
   - **Bot** tab: create a bot, copy the token → `BOT_TOKEN`
   - **OAuth2** tab: copy Client ID / Client Secret → `CLIENT_ID` / `CLIENT_SECRET`
   - **OAuth2 → Redirects**: add `http://localhost:3000/callback` (or your real
     domain if hosting this somewhere) — it must match `REDIRECT_URI` exactly.
   - **Bot → Privileged Gateway Intents**: enable "Message Content Intent" (needed
     to read the `!` commands).

2. Copy `.env.example` to `.env` and fill in the values, including your own
   Discord user ID in `ADMIN_IDS`.

3. Install and run:
   ```bash
   npm install
   npm start
   ```

4. Invite the bot to every server you'll want to `!djoin` into, with at least
   `Create Instant Invite` permission.

5. In any server the bot can see, members type `!verify` and authorize. Then an
   admin can run `!djoin <serverId>` to pull all verified members into that server.

## Notes

- `verified.json` holds live access/refresh tokens — treat it like a secret,
  don't commit it, and restrict who can read the host filesystem.
- If a user revokes the app's authorization on their Discord end, their token
  stops working and `!djoin` will report them as needing to re-verify.
- Rate limiting: the loop waits ~700ms between adds to stay safely under
  Discord's per-route limits. For very large lists this will take a while —
  that's expected and by design, not a bug to "fix" by removing the delay.
