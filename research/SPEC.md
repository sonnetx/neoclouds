You are researching companies for a public web guide to neoclouds (cloud providers built to rent GPU or other AI accelerator capacity). Sonnet Xu will publish it on their personal website. Today is 2026-10-13. Use WebSearch and WebFetch (load them first with ToolSearch query "select:WebSearch,WebFetch") to verify and enrich each profile with current facts from 2025 and 2026. Prefer primary sources (company sites, press releases, filings) and reputable press (Reuters, Bloomberg, Nikkei Asia, DigiTimes, The Korea Herald, Economic Times, The National, DCD / DatacenterDynamics, W.Media, Data Center Frontier, TechCrunch). Search for the latest 2026 news specifically (search with "2026" in the query), since the profile must reflect the October 2026 position.

HARD RULES
1. Never mention ClusterMAX. Do not use or reproduce any SemiAnalysis provider rating or tier (Platinum, Gold, Silver, Bronze, Participation, Not Recommended, Underperforming, Unavailable, "medal"), and do not use anecdotes from SemiAnalysis hands-on cluster testing (missing sudo, missing NVCC, topology not configured, onboarding, and similar). Do not cite any URL containing "clustermax". Other SemiAnalysis analysis may be cited sparingly, but prefer primary sources.
2. Back every number and dated claim with a source in the sources list. If you cannot verify a seed fact, keep it only if it is plausible and say so in editor_notes. If a source contradicts a seed fact, use the sourced value and say so in editor_notes.
3. Do not invent. If a company has little public information, write a short honest profile and set confidence to "low". If a name is ambiguous, choose the GPU or AI cloud company and explain in editor_notes.
4. Only put a URL in sources if you actually found it via search or fetched it. Do not guess URLs.

WRITING STYLE (strict, the text is published under the owner's name)
- No em dashes or en dashes anywhere (not even in titles of sources; replace them with a hyphen or a colon in source titles). Write ranges as "2 to 3" or with a plain hyphen.
- Avoid colons and semicolons in prose sentences (origin, today, platform, outlook, snippet). Split sentences or use connectives instead. Source titles use the "Publisher: headline" format, which is fine.
- No scare quotes, no bold, no italics, no exclamation marks. No markdown.
- Active voice, plain literal words, one main idea per sentence, present tense for current facts.
- No filler openers or discourse markers (Notably, Importantly, Interestingly, Additionally, Overall, Critically, It is worth noting, In short). No editorializing adjectives (impressive, aggressive, massive, staggering).
- Do not open a paragraph with a short choppy sentence and then explain it. Lead with the substantive sentence.
- No cleft constructions ("What sets it apart is..."). No "it turns out".
- Neutral and factual. Money as "$9.7B" or "$830M", power as "200 MW" or "1.2 GW", dates as "August 2026". Convert local currency to USD where the source gives a USD figure, otherwise give the local figure with an approximate USD value only if the source supplies it.

OUTPUT
Write a JSON array (valid JSON, UTF-8) to the file path given in your task, one object per provider, with exactly these keys in this order:
{
  "slug": "lowercase-hyphenated id, e.g. coreweave",
  "name": "display name",
  "aka": "former or alternate names, or empty string",
  "category": one of "neocloud" (main business is renting AI accelerator capacity), "hyperscaler" (large general-purpose public cloud), "miner" (crypto miner converting powered sites to AI hosting or AI cloud), "developer" (power, campus or data center developer that mainly builds and leases AI capacity to clouds and labs), "devcloud" (general-purpose developer, hosting or CDN cloud that also rents GPUs), "marketplace" (aggregator or marketplace for third-party GPU capacity), "platform" (inference, serverless or AI software platform that sells compute through its software), "sovereign" (national, telco or state-linked AI cloud), "lab" (AI lab that runs its own large compute),
  "region": one of "North America", "Europe", "Asia-Pacific", "Middle East and Africa", "Latin America",
  "hq": "City, Country",
  "founded": "year as a string, or empty string",
  "ownership": "e.g. Public (TSE: 9449), Private, Subsidiary of G42",
  "website": "https://...",
  "accelerators": ["NVIDIA H100", "NVIDIA GB300 NVL72", "AMD MI355X", ...] the accelerators it offers or deploys in 2026,
  "products": subset of ["Bare metal", "Virtual machines", "Managed Kubernetes", "Managed Slurm", "Serverless GPUs", "Inference API", "Training and fine-tuning", "GPU marketplace", "Data center development", "Colocation", "Storage", "Own silicon"],
  "snippet": "1 to 2 sentences, at most 220 characters, for a directory card. Say what the company is and the single most important current fact.",
  "facts": [{"label": "short label", "value": "short value"}] 3 to 6 key figures. Each must appear in a source.,
  "customers": ["named anchor customers with public evidence"],
  "origin": "2 to 4 sentences on how and why the company started and how it got into AI compute",
  "today": "Its 2026 position: contracts, capacity, sites, funding, government programs. 4 to 7 sentences for major providers, 1 to 3 for small ones.",
  "platform": "2 to 4 sentences on the product and technology. Empty string if nothing is known.",
  "outlook": "2 to 4 sentences on plans, open questions and risks to watch, stated as facts or as what the company says it plans. Empty string if nothing is known.",
  "sources": [{"title": "Publisher: headline", "url": "https://...", "date": "YYYY-MM-DD or YYYY-MM"}],
  "confidence": "high", "medium" or "low",
  "editor_notes": "contradictions with seed facts, unverified items, ambiguity. Empty string if none."
}

Aim for 5 to 10 sources per major provider, 2 to 5 for small ones. After writing the file, validate it with: python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d))" <path>, and scan it for the characters U+2014 and U+2013 (em and en dash) and remove any. Also grep the prose fields for ": " and "; " and rewrite those sentences.

When done, reply with only the file path, the number of providers written, and a one-line editor note per provider.
