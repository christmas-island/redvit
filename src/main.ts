import { Devvit } from "@devvit/public-api";
import { getRespondingAgents } from "./agents.js";
import { callAgentWebhook, type RedditEvent } from "./webhook.js";

// Enable HTTP fetch
Devvit.configure({
  http: true,
  redditAPI: true,
  kvStore: true,
});

/**
 * App settings — configurable via Devvit app settings in the subreddit.
 */
Devvit.addSettings([
  {
    name: "apiKey",
    label: "Only Claws API Key",
    type: "string",
    isSecret: true,
    helpText: "Bearer token for authenticating with api.only-claws.net",
  },
  {
    name: "enabledAgents",
    label: "Enabled Agents (comma-separated handles)",
    type: "string",
    helpText:
      'e.g. "SmokeyClaw,JakeClaw" — leave empty to use defaults from code',
  },
  {
    name: "replyAttribution",
    label: "Attribution style",
    type: "string",
    helpText:
      '"prefix" = emoji + handle before reply, "suffix" = signature after reply, "none" = no attribution',
  },
  {
    name: "cooldownSeconds",
    label: "Cooldown between replies (seconds)",
    type: "number",
    helpText:
      "Minimum seconds between replies from the same agent to avoid spam. Default: 30",
  },
]);

/**
 * Build the formatted reply with agent attribution.
 */
function formatReply(
  agentHandle: string,
  agentEmoji: string,
  reply: string,
  style: string
): string {
  switch (style) {
    case "prefix":
      return `${agentEmoji} **${agentHandle}:** ${reply}`;
    case "suffix":
      return `${reply}\n\n---\n*${agentEmoji} ${agentHandle} · [Only Claws](https://only-claws.net)*`;
    case "none":
      return reply;
    default:
      return `${reply}\n\n---\n*${agentEmoji} ${agentHandle} · [Only Claws](https://only-claws.net)*`;
  }
}

/**
 * Check and enforce cooldown for an agent.
 * Returns true if the agent is on cooldown (should NOT reply).
 */
async function isOnCooldown(
  kvStore: any,
  agentHandle: string,
  cooldownMs: number
): Promise<boolean> {
  const key = `cooldown:${agentHandle}`;
  const lastReply = await kvStore.get(key);
  if (lastReply) {
    const elapsed = Date.now() - Number(lastReply);
    if (elapsed < cooldownMs) return true;
  }
  await kvStore.put(key, String(Date.now()));
  return false;
}

/**
 * Gather thread context — walk up the comment chain to build conversation history.
 */
async function getThreadContext(
  reddit: any,
  commentId: string,
  maxDepth: number = 5
): Promise<RedditEvent["threadContext"]> {
  const context: NonNullable<RedditEvent["threadContext"]> = [];
  let currentId = commentId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    try {
      const comment = await reddit.getCommentById(currentId);
      if (!comment) break;

      context.unshift({
        author: comment.authorName,
        body: comment.body,
        thingId: comment.id,
        depth,
      });

      // Walk up to parent — stop if parent is the post (t3_)
      if (comment.parentId?.startsWith("t1_")) {
        currentId = comment.parentId;
        depth++;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return context;
}

/**
 * Handle a new comment event.
 */
Devvit.addTrigger({
  event: "CommentCreate",
  onEvent: async (event, context) => {
    const comment = event as any;
    const body = comment.comment?.body ?? "";
    const author = comment.author?.name ?? "";
    const commentId = comment.comment?.id;
    const parentId = comment.comment?.parentId;
    const subreddit = comment.subreddit?.name ?? "";
    const permalink = comment.comment?.permalink ?? "";

    // Don't respond to our own comments (prevent loops)
    const appUser = await context.reddit.getAppUser();
    if (author === appUser.username) return;

    // Find which agents should respond
    const agents = getRespondingAgents("comment", body);
    if (agents.length === 0) return;

    // Load settings
    const apiKey =
      ((await context.settings.get("apiKey")) as string) ?? "";
    const attribution =
      ((await context.settings.get("replyAttribution")) as string) ??
      "suffix";
    const cooldownSeconds =
      ((await context.settings.get("cooldownSeconds")) as number) ?? 30;

    if (!apiKey) {
      console.error("No API key configured — skipping");
      return;
    }

    // Gather thread context for richer responses
    const threadContext = parentId?.startsWith("t1_")
      ? await getThreadContext(context.reddit, parentId)
      : [];

    const redditEvent: RedditEvent = {
      eventType: "comment",
      subreddit,
      thingId: commentId,
      parentId,
      author,
      body,
      permalink,
      threadContext,
    };

    // Call each responding agent (typically just one unless multiple are mentioned)
    for (const agent of agents) {
      // Enforce cooldown
      if (
        await isOnCooldown(
          context.kvStore,
          agent.handle,
          cooldownSeconds * 1000
        )
      ) {
        console.log(`${agent.handle} on cooldown, skipping`);
        continue;
      }

      const response = await callAgentWebhook(
        agent.webhookUrl,
        redditEvent,
        apiKey
      );
      if (!response) continue;

      const formattedReply = formatReply(
        agent.handle,
        agent.emoji,
        response.reply,
        attribution
      );

      await context.reddit.submitComment({
        id: commentId,
        text: formattedReply,
      });

      console.log(
        `${agent.handle} replied to ${commentId} by ${author}`
      );
    }
  },
});

/**
 * Handle a new post event.
 */
Devvit.addTrigger({
  event: "PostCreate",
  onEvent: async (event, context) => {
    const post = event as any;
    const body = post.post?.selftext ?? "";
    const title = post.post?.title ?? "";
    const author = post.author?.name ?? "";
    const postId = post.post?.id;
    const subreddit = post.subreddit?.name ?? "";
    const permalink = post.post?.permalink ?? "";

    // Don't respond to our own posts
    const appUser = await context.reddit.getAppUser();
    if (author === appUser.username) return;

    // Find which agents should respond to posts
    const agents = getRespondingAgents("post", `${title} ${body}`);
    if (agents.length === 0) return;

    const apiKey =
      ((await context.settings.get("apiKey")) as string) ?? "";
    const attribution =
      ((await context.settings.get("replyAttribution")) as string) ??
      "suffix";
    const cooldownSeconds =
      ((await context.settings.get("cooldownSeconds")) as number) ?? 30;

    if (!apiKey) {
      console.error("No API key configured — skipping");
      return;
    }

    const redditEvent: RedditEvent = {
      eventType: "post",
      subreddit,
      thingId: postId,
      author,
      body,
      title,
      permalink,
    };

    for (const agent of agents) {
      if (
        await isOnCooldown(
          context.kvStore,
          agent.handle,
          cooldownSeconds * 1000
        )
      ) {
        console.log(`${agent.handle} on cooldown, skipping`);
        continue;
      }

      const response = await callAgentWebhook(
        agent.webhookUrl,
        redditEvent,
        apiKey
      );
      if (!response) continue;

      const formattedReply = formatReply(
        agent.handle,
        agent.emoji,
        response.reply,
        attribution
      );

      await context.reddit.submitComment({
        id: postId,
        text: formattedReply,
      });

      console.log(
        `${agent.handle} replied to post ${postId} by ${author}`
      );
    }
  },
});

export default Devvit;
