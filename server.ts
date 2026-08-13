import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies with a higher limit for large text
  app.use(express.json({ limit: "50mb" }));

  // Stage 2: Claim extraction
  app.post("/api/extract", async (req, res) => {
    try {
      const { text, prefix } = req.body;
      if (!text || !prefix) {
        return res.status(400).json({ error: "Missing text or prefix" });
      }

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
        model: "gemini-2.5-flash",
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

      const jsonStr = response.text;
      if (!jsonStr) {
        throw new Error("Empty response from model");
      }
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error: any) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: error.message || "Failed to extract claims" });
    }
  });

  // Stage 3: Alignment
  app.post("/api/align", async (req, res) => {
    try {
      const { claims } = req.body;
      if (!claims || !Array.isArray(claims)) {
        return res.status(400).json({ error: "Missing claims array" });
      }

      const prompt = `You group claims that assert the same underlying thing, even when worded completely differently. "The database layer is the highest scaling risk" and "Azure SQL could become the bottleneck" are the same claim. "Requires Premium tier" and "Standard tier is sufficient" are OPPOSED claims about the same subject — group them together and mark the group as opposed.

Two claims belong in the same group only if they are about the same subject AND the same property of that subject. Claims about related but distinct things go in separate groups. Sharing vocabulary is not enough. Using different vocabulary is not disqualifying.

For each group set relation:
- same — all members assert compatible things
- opposed — at least two members assert incompatible things
- partial — members overlap but one is meaningfully narrower or more hedged

If members are opposed, name exactly what the disagreement is about in one sentence. Hedging differences alone are not opposition — "may be a risk" and "is a risk" are the same claim at different confidence, which is partial, not opposed.

Every claim must appear in exactly one group. Single-member groups are normal and expected.

Return JSON only, no markdown fences:
{"groups":[{"group_id":"G1","claim_ids":["A3","B2"],"canonical":"one neutral sentence stating the shared claim","relation":"same|opposed|partial","disagreement":"... or null"}]}

Claims to group:
${JSON.stringify(claims, null, 2)}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              groups: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    group_id: { type: "STRING" },
                    claim_ids: {
                      type: "ARRAY",
                      items: { type: "STRING" }
                    },
                    canonical: { type: "STRING" },
                    relation: {
                      type: "STRING",
                      enum: ["same", "opposed", "partial"]
                    },
                    disagreement: { type: "STRING", nullable: true }
                  },
                  required: ["group_id", "claim_ids", "canonical", "relation"]
                }
              }
            },
            required: ["groups"]
          }
        },
      });

      const jsonStr = response.text;
      if (!jsonStr) {
        throw new Error("Empty response from model");
      }
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error: any) {
      console.error("Alignment error:", error);
      res.status(500).json({ error: error.message || "Failed to align claims" });
    }
  });

  // Stage 5: Constraint Check
  app.post("/api/check-constraints", async (req, res) => {
    try {
      const { text, constraints } = req.body;
      if (!text || !constraints) {
        return res.status(400).json({ error: "Missing text or constraints" });
      }

      const prompt = `Here are the user's hard requirements and an AI-generated answer. For each requirement, state whether the answer HONORS it, VIOLATES it, or is SILENT on it. A violation means the answer recommends or assumes something incompatible with the requirement. Quote the exact sentence that violates it. Do not flag a violation unless you can quote it.

Return JSON only: {"checks":[{"requirement":"...","status":"honors|violates|silent","evidence":"... or null"}]}

Requirements:
${constraints}

Answer:
${text}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const jsonStr = response.text;
      if (!jsonStr) {
        throw new Error("Empty response from model");
      }
      const data = JSON.parse(jsonStr);
      res.json(data);
    } catch (error: any) {
      console.error("Constraint check error:", error);
      res.status(500).json({ error: error.message || "Failed to check constraints" });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Support Express v4 syntax
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
