export const SITE_URL = "https://mattblethen.com";
export const BUSINESS_NAME = "Matt Blethen";
export const BUSINESS_EMAIL = "mattblethen@gmail.com";
export const DEFAULT_OG_IMAGE = "/images/og-default.jpg";
export const DEFAULT_TITLE =
  "Matt Blethen | Shopify Developer for Ecommerce and Service Businesses";
export const DEFAULT_DESCRIPTION =
  "Shopify developer and web designer for ecommerce brands and service businesses across the U.S., with in-person project meetings available around Richmond, Lexington, and Central Kentucky.";

export const LOCAL_SERVICE_AREAS = [
  "Richmond, KY",
  "Lexington, KY",
  "Berea, KY",
  "Winchester, KY",
  "Nicholasville, KY",
  "Georgetown, KY",
  "Versailles, KY",
  "Danville, KY",
  "Lancaster, KY",
  "Irvine, KY",
];

export const SERVICE_TYPES = [
  "Shopify store design and development",
  "Shopify theme upgrades and speed optimization",
  "Web design for local service businesses",
  "Landing pages and conversion-focused websites",
  "Ongoing website support and performance tuning",
];

export function toAbsoluteUrl(input: string, siteOrigin = SITE_URL) {
  if (/^https?:\/\//i.test(input)) return input;
  return `${siteOrigin}${input.startsWith("/") ? input : `/${input}`}`;
}

export function buildWebSiteJsonLd(siteOrigin = SITE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BUSINESS_NAME,
    url: siteOrigin,
  };
}

export function buildProfessionalServiceJsonLd(siteOrigin = SITE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: BUSINESS_NAME,
    url: siteOrigin,
    image: toAbsoluteUrl(DEFAULT_OG_IMAGE, siteOrigin),
    email: BUSINESS_EMAIL,
    description: DEFAULT_DESCRIPTION,
    serviceType: SERVICE_TYPES,
    serviceArea: { "@type": "Country", name: "United States" },
    areaServed: LOCAL_SERVICE_AREAS.map((city) => ({ "@type": "City", name: city })),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Richmond",
      addressRegion: "KY",
      addressCountry: "US",
    },
    availableLanguage: ["en"],
  };
}

export function buildBreadcrumbJsonLd(
  crumbs: Array<{ name: string; url?: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      ...(crumb.url ? { item: crumb.url } : {}),
    })),
  };
}

export function buildFAQJsonLd(
  items: Array<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildOfferCatalogJsonLd(siteOrigin = SITE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: "Web and Shopify services",
    url: `${siteOrigin}/#services`,
    itemListElement: SERVICE_TYPES.map((service, index) => ({
      "@type": "OfferCatalog",
      name: service,
      position: index + 1,
    })),
  };
}

export function buildContactPageJsonLd(siteOrigin = SITE_URL) {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact Matt Blethen",
    url: `${siteOrigin}/contact`,
    about: {
      "@type": "ProfessionalService",
      name: BUSINESS_NAME,
      email: BUSINESS_EMAIL,
    },
  };
}
