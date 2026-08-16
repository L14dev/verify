// Handles the OAuth2 redirect: exchanges the ?code for an access token
// (scopes: identify + guilds.join) and stores it against the user's ID.

const express = require('express');
const { upsertUser } = require('./store');

function startOAuthServer() {
  const app = express();

  app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing ?code from Discord.');

    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('Token exchange failed:', errText);
        return res.status(400).send('Verification failed. Try running !verify again.');
      }

      const tokenData = await tokenRes.json();
      // tokenData: { access_token, refresh_token, expires_in, scope, token_type }

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const user = await userRes.json();

      upsertUser(user.id, {
        username: `${user.username}`,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      });

      res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px">
          <h2>✅ Verified, ${user.username}!</h2>
          <p>You can close this tab. You're now on the backup list.</p>
        </body></html>
      `);
    } catch (err) {
      console.error(err);
      res.status(500).send('Something went wrong during verification.');
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`OAuth callback server listening on :${port}`));
}

module.exports = { startOAuthServer };
