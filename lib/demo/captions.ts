import type { Stylist } from "./stylists";

export type PostType = "spotlight" | "chair" | "brand";

const SPOTLIGHT_TEMPLATES = [
  (s: Stylist) =>
`Meet ${s.name.split(" ")[0]} — ${s.role.toLowerCase()} at The Green Room, working out of ${s.chair}.

What ${s.name.split(" ")[0]} is known for around here: clients who book one appointment and become a six-week ritual. Quiet hands, loud results.

DM ${s.handle} on Instagram to book or tap the link in our bio.`,

  (s: Stylist) =>
`Stylist spotlight: ${s.name}. ${s.chair}, The Green Room Beauty Bar.

The kind of ${s.role.toLowerCase()} who makes you sit a little taller in the chair. ${s.name.split(" ")[0]}'s clients keep coming back because the work keeps getting better.

Tap ${s.handle} to book.`,

  (s: Stylist) =>
`If you haven't met ${s.name.split(" ")[0]} yet, this is your sign.

${s.role} → ${s.chair} → ${s.handle}

Booked-out energy with a calm chair-side bedside manner. Come say hi.`,
];

const CHAIR_TEMPLATES = [
  () =>
`A chair just opened up at The Green Room Beauty Bar.

You'd get: your own keyed suite, color bar access, laundry, towels, parking. We don't book over you. You keep your clients, your prices, your hours.

If you're tired of renting somewhere that doesn't feel like home — DM us. Tours this week.`,

  () =>
`Looking for one more.

Independent suite. Established neighborhood. Salon-wide marketing already pulling traffic. No commission split — flat weekly rent, you keep 100%.

If you've been thinking about leaving where you are, this is the room you tour first. DM us.`,

  () =>
`Suite 5 opens in July. We're picky about who we bring in.

You: 3+ years behind the chair, your own book, the kind of stylist whose clients already follow you to wherever you go. Us: a salon that lets you actually work.

DM to schedule a walk-through.`,
];

const BRAND_TEMPLATES = [
  () =>
`Twelve independent stylists. One front door.

You don't book "the salon" at The Green Room — you book the specific human whose work made you stop scrolling. Every chair has its own vibe, its own price list, its own following.

Find your match → link in bio.`,

  () =>
`The Green Room rule: you leave looking like yourself, just better.

Color that doesn't announce itself. Cuts that grow out the way they were meant to. The kind of salon you stop "trying" once you find.

Tap the link to book any of our twelve.`,

  () =>
`Walk in. Get a glass of something. Sit in a chair that's actually yours for the hour. Leave on time.

The Green Room Beauty Bar — twelve independent stylists, one calm room. Find your stylist → link in bio.`,
];

export function draftCaption(type: PostType, stylist?: Stylist, seed = Date.now()) {
  const rotate = (arr: any[]) => arr[Math.abs(seed) % arr.length];
  if (type === "spotlight" && stylist) {
    return {
      caption: rotate(SPOTLIGHT_TEMPLATES)(stylist),
      hashtags: ["#TheGreenRoomBeautyBar", `#${stylist.role.replace(/\s/g,"")}`, "#NeighborhoodSalon", "#IndependentStylist"],
      cta: `Book with ${stylist.handle}`,
    };
  }
  if (type === "chair") {
    return {
      caption: rotate(CHAIR_TEMPLATES)(),
      hashtags: ["#ChairForRent", "#StylistsWanted", "#SalonSuite", "#TheGreenRoomBeautyBar"],
      cta: "DM us to schedule a tour",
    };
  }
  return {
    caption: rotate(BRAND_TEMPLATES)(),
    hashtags: ["#TheGreenRoomBeautyBar", "#IndependentStylists", "#NeighborhoodSalon"],
    cta: "Book at the link in bio",
  };
}
