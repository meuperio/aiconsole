# AI Console MVP 0.1 - Build Plan

This document tracks the remaining tasks and known gaps based on the initial MVP 0.1 Business Requirements Document (BRD) and subsequent evaluation.

## 1. Partial Extraction Continuation
**Status:** COMPLETE
**Problem:** While `Promise.allSettled` catches failures so the app doesn't crash, the UI and state management do not robustly handle these partial states (e.g., allowing a user to seamlessly retry *only* the failed candidate, or accurately reflecting the missing candidate in the downstream matrices without breaking indices).
**Tasks:**
- [x] Refactor the pipeline state to track extraction success/failure on a per-candidate basis.
- [x] Update the UI to show specific "Retry" buttons for individual failed candidates.
- [x] Ensure downstream alignment and triage gracefully handle the exact number of *successful* candidates for majority/unanimous math.

## 2. Claim-Group Integrity (AC-03)
**Status:** COMPLETE
**Problem:** The current `enforceOneGroupPerClaim` strips duplicates and orphans missing claims, but doing this post-LLM generation can create disjointed UI rendering if the LLM hallucinated group relationships or dropped canonical claims. It is a brute-force fix rather than a systemic one.
**Tasks:**
- [x] Implement a robust bipartite graph or set-cover validation for claim grouping.
- [x] Pass strict JSON schema definitions to the Gemini API (using `responseSchema` for Structured Outputs) to mathematically prevent the LLM from omitting claims or duplicating them across groups.
- [x] Add explicit application-level error throwing or fallback routing if the structural integrity of the group mapping is violated by the model.

## 3. False-Merge Measurement
**Status:** COMPLETE
**Problem:** The evaluation tab measures alignment pairwise (precision/recall), but it lacks a dedicated metric explicitly highlighting *False Merges* (i.e., when two fundamentally unrelated claims are incorrectly grouped together).
**Tasks:**
- [x] Define "False Merge" strictly in the evaluation logic (e.g., when a single pipeline group spans multiple distinct Gold concepts).
- [x] Add a dedicated UI metric card in the Eval Tab for "False Merges".
- [x] Log the specific false-merged sentences to the Eval output to aid in prompt tuning.

## 4. Gold-Set Breadth
**Status:** COMPLETE
**Problem:** The current benchmark in `src/data/goldSet.ts` contains only 4 candidates and a handful of concepts. The BRD targets 100 scenarios across paraphrases, hedging, solo claims, and contradictions.
**Tasks:**
- [x] Expand the gold set with 15-20 true contradiction pairs.
- [x] Expand the gold set with 15-20 strong paraphrases (equivalent claims).
- [x] Expand the gold set with 15-20 scope/hedging differences (partial matches).
- [x] Expand the gold set with unrelated claims to test false-merge resilience.

## 5. Automated Tests / CI
**Status:** COMPLETE
**Problem:** There is no automated testing suite (Unit/Integration) to verify the deterministic triage logic without running the full LLM pipeline.
**Tasks:**
- [x] Install and configure a testing framework (e.g., Vitest).
- [x] Write unit tests for `computeTriage` to guarantee agreement status (unanimous, majority, split, solo) and verification decisions behave deterministically.
- [x] Write unit tests for the evaluation engine metrics (precision/recall calculations).

## 6. Build Verification
**Status:** COMPLETE
**Problem:** No mechanism exists to strictly verify the build, types, and tests in a single command pipeline.
**Tasks:**
- [x] Setup standard npm scripts (`npm run verify`) that chains linting, type-checking, and unit tests.
- [x] (Future) Add CI workflow configuration (e.g., GitHub Actions) to run this verification automatically on code changes.

