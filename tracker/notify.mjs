// Gate notifications to Slack and Microsoft Teams through incoming webhooks.
// The webhook URL comes only from the user's environment and is never stored or printed. The host
// check stops a mistyped or swapped variable from sending project text somewhere unexpected; it is
// not a defence against someone who controls the user's environment.

const TIMEOUT_MS = 15_000;

export const CHANNELS = {
  slack: {
    env: "SLACK_WEBHOOK_URL",
    allowed: (url) => url.hostname === "hooks.slack.com" && url.pathname.startsWith("/services/"),
    // Escaped, so text cannot carry <!channel> mentions or disguised links into Slack.
    payload: (text, link) => {
      const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return { text: link ? `${safe}\n<${link}|Open>` : safe };
    },
  },
  teams: {
    env: "TEAMS_WEBHOOK_URL",
    // Teams Workflows ("When a Teams webhook request is received"). Office 365 connectors are retired.
    allowed: (url) => /(^|\.)logic\.azure\.com$/.test(url.hostname) || /(^|\.)powerplatform\.com$/.test(url.hostname),
    payload: (text, link) => ({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [{ type: "TextBlock", text, wrap: true }],
            actions: link ? [{ type: "Action.OpenUrl", title: "Open", url: link }] : [],
          },
        },
      ],
    }),
  },
};

function checkUrl(channel, raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return `${channel.env} is not a valid URL`;
  }
  // Tests point at a local server; only with an explicit switch, and only on this machine.
  if (process.env.ADLC3D_NOTIFY_TEST === "1" && url.protocol === "http:" && url.hostname === "127.0.0.1") return null;
  if (url.protocol !== "https:" || !channel.allowed(url)) return `${channel.env} does not point at the expected ${channel === CHANNELS.slack ? "Slack" : "Teams"} webhook host, so nothing was sent`;
  return null;
}

// Returns a list of one-line results, one per channel. Never throws for a delivery failure:
// notifications are best effort, and a stale one is noise, so nothing is queued.
export async function sendNotifications(names, text, link, { fetchImpl = globalThis.fetch } = {}) {
  const results = [];
  for (const name of names) {
    const channel = CHANNELS[name];
    if (!channel) {
      results.push(`${name}: unknown channel`);
      continue;
    }
    const raw = process.env[channel.env];
    if (!raw) {
      results.push(`${name}: not sent, ${channel.env} is not set in this shell`);
      continue;
    }
    const problem = checkUrl(channel, raw);
    if (problem) {
      results.push(`${name}: ${problem}`);
      continue;
    }
    try {
      const response = await fetchImpl(raw, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel.payload(text, link)),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      results.push(response.ok ? `${name}: sent` : `${name}: not sent, the webhook answered ${response.status}`);
    } catch (error) {
      results.push(`${name}: not sent (${String(error.message).split(raw).join("[webhook]")})`);
    }
  }
  return results;
}
