require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { startOAuthServer } = require('./oauthServer');
const { getAllUsers, upsertUser } = require('./store');

const PREFIX = process.env.PREFIX || '!';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Refresh an expired user access token using their refresh_token.
async function refreshAccessToken(userId, refreshToken) {
  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  upsertUser(userId, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

// Add a single verified user to targetGuildId. Returns a status string.
async function addUserToGuild(user, targetGuildId) {
  let accessToken = user.accessToken;
  if (Date.now() > user.expiresAt) {
    accessToken = await refreshAccessToken(user.id, user.refreshToken);
    if (!accessToken) return `${user.username}: token expired, needs to !verify again`;
  }

  const res = await fetch(`https://discord.com/api/guilds/${targetGuildId}/members/${user.id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${process.env.BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (res.status === 201) return `${user.username}: joined`;
  if (res.status === 204) return `${user.username}: already in server`;

  const errText = await res.text();
  return `${user.username}: failed (${res.status}) ${errText}`;
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'verify') {
      const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: process.env.REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds.join',
      });
      const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;

      const embed = new EmbedBuilder()
        .setTitle('Verify to join the backup list')
        .setDescription(
          `Click below and authorize the app. This lets us add you to a backup server if the main one ever goes down.\n\n[Verify here](${url})`
        )
        .setColor(0x5865f2);

      try {
        await message.author.send({ embeds: [embed] });
        try {
          await message.reply('Sent you a DM with the verification link ✅');
        } catch (e) {
          if (e.code !== 50035) console.error(e); // Ignore unknown message errors
        }
      } catch (e) {
        try {
          await message.reply({ embeds: [embed] }); // DMs closed, fall back to channel
        } catch (e2) {
          if (e2.code !== 50035) console.error(e2); // Ignore unknown message errors
        }
      }
      return;
    }

  if (command === 'djoin') {
    if (!ADMIN_IDS.includes(message.author.id)) {
      return message.reply("You don't have permission to run this.");
    }

    const targetGuildId = args[0];
    if (!targetGuildId) {
      return message.reply(`Usage: \`${PREFIX}djoin <serverId>\``);
    }

    const users = getAllUsers();
    if (users.length === 0) {
      return message.reply('No verified members yet.');
    }

    const statusMsg = await message.reply(
      `Adding ${users.length} verified member(s) to \`${targetGuildId}\`... this may take a bit (rate limits).`
    );

    const results = [];
    for (const user of users) {
      const result = await addUserToGuild(user, targetGuildId);
      results.push(result);
      await new Promise((r) => setTimeout(r, 700)); // stay well under rate limits
    }

    const chunks = results.join('\n').match(/[\s\S]{1,1900}/g) || ['No results.'];
    await statusMsg.edit(`Done. Results:\n\`\`\`${chunks[0]}\`\`\``);
    for (const chunk of chunks.slice(1)) {
      await message.channel.send(`\`\`\`${chunk}\`\`\``);
    }
    return;
  }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  startOAuthServer();
});

client.login(process.env.BOT_TOKEN);
