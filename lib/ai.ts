import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export const aiEnabled = !!client;

export const GREEN_ROOM_VOICE = `You write social posts and short customer-facing copy for **The Green Room Beauty Bar** — a neighborhood chair-rental salon with 12 independent stylists across hair, color, barbering, and esthetics. The owner is Belinda Reyes.

VOICE
- Warm but never saccharine. Confident, lightly witty, never thirsty.
- Specific over generic — name the chair, the suite, the stylist, the service.
- Sentences are short. Fragments are fine. White space matters.
- No emoji unless the user asks. No exclamation marks unless the sentence earns it.
- Never use "Elevate your look", "Your journey starts here", "Treat yourself", or any salon-marketing cliché.

FORMAT
- Every post has: 2-4 short paragraphs + a clear CTA on its own line.
- 3-5 hashtags max, real ones, no #blessed energy.
- Captions read well out loud.

NEVER
- Never quote a price.
- Never promise an outcome.
- Never speak for a stylist in the first person without their name attached.`;

type CaptionType = "spotlight" | "chair" | "brand";

const TYPE_BRIEFS: Record<CaptionType, string> = {
  spotlight:
    "Stylist spotlight post. Tell readers what makes this stylist's chair-time feel different. Include their handle and suite/chair. End with how to book.",
  chair:
    "Chair-or-room-for-rent recruiting post. Speak to a stylist who already has a book and is tired of where they rent. Mention the suite, weekly rent perks (included utilities, color bar, laundry), and that Belinda tours personally. End with DM to schedule.",
  brand:
    "Brand post — no specific person. Express the Green Room point of view about what makes the salon different. Twelve independent stylists, one calm room.",
};

export type DraftedCaption = {
  caption: string;
  hashtags: string[];
  cta: string;
  mode: "live" | "demo";
};

export async function generateCaption(args: {
  type: CaptionType;
  stylistName?: string;
  stylistRole?: string;
  stylistHandle?: string;
  stylistChair?: string;
  variation: number; // small int — nudges variance across re-drafts
}): Promise<DraftedCaption | null> {
  if (!client) return null;

  const stylistLine =
    args.type === "spotlight" && args.stylistName
      ? `Stylist: ${args.stylistName} (${args.stylistRole}) — ${args.stylistChair} — Instagram: ${args.stylistHandle}`
      : "—";

  const userPrompt = `Write a ${args.type === "spotlight" ? "stylist spotlight" : args.type === "chair" ? "chair-for-rent" : "brand"} post for Instagram + Facebook.

${TYPE_BRIEFS[args.type]}

${stylistLine}

Variation seed: ${args.variation}. Use this to choose a different opening, rhythm, and angle than you would for variation 1.

Return ONLY valid JSON with this exact shape, no prose, no markdown fence:

{"caption": "...full caption text with line breaks as \\n...", "hashtags": ["#one","#two","#three"], "cta": "short call-to-action line"}`;

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: GREEN_ROOM_VOICE,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  // The model may wrap in a fence or add stray prose — extract the first JSON object.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { caption?: string; hashtags?: string[]; cta?: string };
    if (!parsed.caption) return null;
    return {
      caption: parsed.caption,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 6) : [],
      cta: parsed.cta ?? "Book at the link in bio",
      mode: "live",
    };
  } catch {
    return null;
  }
}

export type ReminderTone = "warmer" | "firmer" | "playful";

const TONE_BRIEFS: Record<ReminderTone, string> = {
  warmer:
    "Make this softer and more apologetic-on-her-behalf — Belinda hates chasing people. Still clear about the amount and the day.",
  firmer:
    "Make this more direct and businesslike. Polite but no fluff. Still warm enough that the stylist doesn't feel attacked.",
  playful:
    "Make this lightly playful — Belinda's voice when she's joking with someone she knows well. Still ends with the number and the ask.",
};

export async function rewriteReminder(args: {
  original: string;
  recipientFirstName: string;
  amount: number;
  chair: string;
  tone: ReminderTone;
}): Promise<{ text: string; mode: "live" | "demo" } | null> {
  if (!client) return null;

  const userPrompt = `Rewrite this Friday rent reminder from Belinda (salon owner) to ${args.recipientFirstName} about $${args.amount} for ${args.chair}.

ORIGINAL:
${args.original}

ADJUSTMENT: ${TONE_BRIEFS[args.tone]}

Return only the new message text. No quotes, no preamble, no markdown.`;

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 400,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: GREEN_ROOM_VOICE,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  if (!text) return null;
  return { text, mode: "live" };
}
