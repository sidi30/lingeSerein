import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Crawlers d'IA génératives : autorisés explicitement pour que Linge Serein
// puisse être cité/proposé dans ChatGPT, Perplexity, Google AI Overviews/Gemini,
// Claude, Apple Intelligence, etc. (GEO). Ne PAS bloquer ces user-agents.
const aiBots = [
  "GPTBot", // OpenAI — entraînement/grounding
  "OAI-SearchBot", // OpenAI — recherche ChatGPT
  "ChatGPT-User", // OpenAI — navigation à la demande
  "ClaudeBot", // Anthropic — entraînement/grounding
  "Claude-Web",
  "anthropic-ai",
  "Claude-SearchBot",
  "PerplexityBot", // Perplexity — index
  "Perplexity-User", // Perplexity — navigation à la demande
  "Google-Extended", // Google — Gemini / AI Overviews
  "Applebot", // Apple — Siri / Spotlight
  "Applebot-Extended", // Apple Intelligence
  "Amazonbot", // Alexa
  "Bingbot", // Bing / Copilot
  "DuckAssistBot", // DuckDuckGo AI
  "cohere-ai",
  "CCBot", // Common Crawl (alimente de nombreux LLM)
  "Meta-ExternalAgent", // Meta AI
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/devis?admin=1"],
      },
      // Autorisation explicite de chaque crawler IA (visibilité dans les réponses des IA).
      ...aiBots.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: "https://lingeserein.fr/sitemap.xml",
    host: "https://lingeserein.fr",
  };
}
