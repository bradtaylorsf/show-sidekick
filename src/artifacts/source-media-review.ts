import { z } from "zod";

export const SourceMediaReviewSchema = z
  .object({
    files: z
      .array(
        z.object({
          path: z.string(),
          reviewed: z.literal(true),
          technical_probe: z
            .record(z.string(), z.unknown())
            .refine((probe) => Object.keys(probe).length > 0, "technical_probe must not be empty"),
          content_summary: z.string(),
          planning_implications: z.array(z.string()).default([]),
        }),
      )
      .min(1),
  })
  .superRefine((review, ctx) => {
    review.files.forEach((file, index) => {
      const citedFields = new Set(
        Object.keys(file.technical_probe).filter((field) => file.content_summary.includes(field)),
      );

      if (citedFields.size < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["files", index, "content_summary"],
          message: "content_summary must cite at least 2 probe fields",
        });
      }
    });
  });

export type SourceMediaReview = z.infer<typeof SourceMediaReviewSchema>;
