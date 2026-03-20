import { config } from "dotenv";
config({ path: ".env.local" });

import { Index } from "@upstash/vector";
import { chromium, type Browser, type BrowserContext } from "playwright";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chunk {
  id: string;
  data: string;
  metadata: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getVectorIndex() {
  return new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL!,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
  });
}

// Max chars per chunk (~500 tokens)
const MAX_CHUNK_CHARS = 2000;

// Pages to scrape — ordered by content value
// Dropped: terms-hub (just links), lobby (auth-gated), get-coins (auth-gated)
const PAGES_TO_SCRAPE = [
  { url: "https://www.jumbo88.com", slug: "homepage" },
  { url: "https://www.jumbo88.com/faqs", slug: "faqs" },
  { url: "https://www.jumbo88.com/terms-of-use", slug: "terms-of-use" },
  { url: "https://www.jumbo88.com/privacy-policy", slug: "privacy-policy" },
  { url: "https://www.jumbo88.com/contact", slug: "contact" },
  { url: "https://www.jumbo88.com/disable-vpn", slug: "disable-vpn" },
  { url: "https://www.jumbo88.com/refer-a-friend", slug: "refer-a-friend" },
  {
    url: "https://www.jumbo88.com/terms-and-conditions-refer-a-friend",
    slug: "refer-a-friend-terms",
  },
  { url: "https://www.jumbo88.com/affiliates", slug: "affiliates" },
  {
    url: "https://www.jumbo88.com/affiliates-terms-and-conditions",
    slug: "affiliates-terms",
  },
  { url: "https://www.jumbo88.com/landing", slug: "landing" },
  { url: "https://www.jumbo88.com/signup", slug: "signup" },
];

// ---------------------------------------------------------------------------
// Hardcoded troubleshooting knowledge
// Synthesized from the spec requirements and verified scraped page content.
// These guarantee the bot can handle geo/login/loading questions reliably.
// ---------------------------------------------------------------------------

const TROUBLESHOOTING_CHUNKS: Chunk[] = [
  {
    id: "troubleshoot-geolocation",
    data: `Troubleshooting Geolocation Problems on Jumbo88:
If you're having trouble with geolocation or seeing a message that Jumbo88 is not available in your area:
1. Disable any VPN or proxy service — Jumbo88 requires your real location to comply with US sweepstakes laws.
2. Try a different browser (Chrome, Firefox, Safari, Edge).
3. Clear your browser cache and cookies, then reload the page.
4. Make sure location services are enabled in your browser settings and operating system.
5. On mobile, try switching between WiFi and cellular data.
6. If on iOS, go to Settings > Privacy > Location Services and ensure your browser has permission.
7. Visit https://www.jumbo88.com/disable-vpn for step-by-step VPN disabling instructions for Windows, Mac, iOS, and Android.
Jumbo88 is available in most US states but is restricted in: California, Connecticut, Delaware, Idaho, Illinois, Louisiana, Maryland, Michigan, Montana, Nevada, New Jersey, New York, Pennsylvania, Rhode Island, Tennessee, Washington, and West Virginia.`,
    metadata: {
      source_url: "https://www.jumbo88.com/disable-vpn",
      page_title: "Troubleshooting: Geolocation",
      section: "troubleshooting",
    },
  },
  {
    id: "troubleshoot-login",
    data: `Troubleshooting Login and Loading Issues on Jumbo88:
If you cannot log in or the site is not loading:
1. Check your internet connection — try loading other websites.
2. Clear your browser cache and cookies for jumbo88.com.
3. Try a different browser or use incognito/private browsing mode.
4. Disable any browser extensions that might interfere (ad blockers, privacy extensions).
5. If you forgot your password, use the password reset option on the login page — a reset link will be emailed to you.
6. Make sure you're accessing Jumbo88 from an allowed US state (not a restricted state).
7. If the page loads but appears broken, try a hard refresh (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac).
8. On mobile, make sure your browser is updated to the latest version.
9. If issues persist, contact support at support@jumbo88.com — they are available 24/7.`,
    metadata: {
      source_url: "https://www.jumbo88.com/contact",
      page_title: "Troubleshooting: Login & Loading",
      section: "troubleshooting",
    },
  },
  {
    id: "troubleshoot-help-pages",
    data: `Where to Find Help on Jumbo88:
- FAQ page: https://www.jumbo88.com/faqs — Covers account, games, coins, promotions, redemptions, verification, technical issues, legal info, and responsible gameplay.
- Contact support: https://www.jumbo88.com/contact — Email support@jumbo88.com, available 24/7.
- Terms of Use: https://www.jumbo88.com/terms-of-use — Account rules, virtual currency policies, restricted states.
- Privacy Policy: https://www.jumbo88.com/privacy-policy — How your data is collected and used.
- Sweepstakes Rules: This page is currently unavailable (returns 404 as of the last check).
- Disable VPN instructions: https://www.jumbo88.com/disable-vpn — Step-by-step for Windows, Mac, iOS, Android.
- Refer a Friend: https://www.jumbo88.com/refer-a-friend — Earn 15 SC per referral, up to 20 referrals.
- Affiliate Program: https://www.jumbo88.com/affiliates — Apply to become an affiliate partner.`,
    metadata: {
      source_url: "https://www.jumbo88.com/faqs",
      page_title: "Help & Policy Pages Directory",
      section: "troubleshooting",
    },
  },
];

// ---------------------------------------------------------------------------
// Playwright helpers
// ---------------------------------------------------------------------------

async function scrapePage(
  context: BrowserContext,
  url: string,
): Promise<string | null> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    // Extra wait for lazy-loaded / hydrated content
    await page.waitForTimeout(2000);

    const text = await page.evaluate(() => {
      document
        .querySelectorAll(
          "script, style, noscript, nav, footer, header, iframe, svg",
        )
        .forEach((el) => el.remove());
      document
        .querySelectorAll('[role="navigation"]')
        .forEach((el) => el.remove());

      const main = document.querySelector("main") || document.body;
      return (main as HTMLElement).innerText || "";
    });

    return text
      .replace(/\t+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch (err) {
    console.warn(`  Failed to scrape ${url}:`, err);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * For the FAQ page, try to extract individual Q&A pairs via Playwright
 * by reading the visible accordion structure.
 */
async function scrapeFaqPage(
  context: BrowserContext,
  url: string,
): Promise<Chunk[]> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(2000);

    // Extract Q&A pairs using Schema.org structured data (itemtype="Question")
    const pairs = await page.evaluate(() => {
      const results: { question: string; answer: string; category: string }[] = [];

      // The FAQ page uses Schema.org markup: div[itemtype*="Question"] > h2[itemprop="name"] + div[itemprop="acceptedAnswer"]
      const questionEls = document.querySelectorAll(
        '[itemtype*="schema.org/Question"]',
      );

      questionEls.forEach((el) => {
        const question =
          el.querySelector('[itemprop="name"]')?.textContent?.trim() || "";
        const answer =
          el
            .querySelector('[itemprop="acceptedAnswer"]')
            ?.textContent?.trim() || "";

        // Find the category heading — walk backwards through preceding siblings/parents
        // to find the nearest h2.text-2xl category header
        let category = "";
        const container = el.closest(".space-y-6");
        if (container) {
          // The category h2 is a sibling before the .space-y-6 div
          let prev = container.previousElementSibling;
          while (prev) {
            if (prev.matches("h2.text-2xl")) {
              category = prev.textContent?.trim() || "";
              break;
            }
            prev = prev.previousElementSibling;
          }
        }

        if (question && answer) {
          results.push({ question, answer, category });
        }
      });

      return results;
    });

    if (pairs.length > 0) {
      return pairs.map((pair, i) => ({
        id: `faq-${i}`,
        data: `${pair.category ? `Category: ${pair.category}\n` : ""}Question: ${pair.question}\nAnswer: ${pair.answer}`,
        metadata: {
          source_url: url,
          page_title: "Jumbo88 FAQ",
          section: pair.category || `faq-${i}`,
        },
      }));
    }

    // Fallback: extract full page text if Q&A extraction didn't work
    const fullText = await page.evaluate(() => {
      document
        .querySelectorAll(
          "script, style, noscript, nav, footer, header, iframe, svg",
        )
        .forEach((el) => el.remove());
      const main = document.querySelector("main") || document.body;
      return (main as HTMLElement).innerText || "";
    });

    const cleaned = fullText
      .replace(/\t+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleaned.length > 50) {
      return chunkText(cleaned, "faqs", url, "Jumbo88 FAQ");
    }

    return [];
  } catch (err) {
    console.warn(`  Failed to scrape FAQ page:`, err);
    return [];
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split text into chunks that stay under MAX_CHUNK_CHARS,
 * splitting on paragraph boundaries.
 */
function chunkText(
  text: string,
  slug: string,
  sourceUrl: string,
  pageTitle: string,
): Chunk[] {
  const chunks: Chunk[] = [];

  if (text.length <= MAX_CHUNK_CHARS) {
    chunks.push({
      id: `${slug}-0`,
      data: text,
      metadata: {
        source_url: sourceUrl,
        page_title: pageTitle,
        section: "full",
      },
    });
    return chunks;
  }

  // Split on paragraph boundaries (double newlines)
  const paragraphs = text.split(/\n{2,}/);
  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (
      (currentChunk + "\n\n" + para).length > MAX_CHUNK_CHARS &&
      currentChunk
    ) {
      chunks.push({
        id: `${slug}-${chunkIndex}`,
        data: currentChunk.trim(),
        metadata: {
          source_url: sourceUrl,
          page_title: pageTitle,
          section: `chunk-${chunkIndex}`,
        },
      });
      chunkIndex++;
      currentChunk = para;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n\n" + para : para;
    }
  }

  // Remaining text
  if (currentChunk.trim()) {
    chunks.push({
      id: `${slug}-${chunkIndex}`,
      data: currentChunk.trim(),
      metadata: {
        source_url: sourceUrl,
        page_title: pageTitle,
        section: `chunk-${chunkIndex}`,
      },
    });
  }

  // Edge case: text had no paragraph breaks at all — hard split
  if (chunks.length === 0 && text.length > MAX_CHUNK_CHARS) {
    for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) {
      chunks.push({
        id: `${slug}-${chunks.length}`,
        data: text.slice(i, i + MAX_CHUNK_CHARS),
        metadata: {
          source_url: sourceUrl,
          page_title: pageTitle,
          section: `chunk-${chunks.length}`,
        },
      });
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Main ingestion
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

async function ingest() {
  console.log(
    `Starting Jumbo88 knowledge base ingestion${DRY_RUN ? " (DRY RUN)" : ""}...\n`,
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    geolocation: { latitude: 30.2672, longitude: -97.7431 }, // Texas
    permissions: ["geolocation"],
  });

  const allChunks: Chunk[] = [];

  // 1. Scrape each page
  for (const page of PAGES_TO_SCRAPE) {
    console.log(`Fetching ${page.slug} (${page.url})...`);

    // Special handling for FAQ — try structured Q&A extraction
    if (page.slug === "faqs") {
      const faqChunks = await scrapeFaqPage(context, page.url);
      if (faqChunks.length > 0) {
        console.log(`  Extracted ${faqChunks.length} FAQ chunks`);
        allChunks.push(...faqChunks);
        continue;
      }
      console.log("  No FAQ chunks extracted, falling back to full text");
    }

    const text = await scrapePage(context, page.url);
    if (!text || text.length < 50) {
      console.log(
        `  Skipped — only ${text?.length ?? 0} chars of content`,
      );
      continue;
    }

    // Use the slug as a rough page title, will be overridden by actual content
    const pageTitle =
      page.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const chunks = chunkText(text, page.slug, page.url, pageTitle);
    console.log(`  Created ${chunks.length} chunk(s) from ${text.length} chars`);
    allChunks.push(...chunks);
  }

  await browser.close();

  // 2. Add hardcoded troubleshooting chunks
  console.log(
    `\nAdding ${TROUBLESHOOTING_CHUNKS.length} troubleshooting chunks...`,
  );
  allChunks.push(...TROUBLESHOOTING_CHUNKS);

  console.log(`\nTotal chunks to upsert: ${allChunks.length}\n`);

  if (allChunks.length === 0) {
    console.error("No chunks to upsert.");
    process.exit(1);
  }

  // 3. In dry-run mode, print all chunks and exit
  if (DRY_RUN) {
    console.log("=== DRY RUN — Chunk Details ===\n");
    for (const chunk of allChunks) {
      console.log(`--- [${chunk.id}] (${chunk.data.length} chars) ---`);
      console.log(`    source: ${chunk.metadata.source_url}`);
      console.log(`    title:  ${chunk.metadata.page_title}`);
      console.log(
        chunk.data.length > 300
          ? chunk.data.substring(0, 300) + "...\n"
          : chunk.data + "\n",
      );
    }
    console.log(`\nDry run complete. ${allChunks.length} chunks would be upserted.`);
    return;
  }

  // 4. Upsert to Upstash Vector in batches
  const vectorIndex = getVectorIndex();
  const BATCH_SIZE = 10;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allChunks.length / BATCH_SIZE);

    console.log(
      `  Upserting batch ${batchNum}/${totalBatches} (${batch.length} chunks)...`,
    );

    await vectorIndex.upsert(
      batch.map((chunk) => ({
        id: chunk.id,
        data: chunk.data,
        metadata: chunk.metadata,
      })),
    );

    // Small delay between batches to respect API limits
    if (i + BATCH_SIZE < allChunks.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log("\nIngestion complete!");
  console.log(`  ${allChunks.length} chunks indexed in Upstash Vector`);
  console.log(
    "  Vectors will be queryable after indexing finishes (~30 seconds)",
  );
}

ingest().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
