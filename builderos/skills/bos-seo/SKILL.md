---
name: bos-seo
description: SEO and web performance patterns — meta tags, Open Graph, sitemap, structured data, Core Web Vitals, accessibility basics. Use when a site needs traffic, Google ranking, share previews, or lighthouse/performance improvements.
---

# SEO / Performance
- Every page: unique title (50-60ch), meta description (~150ch), canonical URL, OG tags (og:title/description/image 1200x630) + twitter:card.
- sitemap.xml + robots.txt generated at build; submit the sitemap in Search Console.
- Structured data (JSON-LD) for the content type: Article, Product, FAQ — must pass the Rich Results test.
- Semantic HTML: one h1, proper heading hierarchy, alt on meaningful images, real anchor links, html lang attribute.
- Core Web Vitals: images sized+lazy (LCP), no layout shift (explicit dimensions, CLS), defer non-critical JS (INP).
- Fonts: system stack or 1-2 woff2 with font-display: swap.
- Fast by default: static generation where possible, cache headers on assets.
