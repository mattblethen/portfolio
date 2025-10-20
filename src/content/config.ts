import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string().optional(),
    hero: z.string().optional(),
    client: z.string().optional(),
    date: z.string().or(z.date()), // ISO string or Date
    tags: z.array(z.string()).default([]),
    services: z.array(z.string()).optional(),
    tech: z.array(z.string()).optional(),
    links: z
      .object({
        live: z.string().url().optional(),
        repo: z.string().url().optional(),
      })
      .partial()
      .optional(),
    metrics: z.array(z.string()).optional(),
  }),
});

export const collections = { projects };
