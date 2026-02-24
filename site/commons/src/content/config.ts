import { defineCollection, z } from "astro:content";

const entries = defineCollection({
  type: "content",
  schema: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    description: z.string(),
    version: z.string(),
    author: z.string(),
    tags: z.array(z.string()),
  }),
});

export const collections = { entries };
