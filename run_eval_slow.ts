import { GoogleGenAI } from "@google/genai";
import { extractClaims, alignClaims } from './src/utils/api.js';
import { enforceOneGroupPerClaim, validateGroupIntegrity } from './src/utils/triage.js';
import { GOLD_QUESTION, GOLD_CANDIDATES, GOLD_MERGES } from './src/data/goldSet.js';
import type { Claim, Group, GroupIntegrityReport } from './src/types.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const modelName = "gemini-3.6-flash";

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// standalone logic inside API so it uses the real prompt
// We will just use the real API functions, but mock global fetch to point to localhost.
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (url.toString().startsWith('/api')) {
    url = 'http://localhost:3000' + url;
  }
  return originalFetch(url, options);
};

// ... evaluatePipeline ...
const evaluatePipeline = (rawGroups: Group[], groups: Group[], allClaims: Claim[]) => {
  const report = {
    correctMerges: [] as any[],
    missedMerges: [] as any[],
    falseMerges: [] as any[],
    oppositionCalls: { correct: 0, falsePositive: [] as any[], falseNegative: 0 },
    alignmentMetrics: { truePositives: 0, falsePositives: 0, falseNegatives: 0 },
    integrityReport: validateGroupIntegrity(rawGroups, allClaims)
  };

  const findGroupsForSentences = (sentences: string[]) => {
    const foundGroups = new Set<string>();
    const matchedClaims: Claim[] = [];
    sentences.forEach(expectedSentence => {
      const claim = allClaims.find(c => c.source_sentence.includes(expectedSentence) || expectedSentence.includes(c.source_sentence));
      if (claim) {
        matchedClaims.push(claim);
        const group = groups.find(g => g.claim_ids.includes(claim.id));
        if (group) foundGroups.add(group.group_id);
      }
    });
    return { foundGroups: Array.from(foundGroups), matchedClaims };
  };

  const usedGroupIds = new Set<string>();
  GOLD_MERGES.forEach(gold => {
    const { foundGroups, matchedClaims } = findGroupsForSentences(gold.expectedSentences);
    const isOpposedGold = gold.relation === 'opposed';
    if (foundGroups.length === 1 && matchedClaims.length >= gold.expectedSentences.length * 0.8) {
      report.correctMerges.push({ gold: gold.name, pipelineGroupId: foundGroups[0], sentences: matchedClaims.map(c => c.source_sentence) });
      usedGroupIds.add(foundGroups[0]);
      if (isOpposedGold) {
        const group = groups.find(g => g.group_id === foundGroups[0]);
        if (group && group.relation === 'opposed') report.oppositionCalls.correct++;
        else report.oppositionCalls.falseNegative++;
      }
    } else if (foundGroups.length > 1) {
      report.missedMerges.push({ gold: gold.name, sentences: gold.expectedSentences, foundInGroups: foundGroups });
      if (isOpposedGold) report.oppositionCalls.falseNegative++;
    } else if (foundGroups.length === 0) {
      report.missedMerges.push({ gold: gold.name, sentences: gold.expectedSentences, foundInGroups: [] });
      if (isOpposedGold) report.oppositionCalls.falseNegative++;
    }
  });

  groups.forEach(g => {
    if (g.relation === 'opposed') {
      const isKnownGold = GOLD_MERGES.some(gold => {
        if (gold.relation !== 'opposed') return false;
        const { foundGroups } = findGroupsForSentences(gold.expectedSentences);
        return foundGroups.includes(g.group_id);
      });
      if (!isKnownGold) {
        report.oppositionCalls.falsePositive.push({ pipelineGroupId: g.group_id, reason: `Pipeline marked as opposed but not in gold set: ${g.disagreement || 'No reason'}` });
      }
    }
  });

  let alignTP = 0, alignFP = 0, alignFN = 0;
  const sentenceToGold = new Map<string, string>();
  GOLD_MERGES.forEach(g => g.expectedSentences.forEach(s => sentenceToGold.set(s, g.name)));

  groups.forEach(g => {
    const groupSentences = g.claim_ids.map(id => allClaims.find(c => c.id === id)?.source_sentence).filter(Boolean) as string[];
    let distinctGoldConcepts = new Set<string>();
    groupSentences.forEach(s => {
      const goldConcept = sentenceToGold.get(s);
      if (goldConcept) distinctGoldConcepts.add(goldConcept);
    });

    if (distinctGoldConcepts.size > 1) report.falseMerges.push({ pipelineGroupId: g.group_id, sentences: groupSentences });
    
    for(let i=0; i<groupSentences.length; i++) {
      for(let j=i+1; j<groupSentences.length; j++) {
        const g1 = sentenceToGold.get(groupSentences[i]);
        const g2 = sentenceToGold.get(groupSentences[j]);
        if (g1 && g2) {
          if (g1 === g2) alignTP++; else alignFP++;
        } else {
          alignFP++;
        }
      }
    }
  });

  GOLD_MERGES.forEach(gold => {
    const matchedClaims = allClaims.filter(c => gold.expectedSentences.some(s => s.includes(c.source_sentence) || c.source_sentence.includes(s)));
    for(let i=0; i<matchedClaims.length; i++) {
      for(let j=i+1; j<matchedClaims.length; j++) {
        const sameGroup = groups.some(g => g.claim_ids.includes(matchedClaims[i].id) && g.claim_ids.includes(matchedClaims[j].id));
        if (!sameGroup) alignFN++;
      }
    }
  });

  report.alignmentMetrics = { truePositives: alignTP, falsePositives: alignFP, falseNegatives: alignFN };
  return report;
};

// Retry helper
async function retry<T>(fn: () => Promise<T>, retries = 5, retryDelay = 20000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (retries === 0) throw err;
    console.log(`Failed: ${err.message}. Retrying in ${retryDelay/1000}s... (${retries} left)`);
    await delay(retryDelay);
    return retry(fn, retries - 1, retryDelay + 10000); // Backoff
  }
}

async function standaloneExtract(text: string, prefix: string): Promise<Claim[]> {
  const prompt = `You extract atomic claims from a text. An atomic claim is a single assertion that could independently be true or false. Split compound sentences into separate claims. One sentence often contains two or three claims — split them.

For each claim, assign exactly one type:
- date — a specific date, deadline, or time period
- quantity — a number, threshold, limit, price, or measurement
- version — a product version, release, tier, or SKU name
- citation — a reference to a named source, document, standard, or study
- capability — an assertion that something can or cannot do X
- requirement — an assertion that X is required, mandatory, or a prerequisite
- causal — an assertion that X causes or leads to Y
- recommendation — advice about what someone should do. NOT a factual claim.
- opinion — a value judgment with no truth value
- inference — a conclusion the author drew rather than a fact they assert

Rules:
- Preserve hedging. "May become a bottleneck" is different from "will become a bottleneck." Do not strip qualifiers.
- Do not merge claims. Do not summarize.
- Quote the exact source sentence for every claim.
- Do not invent claims that are not in the text.

Prefix claim IDs with the candidate letter (${prefix}1, ${prefix}2...).

Return JSON only, no markdown fences:
{"claims":[{"id":"A1","text":"...","type":"...","source_sentence":"...","hedged":true|false}]}

Text to process:
${text}`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          claims: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                text: { type: "string" },
                type: {
                  type: "string",
                  enum: [
                    "date", "quantity", "version", "citation",
                    "capability", "requirement", "causal",
                    "recommendation", "opinion", "inference"
                  ]
                },
                source_sentence: { type: "string" },
                hedged: { type: "boolean" }
              },
              required: ["id", "text", "type", "source_sentence", "hedged"]
            }
          }
        },
        required: ["claims"]
      }
    },
  });

  const parsed = JSON.parse(response.text || "{}");
  return parsed.claims || [];
}

async function standaloneAlign(claims: Claim[]): Promise<Group[]> {
  const prompt = `You group atomic claims based on semantic meaning. 
We have claims extracted from multiple candidates. 
Group claims that are semantically equivalent or directly address the exact same concept/metric, even if they disagree.

Relation types:
- "same": Claims assert the same semantic fact, allowing for minor paraphrasing.
- "partial": One claim is a subset or less specific version of another (e.g., "Supports Linux" vs "Supports Ubuntu").
- "opposed": Claims assert mutually exclusive facts about the same concept (e.g., "Costs $5" vs "Costs $10").

Rules:
- Every claim must belong to exactly one group.
- Do not group claims that talk about different concepts.
- Choose one claim's text as the "canonical" representation for the group.
- If relation is "opposed", briefly describe the disagreement in the "disagreement" field.

Return JSON only, no markdown fences:
{"groups":[{"group_id":"G1","claim_ids":["A1","B2"],"canonical":"...","relation":"same|partial|opposed","disagreement":"..."}]}

Claims to group:
${JSON.stringify(claims, null, 2)}`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          groups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                group_id: { type: "string" },
                claim_ids: {
                  type: "array",
                  items: { type: "string" }
                },
                canonical: { type: "string" },
                relation: {
                  type: "string",
                  enum: ["same", "opposed", "partial"]
                },
                disagreement: { type: "string" }
              },
              required: ["group_id", "claim_ids", "canonical", "relation"]
            }
          }
        },
        required: ["groups"]
      }
    },
  });

  const parsed = JSON.parse(response.text || "{}");
  return parsed.groups || [];
}

async function main() {
  console.log("Starting eval...");
  const allClaims = [];
  let charCode = 65; // 'A'
  
  for (const candidate of GOLD_CANDIDATES) {
    const prefix = String.fromCharCode(charCode);
    console.log(`Extracting claims for ${candidate.label} with prefix ${prefix}...`);
    const claims = await retry(() => standaloneExtract(candidate.text, prefix));
    
    // Inject the candidateLabel into the claims like ConsoleTab does
    const enrichedClaims = claims.map(c => ({
      ...c,
      candidateLabel: candidate.label,
    }));
    allClaims.push(...enrichedClaims);
    charCode++;
    
    await delay(2000); // Give the API a breather
  }
  
  console.log(`Extracted ${allClaims.length} claims in total.`);
  console.log("Aligning claims...");
  const rawGroups = await retry(() => standaloneAlign(allClaims));
  const groups = enforceOneGroupPerClaim(rawGroups, allClaims);
  
  console.log("Evaluating pipeline...");
  const report = evaluatePipeline(rawGroups, groups, allClaims);
  
  const alignPrecision = report.alignmentMetrics.truePositives / (report.alignmentMetrics.truePositives + report.alignmentMetrics.falsePositives) || 0;
  const alignRecall = report.alignmentMetrics.truePositives / (report.alignmentMetrics.truePositives + report.alignmentMetrics.falseNegatives) || 0;
  
  const oppTP = report.oppositionCalls.correct;
  const oppFP = report.oppositionCalls.falsePositive.length;
  const oppFN = report.oppositionCalls.falseNegative;
  
  const oppPrecision = oppTP / (oppTP + oppFP) || 0;
  const oppRecall = oppTP / (oppTP + oppFN) || 0;
  
  console.log('--- RESULTS ---');
  console.log(`Alignment Precision: ${(alignPrecision * 100).toFixed(1)}%`);
  console.log(`Alignment Recall: ${(alignRecall * 100).toFixed(1)}%`);
  console.log(`Conflict Precision: ${(oppPrecision * 100).toFixed(1)}%`);
  console.log(`Conflict Recall: ${(oppRecall * 100).toFixed(1)}%`);
  console.log(`False Merges: ${report.falseMerges.length}`);
  console.log(`Integrity Violations: Duplicates=${report.integrityReport.duplicates.length}, Missing=${report.integrityReport.missing.length}, Unknown=${report.integrityReport.unknown.length}`);
  
  if (report.falseMerges.length > 0) {
    console.log('False Merges details:');
    console.log(JSON.stringify(report.falseMerges, null, 2));
  }
}

main().catch(console.error);
