import { z } from "zod";

export const FeedbackSchema = z.object({
  callId: z.uuid(),
  usefulness: z.number().int().min(1).max(5),
  wouldPay: z.boolean(),
  quote: z.string().trim().max(500).default(""),
  quoteConsent: z.boolean().default(false),
}).strict().refine(value => !value.quoteConsent || value.quote.length > 0, {
  message: "Add a comment before allowing it to be quoted", path: ["quote"],
});

export type FeedbackValues = Pick<z.infer<typeof FeedbackSchema>, "usefulness" | "wouldPay" | "quote" | "quoteConsent">;
