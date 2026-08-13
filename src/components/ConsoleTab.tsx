import React, { useState } from 'react';
import { Lock, Unlock, Play, RotateCcw, AlertTriangle, Bug } from 'lucide-react';
import { extractClaims, alignClaims, checkConstraints } from '../utils/api';
import { computeTriage } from '../utils/triage';
import { PipelineStage } from './PipelineStage';
import type { 
  CandidateInput, PipelineResults, Claim, TriagedGroup, CandidateResult 
} from '../types';

export function ConsoleTab() {
  const [question, setQuestion] = useState('');
  const [constraints, setConstraints] = useState('');
  const [candidates, setCandidates] = useState<CandidateInput[]>([
    { label: 'ChatGPT', text: '' },
    { label: 'Claude', text: '' }
  ]);
  
  // Pipeline State
  const [isRunning, setIsRunning] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  
  const [stageExt, setStageExt] = useState<'pending'|'running'|'success'|'error'>('pending');
  const [stageAlign, setStageAlign] = useState<'pending'|'running'|'success'|'error'>('pending');
  const [stageCheck, setStageCheck] = useState<'pending'|'running'|'success'|'error'>('pending');
  
  const [extError, setExtError] = useState('');
  const [alignError, setAlignError] = useState('');
  const [checkError, setCheckError] = useState('');
  
  const [results, setResults] = useState<PipelineResults | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<TriagedGroup | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const addCandidate = () => {
    if (candidates.length < 4) {
      setCandidates([...candidates, { label: `Model ${candidates.length + 1}`, text: '' }]);
    }
  };

  const removeCandidate = (idx: number) => {
    if (candidates.length > 2) {
      setCandidates(candidates.filter((_, i) => i !== idx));
    }
  };

  const updateCandidate = (idx: number, field: keyof CandidateInput, value: string) => {
    const next = [...candidates];
    next[idx][field] = value;
    setCandidates(next);
  };

  const startOver = () => {
    setIsLocked(false);
    setIsRunning(false);
    setResults(null);
    setSelectedGroup(null);
    setStageExt('pending');
    setStageAlign('pending');
    setStageCheck('pending');
  };

  const runPipeline = async (retryStage?: 'ext' | 'align' | 'check') => {
    setIsRunning(true);
    setIsLocked(true);
    
    let currentClaims: Claim[] = results?.claims || [];
    let currentGroups: TriagedGroup[] = results?.groups || [];
    let currentChecks: CandidateResult[] = results?.constraintChecks || [];

    const shouldRunExt = !retryStage || retryStage === 'ext';
    
    // STAGE 1 & 2: Extraction
    if (shouldRunExt) {
      setStageExt('running');
      setExtError('');
      try {
        // Stage 1: Blinding
        const letterMap = ['A', 'B', 'C', 'D'];
        const blinded = candidates.map((c, i) => ({
          ...c,
          prefix: letterMap[i],
          anonId: `Candidate ${letterMap[i]}`
        }));

        // Stage 2: Extraction (Parallel)
        const extPromises = blinded.map(async (c) => {
          if (!c.text.trim()) return [];
          const extracted = await extractClaims(c.text, c.prefix);
          return extracted.map(claim => ({
            ...claim,
            candidateLabel: c.label,
            originalCandidateId: c.prefix
          }));
        });

        const extResults = await Promise.allSettled(extPromises);
        
        let allClaims: Claim[] = [];
        let failedCandidates: string[] = [];
        
        extResults.forEach((res, index) => {
          if (res.status === 'fulfilled') {
            allClaims = allClaims.concat(res.value);
          } else {
            failedCandidates.push(blinded[index].label);
          }
        });

        if (failedCandidates.length > 0) {
          if (allClaims.length > 0) {
            currentClaims = allClaims; // Preserve successful ones
          }
          throw new Error(`Extraction failed for: ${failedCandidates.join(', ')}`);
        }

        if (allClaims.length === 0) {
          throw new Error("No claims could be extracted from any candidate.");
        }

        currentClaims = allClaims;
        setStageExt('success');
      } catch (err: any) {
        setStageExt('error');
        setExtError(err.message);
        setIsRunning(false);
        return;
      }
    }

    const shouldRunAlign = shouldRunExt || retryStage === 'align';

    // STAGE 3: Alignment
    if (shouldRunAlign && currentClaims.length > 0) {
      setStageAlign('running');
      setAlignError('');
      try {
        // Shuffle claims as requested to prevent model bias
        const shuffled = [...currentClaims].sort(() => Math.random() - 0.5);
        
        // AC-01: Blinding. Strip candidate identity before alignment.
        const blindedClaims = shuffled.map(c => ({
          id: c.id,
          text: c.text,
          type: c.type,
          source_sentence: c.source_sentence,
          hedged: c.hedged
        }));
        
        const groups = await alignClaims(blindedClaims as Claim[]);
        
        // Stage 4: Triage (Deterministic)
        const validCandidatesCount = candidates.filter(c => c.text.trim().length > 0).length;
        currentGroups = computeTriage(groups, currentClaims, validCandidatesCount);
        
        // Sort: verify rows first
        currentGroups.sort((a, b) => {
          if (a.verify_decision === 'verify' && b.verify_decision !== 'verify') return -1;
          if (a.verify_decision !== 'verify' && b.verify_decision === 'verify') return 1;
          return 0;
        });

        setStageAlign('success');
      } catch (err: any) {
        setStageAlign('error');
        setAlignError(err.message);
        setIsRunning(false);
        // Save intermediate state
        setResults({ claims: currentClaims, groups: currentGroups, constraintChecks: currentChecks });
        return;
      }
    }

    const shouldRunCheck = (shouldRunAlign || retryStage === 'check') && constraints.trim();

    // STAGE 5: Constraint Check
    if (shouldRunCheck) {
      setStageCheck('running');
      setCheckError('');
      try {
        const checkPromises = candidates.map(async (c) => {
          if (!c.text.trim()) return { candidateLabel: c.label, checks: [] };
          const checks = await checkConstraints(c.text, constraints);
          return { candidateLabel: c.label, checks };
        });

        const checkResults = await Promise.allSettled(checkPromises);
        currentChecks = checkResults.map((r, i) => 
          r.status === 'fulfilled' ? r.value : { candidateLabel: candidates[i].label, checks: [] }
        );
        
        setStageCheck('success');
      } catch (err: any) {
        setStageCheck('error');
        setCheckError(err.message);
        setIsRunning(false);
        // Save intermediate state
        setResults({ claims: currentClaims, groups: currentGroups, constraintChecks: currentChecks });
        return;
      }
    } else if (!constraints.trim()) {
      setStageCheck('success'); // Skip
    }

    setResults({
      claims: currentClaims,
      groups: currentGroups,
      constraintChecks: currentChecks
    });
    setIsRunning(false);
  };

  const getDecisionChip = (decision: string) => {
    switch(decision) {
      case 'verify': return 'px-2 py-0.5 bg-[#FBBF24] text-black text-[9px] font-black rounded uppercase';
      case 'review': return 'px-2 py-0.5 bg-[#3B82F6] text-white text-[9px] font-black rounded uppercase';
      case 'pass': return 'px-2 py-0.5 bg-[#10B981] text-black text-[9px] font-black rounded uppercase';
      default: return 'px-2 py-0.5 bg-[#404040] text-[#A3A3A3] text-[9px] font-black rounded uppercase';
    }
  };

  const getStatusClass = (status: string) => {
    switch(status) {
      case 'split': return 'text-[#F87171] uppercase text-[9px] font-bold';
      default: return 'text-white uppercase text-[9px] font-bold';
    }
  };

  const getRowClass = (decision: string) => {
    switch(decision) {
      case 'verify': return 'bg-[#1E1B13] border-l-4 border-[#FBBF24] hover:bg-[#2A2617] cursor-pointer';
      case 'review': return 'bg-[#11161E] border-l-4 border-[#3B82F6] hover:bg-[#1A1F29] cursor-pointer';
      default: return 'bg-[#111112] hover:bg-[#1A1A1C] cursor-pointer';
    }
  };

  // Compute stats for counts bar
  const stats = {
    claims: results?.claims.length || 0,
    groups: results?.groups.length || 0,
    unanimous: results?.groups.filter(g => g.agreement_status === 'unanimous').length || 0,
    majority: results?.groups.filter(g => g.agreement_status === 'majority').length || 0,
    split: results?.groups.filter(g => g.agreement_status === 'split').length || 0,
    solo: results?.groups.filter(g => g.agreement_status === 'solo').length || 0,
    verify: results?.groups.filter(g => g.verify_decision === 'verify').length || 0,
    na: results?.groups.filter(g => g.verify_decision === 'not_applicable').length || 0,
  };

  const violations = results?.constraintChecks.flatMap(c => 
    c.checks.filter(chk => chk.status === 'violates').map(chk => ({ ...chk, candidate: c.candidateLabel }))
  ) || [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0D0D0E] text-[#D1D5DB] font-sans">
      
      {/* Input Section */}
      <div className="flex-none p-6 border-b border-[#262626] bg-[#111112] overflow-y-auto max-h-[50vh]">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#737373]">Original Question</label>
              <textarea
                disabled={isLocked}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                className="w-full h-32 bg-[#171719] border border-[#262626] rounded-lg p-3 text-sm focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] outline-none disabled:opacity-50 resize-none transition-colors"
                placeholder="Paste the prompt given to the models..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#737373]">Constraints (Optional)</label>
              <textarea
                disabled={isLocked}
                value={constraints}
                onChange={e => setConstraints(e.target.value)}
                className="w-full h-32 bg-[#171719] border border-[#262626] rounded-lg p-3 text-sm focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] outline-none disabled:opacity-50 resize-none transition-colors"
                placeholder="Hard requirements, one per line..."
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[#737373]">Candidate Answers</label>
              {!isLocked && candidates.length < 4 && (
                <button onClick={addCandidate} className="text-xs text-[#3B82F6] hover:text-blue-400">
                  + Add Candidate
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {candidates.map((c, idx) => (
                <div key={idx} className="flex flex-col gap-2 p-3 bg-[#171719] border border-[#262626] rounded-lg relative group">
                  <div className="flex items-center justify-between">
                    <input
                      disabled={isLocked}
                      value={c.label}
                      onChange={e => updateCandidate(idx, 'label', e.target.value)}
                      className="bg-transparent border-b border-transparent hover:border-[#262626] focus:border-[#3B82F6] text-sm font-medium outline-none w-full mr-4 transition-colors disabled:opacity-50 text-white"
                    />
                    {!isLocked && candidates.length > 2 && (
                      <button onClick={() => removeCandidate(idx)} className="text-[#737373] hover:text-[#F87171] absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        &times;
                      </button>
                    )}
                    {isLocked && <Lock className="w-3 h-3 text-[#737373] absolute right-3" />}
                  </div>
                  <textarea
                    disabled={isLocked}
                    value={c.text}
                    onChange={e => updateCandidate(idx, 'text', e.target.value)}
                    className="w-full h-40 bg-transparent text-sm resize-none outline-none disabled:opacity-50 font-mono text-xs text-[#A3A3A3]"
                    placeholder="Paste answer..."
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Controls & Pipeline status */}
          <div className="flex items-center gap-4 pt-4 border-t border-[#262626]">
            {!isLocked ? (
              <button
                onClick={() => runPipeline()}
                disabled={!question.trim() || candidates.every(c => !c.text.trim())}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#3B82F6] hover:bg-blue-500 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                Run Analysis
              </button>
            ) : (
              <button
                onClick={startOver}
                className="flex items-center gap-2 px-4 py-2 border border-[#F87171]/20 hover:bg-[#F87171]/10 text-[#F87171] rounded-md font-bold uppercase tracking-widest text-[10px] transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                Start Over
              </button>
            )}

            {isLocked && (
              <div className="flex items-center gap-3 ml-auto">
                <PipelineStage name="Extraction" status={stageExt} error={extError} onRetry={() => runPipeline('ext')} />
                <PipelineStage name="Alignment" status={stageAlign} error={alignError} onRetry={() => runPipeline('align')} />
                {constraints.trim() && (
                   <PipelineStage name="Constraints" status={stageCheck} error={checkError} onRetry={() => runPipeline('check')} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Section */}
      {results && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0D0D0E] relative">
            
            {/* Counts Bar */}
            <div className="flex items-center gap-6 px-6 py-2.5 bg-[#171719] border-b border-[#262626] text-[10px] font-mono tracking-wider overflow-x-auto whitespace-nowrap shrink-0">
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">Claims:</span> <span className="text-white">{stats.claims}</span></div>
              <div className="w-px h-3 bg-[#262626]"></div>
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">Groups:</span> <span className="text-white">{stats.groups}</span></div>
              <div className="w-px h-3 bg-[#262626]"></div>
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">Unanimous:</span> <span className="text-white">{stats.unanimous}</span></div>
              <div className="w-px h-3 bg-[#262626]"></div>
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">Majority:</span> <span className="text-white">{stats.majority}</span></div>
              <div className="w-px h-3 bg-[#262626]"></div>
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">Split:</span> <span className="text-[#F87171]">{stats.split}</span></div>
              <div className="w-px h-3 bg-[#262626]"></div>
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">Solo:</span> <span className="text-white">{stats.solo}</span></div>
              <div className="w-px h-3 bg-[#262626]"></div>
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">To Verify:</span> <span className="text-[#FBBF24] font-bold">{stats.verify}</span></div>
              <div className="w-px h-3 bg-[#262626]"></div>
              <div className="flex gap-2 items-center"><span className="text-[#737373] uppercase">N/A:</span> <span className="text-white">{stats.na}</span></div>
            </div>

            {/* Constraint Drift Banner */}
            {violations.length > 0 && (
              <div className="flex flex-col shrink-0">
                {violations.map((v, i) => (
                  <div key={i} className="px-6 py-2 bg-[#450A0A] border-b border-[#991B1B] flex items-center gap-3">
                    <span className="flex-none px-2 py-0.5 bg-[#991B1B] text-white text-[9px] font-bold rounded uppercase tracking-tighter">Constraint Drift</span>
                    <span className="text-[11px] text-[#FECACA] font-medium">{v.candidate}: Violation of '{v.requirement}' - "{v.evidence}"</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              {/* Matrix */}
              <section className="flex-1 border-r border-[#262626] flex flex-col">
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 bg-[#111112] z-10 border-b border-[#262626]">
                      <tr className="text-[10px] text-[#737373] uppercase tracking-widest">
                        <th className="p-3 font-semibold w-1/3">Canonical Claim</th>
                        {candidates.map((c, i) => (
                          <th key={i} className="p-3 font-semibold text-center w-12">{c.label}</th>
                        ))}
                        <th className="p-3 font-semibold w-24">Type</th>
                        <th className="p-3 font-semibold w-24">Status</th>
                        <th className="p-3 font-semibold w-28">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="text-[11px] font-mono leading-relaxed divide-y divide-[#262626]">
                      {results.groups.map((g) => {
                        const isSelected = selectedGroup?.group_id === g.group_id;
                        return (
                          <tr 
                            key={g.group_id}
                            onClick={() => setSelectedGroup(g)}
                            className={getRowClass(g.verify_decision)}
                          >
                            <td className="p-3 text-white">
                              {g.canonical}
                            </td>
                            {candidates.map((c, i) => {
                              const hasClaim = g.claims.some(claim => claim.candidateLabel === c.label);
                              const isOpposed = g.relation === 'opposed';
                              return (
                                <td key={i} className={`p-3 text-center ${hasClaim ? (isOpposed ? 'text-[#F87171] font-bold' : 'text-[#10B981] font-bold') : 'text-[#737373]'}`}>
                                  {hasClaim ? (isOpposed ? '✗' : '✓') : '—'}
                                </td>
                              );
                            })}
                            <td className="p-3">
                              <span className="px-1.5 py-0.5 bg-black rounded text-[#A3A3A3] text-[9px] uppercase">
                                {g.claims[0]?.type || 'unknown'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={getStatusClass(g.agreement_status)}>
                                {g.agreement_status}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={getDecisionChip(g.verify_decision)}>
                                {g.verify_decision}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Inspector */}
              {selectedGroup && (
                <aside className="w-80 bg-[#111112] shrink-0 flex flex-col p-5 overflow-y-auto border-l border-[#262626]">
                  <div className="mb-6">
                    <h2 className="text-[10px] font-bold text-[#737373] uppercase tracking-[0.2em] mb-3">Claim Inspector</h2>
                    
                    <div className="p-3 bg-black border border-[#262626] rounded-lg mb-4">
                      <p className="text-xs leading-relaxed text-white font-medium">
                        "{selectedGroup.canonical}"
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {selectedGroup.claims.map(c => (
                        <div key={c.id} className="p-2 bg-[#262626]/40 rounded border border-transparent">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-bold text-[#3B82F6] uppercase">
                              {c.candidateLabel} {c.hedged && <span className="text-[#FBBF24] lowercase font-normal">(hedged)</span>}
                            </span>
                            <span className="text-[8px] text-[#737373] font-mono">#{c.id}</span>
                          </div>
                          <p className="text-[10px] text-[#A3A3A3] italic leading-tight">
                            "{c.source_sentence}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto pt-6 border-t border-[#262626]">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-[#737373] font-bold uppercase">Relation</span>
                        <span className={`text-[10px] uppercase font-bold ${selectedGroup.relation === 'opposed' ? 'text-[#F87171]' : 'text-[#10B981]'}`}>
                          {selectedGroup.relation}
                        </span>
                      </div>
                      
                      {selectedGroup.relation === 'opposed' && selectedGroup.disagreement && (
                        <div className="p-2 bg-[#450A0A]/30 border border-[#991B1B]/30 rounded text-[10px] text-[#FECACA]">
                          {selectedGroup.disagreement}
                        </div>
                      )}

                      <div className="flex justify-between items-center mt-3">
                        <span className="text-[10px] text-[#737373] font-bold uppercase">Triage Reason</span>
                        <span className="text-[10px] text-white font-mono uppercase">{selectedGroup.verify_decision}</span>
                      </div>
                      <p className="text-[10px] text-[#737373]">{selectedGroup.verify_reason}</p>
                    </div>
                  </div>
                </aside>
              )}
            </div>

            {/* Debug Toggle */}
            <div className="px-6 py-4 border-t border-[#262626] bg-[#0A0A0B]">
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className="flex items-center gap-2 text-[10px] font-mono text-[#525252] hover:text-[#737373]"
              >
                <Bug className="w-3 h-3" />
                {showDebug ? 'HIDE RAW JSON' : 'SHOW RAW JSON DEBUG'}
              </button>
              
              {showDebug && (
                <div className="mt-4 bg-black border border-[#262626] rounded p-4 overflow-auto max-h-[500px]">
                  <pre className="text-[10px] text-[#737373] font-mono">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </div>
              )}
            </div>

        </div>
      )}
    </div>
  );
}
