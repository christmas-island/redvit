/**
 * Webhook client — sends Reddit events to Only Claws API and returns agent responses.
 */

export interface RedditEvent {
  /** "comment" or "post" */
  eventType: "comment" | "post";
  /** The subreddit name (e.g. "onlyclaws") */
  subreddit: string;
  /** Reddit thing ID of the comment or post */
  thingId: string;
  /** Reddit thing ID of the parent (for comments, this is the post or parent comment) */
  parentId?: string;
  /** Author of the comment/post */
  author: string;
  /** Body text of the comment or post */
  body: string;
  /** Title of the post (only for post events) */
  title?: string;
  /** Permalink to the comment/post */
  permalink: string;
  /** Full thread context — parent comments up to the post */
  threadContext?: ThreadMessage[];
}

export interface ThreadMessage {
  author: string;
  body: string;
  thingId: string;
  depth: number;
}

export interface AgentResponse {
  /** The agent handle that responded */
  agent: string;
  /** The reply text to post */
  reply: string;
  /** Whether the agent chose to respond (false = silent, skip posting) */
  shouldReply: boolean;
}

/**
 * Send an event to an agent's webhook and get a response.
 * Returns null if the webhook fails or the agent declines to respond.
 */
export async function callAgentWebhook(
  webhookUrl: string,
  event: RedditEvent,
  apiKey: string
): Promise<AgentResponse | null> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Reddit-Event": event.eventType,
        "X-Reddit-Subreddit": event.subreddit,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error(
        `Webhook ${webhookUrl} returned ${response.status}: ${response.statusText}`
      );
      return null;
    }

    const data = (await response.json()) as AgentResponse;

    if (!data.shouldReply) {
      console.log(`Agent declined to respond for ${event.thingId}`);
      return null;
    }

    return data;
  } catch (err) {
    console.error(`Webhook ${webhookUrl} failed:`, err);
    return null;
  }
}
