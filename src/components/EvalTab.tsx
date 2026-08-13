import React, { useState } from 'react';
import { Play, RotateCcw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { extractClaims, alignClaims } from '../utils/api';
import { GOLD_QUESTION, GOLD_CANDIDATES, GOLD_MERGES } from '../data/goldSet';
import { PipelineStage } from './PipelineStage';
import type { Claim, Group } from '../types';

interface EvalReport {
  correctMerges: Array<{ gold: string; pipelineGroupId: string; sentences: string[] }>;
  missedMerges: Array<{ gold: string; sentences: string[]; foundInGroups: string[] }>;
  falseMerges: Array<{ pipelineGroupId: string; sentences: string[] }>;
  oppositionCalls: {
    correct: number;
    falsePositive: Array<{ pipelineGroupId: string; reason: string }>;
    falseNegative: number;
  };
}

export function EvalTab() {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<EvalReport | null>(null);
  const [prevReport, setPrevReport] = useState<EvalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'pending' | 'extracting' | 'aligning' | 'evaluating' | 'success' | 'error'>('pending');

  const runEval = async () => {
    setIsRunning(true);
    setError(null);
    if (report) setPrevReport(report);
    setReport(null);

    try {
      setStage('extracting');
      
      const letterMap = ['A', 'B', 'C', 'D'];
      const blinded = GOLD_CANDIDATES.map((c, i) => ({
        ...c,
        prefix: letterMap[i],
      }));

      const extPromises = blinded.map(async (c) => {
        const extracted = await extractClaims(c.text, c.prefix);
        return extracted.map(claim => ({
          ...claim,
          candidateLabel: c.label,
          originalCandidateId: c.prefix
        }));
      });

      const extResults = await Promise.all(extPromises);
      const allClaims = extResults.flat();

      setStage('aligning');
      const shuffled = [...allClaims].sort(() => Math.random() - 0.5);
      const groups = await alignClaims(shuffled);

      setStage('evaluating');
      const evalReport = evaluatePipeline(groups, allClaims);
      setReport(evalReport);
      setStage('success');
    } catch (err: any) {
      setStage('error');
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const evaluatePipeline = (groups: Group[], allClaims: Claim[]): EvalReport => {
    const report: EvalReport = {
      correctMerges: [],
      missedMerges: [],
      falseMerges: [],
      oppositionCalls: {
        correct: 0,
        falsePositive: [],
        falseNegative: 0
      }
    };

    // Helper: Find which group(s) a list of sentences ended up in
    const findGroupsForSentences = (sentences: string[]) => {
      const foundGroups = new Set<string>();
      const matchedClaims: Claim[] = [];

      sentences.forEach(expectedSentence => {
        // Soft match because model might truncate or tweak slightly, though prompt says "exact source sentence"
        const claim = allClaims.find(c => c.source_sentence.includes(expectedSentence) || expectedSentence.includes(c.source_sentence));
        if (claim) {
          matchedClaims.push(claim);
          const group = groups.find(g => g.claim_ids.includes(claim.id));
          if (group) foundGroups.add(group.group_id);
        }
      });
      return { foundGroups: Array.from(foundGroups), matchedClaims };
    };

    // 1. Check Gold Merges
    const usedGroupIds = new Set<string>();

    GOLD_MERGES.forEach(gold => {
      const { foundGroups, matchedClaims } = findGroupsForSentences(gold.expectedSentences);
      
      const isOpposedGold = gold.relation === 'opposed';

      if (foundGroups.length === 1 && matchedClaims.length >= gold.expectedSentences.length * 0.8) {
        // Mostly found in exactly one group
        report.correctMerges.push({
          gold: gold.name,
          pipelineGroupId: foundGroups[0],
          sentences: matchedClaims.map(c => c.source_sentence)
        });
        usedGroupIds.add(foundGroups[0]);

        if (isOpposedGold) {
          const group = groups.find(g => g.group_id === foundGroups[0]);
          if (group && group.relation === 'opposed') {
            report.oppositionCalls.correct++;
          } else {
            report.oppositionCalls.falseNegative++;
          }
        }
      } else if (foundGroups.length > 1) {
        // Split across multiple groups
        report.missedMerges.push({
          gold: gold.name,
          sentences: gold.expectedSentences,
          foundInGroups: foundGroups
        });
        if (isOpposedGold) report.oppositionCalls.falseNegative++;
      } else if (foundGroups.length === 0) {
        // Did not match
        report.missedMerges.push({
          gold: gold.name,
          sentences: gold.expectedSentences,
          foundInGroups: []
        });
        if (isOpposedGold) report.oppositionCalls.falseNegative++;
      }
    });

    // 3. Check Opposition Calls
    groups.forEach(g => {
      if (g.relation === 'opposed') {
        const isKnownGold = GOLD_MERGES.some(gold => {
          if (gold.relation !== 'opposed') return false;
          const { foundGroups } = findGroupsForSentences(gold.expectedSentences);
          return foundGroups.includes(g.group_id);
        });

        if (!isKnownGold) {
          report.oppositionCalls.falsePositive.push({
            pipelineGroupId: g.group_id,
            reason: `Pipeline marked as opposed but not in gold set: ${g.disagreement || 'No reason'}`,
          });
        }
      }
    });

    // (Assuming true oppositions would be checked against a gold opposition if we had one)

    return report;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0D0D0E] text-[#D1D5DB] font-sans p-6">
      <div className="max-w-4xl mx-auto w-full space-y-8">
        
        <div className="flex items-center justify-between border-b border-[#262626] pb-6">
          <div>
            <h2 className="text-xl font-medium text-white">Evaluation Mode</h2>
            <p className="text-sm text-[#737373] mt-1">Run the pipeline against the curated gold set.</p>
          </div>
          <button
            onClick={runEval}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#3B82F6] hover:bg-blue-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
          >
            {isRunning ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {report ? 'Re-run Eval' : 'Run Eval'}
          </button>
        </div>

        {isRunning && (
          <div className="flex flex-col gap-3 max-w-sm">
            <PipelineStage name="Extraction" status={stage === 'extracting' ? 'running' : (stage === 'pending' ? 'pending' : 'success')} />
            <PipelineStage name="Alignment" status={stage === 'aligning' ? 'running' : (['pending', 'extracting'].includes(stage) ? 'pending' : 'success')} />
            <PipelineStage name="Evaluation" status={stage === 'evaluating' ? 'running' : (stage === 'success' ? 'success' : 'pending')} />
          </div>
        )}

        {error && (
          <div className="p-4 bg-[#450A0A] border border-[#991B1B] rounded-lg text-[#FECACA] text-sm">
            Eval failed: {error}
          </div>
        )}

        {report && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#171719] border border-[#262626] rounded-lg p-4 text-center">
                <div className="text-3xl font-light text-[#10B981] mb-1">{report.correctMerges.length}</div>
                <div className="text-[10px] text-[#737373] uppercase tracking-wider font-bold">Correct Merges</div>
              </div>
              <div className="bg-[#171719] border border-[#262626] rounded-lg p-4 text-center">
                <div className="text-3xl font-light text-[#FBBF24] mb-1">{report.missedMerges.length}</div>
                <div className="text-[10px] text-[#737373] uppercase tracking-wider font-bold">Missed Merges</div>
              </div>
              
              {/* Contradiction Metrics */}
              <div className="bg-[#171719] border border-[#262626] rounded-lg p-4 text-center">
                <div className="text-3xl font-light text-[#3B82F6] mb-1">
                  {report.oppositionCalls.correct > 0 || report.oppositionCalls.falsePositive.length > 0
                    ? Math.round((report.oppositionCalls.correct / (report.oppositionCalls.correct + report.oppositionCalls.falsePositive.length)) * 100) + '%'
                    : 'N/A'}
                </div>
                <div className="text-[10px] text-[#737373] uppercase tracking-wider font-bold">Conflict Precision</div>
              </div>
              <div className="bg-[#171719] border border-[#262626] rounded-lg p-4 text-center">
                <div className="text-3xl font-light text-[#8B5CF6] mb-1">
                  {report.oppositionCalls.correct > 0 || report.oppositionCalls.falseNegative > 0
                    ? Math.round((report.oppositionCalls.correct / (report.oppositionCalls.correct + report.oppositionCalls.falseNegative)) * 100) + '%'
                    : 'N/A'}
                </div>
                <div className="text-[10px] text-[#737373] uppercase tracking-wider font-bold">Conflict Recall</div>
              </div>
            </div>

            <div className="space-y-6">
              
              <section>
                <h3 className="text-sm font-medium text-[#10B981] mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Correct Merges
                </h3>
                <div className="space-y-2">
                  {report.correctMerges.map((m, i) => (
                    <div key={i} className="bg-[#111112] border border-[#262626] rounded p-3 text-sm">
                      <div className="text-white font-medium mb-2">{m.gold}</div>
                    </div>
                  ))}
                  {report.correctMerges.length === 0 && <p className="text-xs text-[#737373]">None found.</p>}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-[#FBBF24] mb-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Missed Merges
                </h3>
                <div className="space-y-3">
                  {report.missedMerges.map((m, i) => (
                    <div key={i} className="bg-[#111112] border border-[#B45309]/30 rounded p-4 text-sm">
                      <div className="text-[#FDE68A] font-medium mb-3">{m.gold}</div>
                      <div className="space-y-2">
                        {m.sentences.map((s, j) => (
                          <div key={j} className="text-xs text-[#A3A3A3] font-mono pl-3 border-l-2 border-[#B45309]/50">
                            "{s}"
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-[#737373]">
                        Found split across {m.foundInGroups.length} groups.
                      </div>
                    </div>
                  ))}
                  {report.missedMerges.length === 0 && <p className="text-xs text-[#737373]">None found.</p>}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-[#F87171] mb-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> False Oppositions
                </h3>
                <div className="space-y-2">
                  {report.oppositionCalls.falsePositive.map((fp, i) => (
                    <div key={i} className="bg-[#111112] border border-[#991B1B]/30 rounded p-3 text-sm">
                      <div className="text-[#FECACA] font-mono text-xs">{fp.reason}</div>
                    </div>
                  ))}
                  {report.oppositionCalls.falsePositive.length === 0 && <p className="text-xs text-[#737373]">None found. Perfect.</p>}
                </div>
              </section>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
