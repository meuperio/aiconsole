import { describe, it, expect } from 'vitest';
import { computeTriage, enforceOneGroupPerClaim } from './triage';
import type { Claim, Group } from '../types';

describe('Triage Logic', () => {
  it('correctly sets split status when relation is opposed', () => {
    const claims: Claim[] = [
      { id: '1', text: 'claim 1', type: 'capability', candidateLabel: 'Candidate A', originalCandidateId: 'A', source_sentence: '', hedged: false },
      { id: '2', text: 'claim 2', type: 'capability', candidateLabel: 'Candidate B', originalCandidateId: 'B', source_sentence: '', hedged: false },
      { id: '3', text: 'claim 3', type: 'capability', candidateLabel: 'Candidate C', originalCandidateId: 'C', source_sentence: '', hedged: false },
    ];
    
    // Group with 3 candidates, opposed relation.
    // Even though it's 3 candidates (unanimous in number), relation takes precedence.
    const groups: Group[] = [
      { group_id: 'G1', claim_ids: ['1', '2', '3'], canonical: 'Some canonical', relation: 'opposed', disagreement: null }
    ];

    const result = computeTriage(groups, claims, 3);
    
    expect(result[0].agreement_status).toBe('split');
    expect(result[0].verify_decision).toBe('verify');
  });

  it('correctly marks capability types as verify regardless of agreement', () => {
    const claims: Claim[] = [
      { id: '1', text: 'claim 1', type: 'capability', candidateLabel: 'Candidate A', originalCandidateId: 'A', source_sentence: '', hedged: false },
      { id: '2', text: 'claim 2', type: 'capability', candidateLabel: 'Candidate B', originalCandidateId: 'B', source_sentence: '', hedged: false },
    ];
    
    const groups: Group[] = [
      { group_id: 'G1', claim_ids: ['1', '2'], canonical: 'Canonical', relation: 'same', disagreement: null }
    ];

    const result = computeTriage(groups, claims, 2);
    
    expect(result[0].agreement_status).toBe('unanimous');
    expect(result[0].verify_decision).toBe('verify'); // Capability must be verified
  });

  it('correctly sets unanimous status when all candidates agree and relation is same', () => {
    const claims: Claim[] = [
      { id: '1', text: 'claim 1', type: 'inference', candidateLabel: 'Candidate A', originalCandidateId: 'A', source_sentence: '', hedged: false },
      { id: '2', text: 'claim 2', type: 'inference', candidateLabel: 'Candidate B', originalCandidateId: 'B', source_sentence: '', hedged: false },
    ];
    
    const groups: Group[] = [
      { group_id: 'G1', claim_ids: ['1', '2'], canonical: 'Canonical', relation: 'same', disagreement: null }
    ];

    const result = computeTriage(groups, claims, 2);
    
    expect(result[0].agreement_status).toBe('unanimous');
    expect(result[0].verify_decision).toBe('pass'); 
  });
  
  it('correctly handles solo factual claims', () => {
    const claims: Claim[] = [
      { id: '1', text: 'claim 1', type: 'version', candidateLabel: 'Candidate A', originalCandidateId: 'A', source_sentence: '', hedged: false },
    ];
    
    const groups: Group[] = [
      { group_id: 'G1', claim_ids: ['1'], canonical: 'Canonical', relation: 'same', disagreement: null }
    ];

    const result = computeTriage(groups, claims, 2);
    
    expect(result[0].agreement_status).toBe('solo');
    expect(result[0].verify_decision).toBe('verify'); // Version is a checkable type
  });
});

describe('Claim Group Integrity', () => {
  it('enforces one group per claim, stripping duplicates', () => {
    const claims: Claim[] = [
      { id: 'C1', text: 'claim 1', type: 'capability', candidateLabel: 'Candidate A', source_sentence: '', hedged: false },
      { id: 'C2', text: 'claim 2', type: 'capability', candidateLabel: 'Candidate B', source_sentence: '', hedged: false },
      { id: 'C3', text: 'claim 3', type: 'capability', candidateLabel: 'Candidate C', source_sentence: '', hedged: false },
    ];
    
    const rawGroups: Group[] = [
      { group_id: 'G1', claim_ids: ['C1', 'C2', 'C3'], canonical: 'Group 1', relation: 'same', disagreement: null },
      // Hallucinated duplicate C2 by the LLM
      { group_id: 'G2', claim_ids: ['C2'], canonical: 'Group 2', relation: 'same', disagreement: null }
    ];

    const validated = enforceOneGroupPerClaim(rawGroups, claims);
    
    expect(validated.length).toBe(1);
    expect(validated[0].claim_ids).toEqual(['C1', 'C2', 'C3']);
  });

  it('creates orphan groups for claims dropped by LLM', () => {
    const claims: Claim[] = [
      { id: 'C1', text: 'claim 1', type: 'capability', candidateLabel: 'Candidate A', source_sentence: '', hedged: false },
      { id: 'C2', text: 'claim 2', type: 'capability', candidateLabel: 'Candidate B', source_sentence: '', hedged: false },
    ];
    
    const rawGroups: Group[] = [
      { group_id: 'G1', claim_ids: ['C1'], canonical: 'Group 1', relation: 'same', disagreement: null },
    ]; // C2 was dropped

    const validated = enforceOneGroupPerClaim(rawGroups, claims);
    
    expect(validated.length).toBe(2);
    expect(validated[1].claim_ids).toEqual(['C2']);
    expect(validated[1].group_id).toContain('G_orphan');
  });
});
