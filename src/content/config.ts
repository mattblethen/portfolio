// src/content/config.ts
import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string().optional(),
    hero: z.string().optional(),
    client: z.string().optional(),
    date: z.date(), // or z.string().regex(/^\d{4}-\d{2}-\d{2}$/) if you prefer quoted date
    tags: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
    tech: z.array(z.string()).optional(),
    links: z.object({
      live: z.string().url().optional(),
    }).partial().optional(),
    metrics: z.array(z.string()).optional(),

    // NEW: allow testimonial in frontmatter
    testimonial: z.object({
      name: z.string().optional(),
      title: z.string().optional(),
      photo: z.string().optional(),   // e.g. "/images/clients/castle-julie.jpg"
      quote: z.string().optional(),
      rating: z.number().min(1).max(5).optional(),
    }).optional(),
  }),
});

export const collections = { projects };
