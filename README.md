# Matt Blethen Portfolio

Astro-based portfolio and lead-generation site for Matt Blethen's Shopify, web development, and design work.

## Stack

- Astro 5
- MDX content collections
- Tailwind CSS v4
- TypeScript
- Sharp for image processing
- Puppeteer for screenshot capture

## Project Structure

```text
/
|-- public/
|-- scripts/
|-- src/
|   |-- assets/images/
|   |-- content/projects/
|   |-- layouts/
|   |-- pages/
|   `-- styles/
|-- capture.js
`-- package.json
```

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the Astro dev server |
| `npm run build` | Build the production site |
| `npm run preview` | Preview the production build |
| `npm run check` | Run Astro type/content checks |
| `npm run capture` | Run the Puppeteer screenshot utility |
| `npm run img:sync` | Create canonical `.webp` files and responsive `-768` / `-1200` variants from source images |
| `npm run img:webp` | Alias for `img:sync` |
| `npm run gen:img` | Alias for `img:sync` |
| `npm run gen:img:clean` | Remove old generated image variants |

## Content Workflow

Project case studies live in `src/content/projects`. Each entry uses frontmatter for metadata like title, summary, hero image, services, tech, links, metrics, and testimonial data, with the long-form case study body written in MDX.

For images, the intended workflow is:

1. Add one source image to `src/assets/images/...`
2. Run `npm run img:sync`
3. Reference the base image or generated `-768` / `-1200` variants in project content as needed

You can also target a single project folder or file:

- `npm run img:sync -- src/assets/images/projects/davinci`
- `npm run img:sync -- src/assets/images/projects/davinci/hero.png`

## Notes

- The homepage is the main marketing landing page and includes local/national SEO content and structured data.
- Project pages are statically generated from the `projects` content collection.
- Astro commands may need `ASTRO_TELEMETRY_DISABLED=1` in restricted environments.
- Screenshot captures are now written to `.captures/` so they do not ship with the production site.
