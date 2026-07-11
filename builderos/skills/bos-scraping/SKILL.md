---
name: bos-scraping
description: Web scraping and data extraction patterns — HTTP fetching, HTML parsing, rate limiting, robots.txt, caching, resilient selectors. Use when extracting data from websites, crawling, parsing HTML, or automating data collection.
---

# Scraping
- Respect robots.txt and site terms; honest User-Agent; rate-limit (1-2 req/s) with jitter; back off on 429/5xx.
- Prefer official APIs/RSS/sitemaps over HTML scraping — check first.
- Parse with a real parser (BeautifulSoup/cheerio), never regex over HTML.
- Selectors: prefer stable attributes (ids, data-*) over classes; centralize selectors in one file so a site change = one edit.
- Cache raw responses to disk keyed by URL+date; re-parse without re-fetching during development.
- Every field extraction is fallible: default None, log misses, never crash the run for one bad page.
- Output: newline-delimited JSON or SQLite, with fetched_at timestamps.
- JS-rendered sites: find the underlying XHR/JSON endpoints (network tab) before reaching for a headless browser.
