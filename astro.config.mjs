import { defineConfig, passthroughImageService } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  integrations: [
    sitemap(),
    starlight({
      title: "Irongate",
      description: "Open source, self-hosted authentication platform",
      logo: {
        src: "./src/assets/irongate-logo.svg",
        alt: "Irongate",
      },
      social: {
        github: "https://github.com/your-org/irongate-server",
      },
      editLink: {
        baseUrl: "https://github.com/your-org/irongate-docs/edit/main/",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Quickstart (5 minutes)", link: "/getting-started/quickstart/" },
            { label: "Concepts", link: "/getting-started/concepts/" },
          ],
        },
        {
          label: "Framework Guides",
          items: [
            { label: "Next.js — App Router", link: "/framework-guides/nextjs-app-router/" },
            { label: "Next.js — Pages Router", link: "/framework-guides/nextjs-pages-router/" },
            { label: "React", link: "/framework-guides/react/" },
            { label: "SvelteKit", link: "/framework-guides/sveltekit/" },
            { label: "Nuxt", link: "/framework-guides/nuxt/" },
            { label: "Node.js", link: "/framework-guides/nodejs/" },
          ],
        },
        {
          label: "API Reference",
          autogenerate: { directory: "api-reference" },
        },
        {
          label: "Configuration",
          autogenerate: { directory: "configuration" },
        },
        {
          label: "Errors",
          autogenerate: { directory: "errors" },
        },
        {
          label: "Changelog",
          link: "/changelog/",
        },
      ],
      lastUpdated: true,
      pagination: true,
    }),
  ],
  // SITE and BASE are injected by the GitHub Actions configure-pages step.
  // Locally (pnpm dev), both are undefined and Astro runs at http://localhost:4321/.
  site: process.env.SITE,
  base: process.env.BASE ?? '/',
  image: {
    service: passthroughImageService(),
  },
});
