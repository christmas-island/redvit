/**
 * Agent registry — maps agent handles to their webhook endpoints and config.
 *
 * Each agent has:
 *  - handle:     Reddit-facing name (e.g. "SmokeyClaw")
 *  - emoji:      Signature emoji for attribution
 *  - webhookUrl: The Only Claws API endpoint that routes to this agent's OpenClaw instance
 *  - enabled:    Toggle individual agents on/off without removing config
 *  - triggers:   What events this agent responds to (comments, posts, mentions)
 */

export interface AgentConfig {
  handle: string;
  emoji: string;
  webhookUrl: string;
  enabled: boolean;
  triggers: {
    /** Respond to new comments in the subreddit */
    onComment?: boolean;
    /** Respond to new posts in the subreddit */
    onPost?: boolean;
    /** Respond when @mentioned by handle in a comment */
    onMention?: boolean;
    /** Only respond to top-level comments (not replies) */
    topLevelOnly?: boolean;
  };
}

/**
 * Default agent registry.
 * In production, this could be loaded from Devvit app settings or Redis.
 */
export const AGENTS: AgentConfig[] = [
  {
    handle: "SmokeyClaw",
    emoji: "💨",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/smokeyclaw",
    enabled: true,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
  {
    handle: "JakeClaw",
    emoji: "🦞",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/jakeclaw",
    enabled: false,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
  {
    handle: "JathyClaw",
    emoji: "🐙",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/jathyclaw",
    enabled: false,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
  {
    handle: "Pinchy",
    emoji: "🦞",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/pinchy",
    enabled: false,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
  {
    handle: "DragonClaw",
    emoji: "🐉",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/dragonclaw",
    enabled: false,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
  {
    handle: "ShopClaw",
    emoji: "🛒",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/shopclaw",
    enabled: false,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
  {
    handle: "NyxClaw",
    emoji: "🌙",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/nyxclaw",
    enabled: false,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
  {
    handle: "OracleClaw",
    emoji: "🔮",
    webhookUrl: "https://api.only-claws.net/webhooks/reddit/oracleclaw",
    enabled: false,
    triggers: {
      onComment: false,
      onPost: false,
      onMention: true,
    },
  },
];

/**
 * Find agents that should respond to a given event type.
 * If a comment mentions a specific agent by handle, only that agent responds.
 */
export function getRespondingAgents(
  eventType: "comment" | "post",
  commentBody?: string
): AgentConfig[] {
  const enabledAgents = AGENTS.filter((a) => a.enabled);

  // Check for @mentions first — if someone mentions a specific claw, only that one responds
  if (commentBody) {
    const mentioned = enabledAgents.filter(
      (a) =>
        a.triggers.onMention &&
        commentBody.toLowerCase().includes(a.handle.toLowerCase())
    );
    if (mentioned.length > 0) return mentioned;
  }

  // Otherwise, return agents subscribed to this event type
  return enabledAgents.filter((a) => {
    if (eventType === "comment") return a.triggers.onComment;
    if (eventType === "post") return a.triggers.onPost;
    return false;
  });
}
