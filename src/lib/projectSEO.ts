// src/lib/projectSEO.ts
export type ProjectSEOInput = {
  title: string;
  summary: string;
  hero: string;
  client?: string;
  date?: string | Date;
  slug: string;                 // e.g. "castle-jewelry"
  origin?: string;              // absolute origin, optional override
  keywords?: string[];          // optional extra keywords
};

export function buildProjectSEO({
  title,
  summary,
  hero,
  client,
  date,
  slug,
  origin = "https://mattblethen.com",
  keywords = [],
}: ProjectSEOInput) {
  const canonicalPath = `/projects/${slug}/`;
  const url = origin + canonicalPath;
  const imageAbs = hero?.startsWith("http") ? hero : origin + hero;

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Projects", url: "/projects/" },
    { name: title, url: canonicalPath },
  ];

  const schema = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: title,
    headline: title,
    description: summary,
    image: imageAbs,
    url,
    datePublished: date ? new Date(date).toISOString().slice(0, 10) : undefined,
    creator: { "@type": "Person", name: "Matt Blethen", url: origin },
    ...(client ? { producer: { "@type": "Organization", name: client } } : {}),
    keywords: Array.from(
      new Set([
        ...keywords,
        "Shopify 2.0",
        "Liquid",
        "Metafields",
        "Performance",
        "Klaviyo",
      ])
    ),
  };

  return { breadcrumbs, schema, imageAbs, url };
}
