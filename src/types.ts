export type ClaimType =
  | 'date'
  | 'quantity'
  | 'version'
  | 'citation'
  | 'capability'
  | 'requirement'
  | 'causal'
  | 'recommendation'
  | 'opinion'
  | 'inference';

export interface Claim {
  id: string;
  text: string;
  type: ClaimType;
  source_sentence: string;
  hedged: boolean;
  
  // Enriched on client
  candidateLabel?: string;
  originalCandidateId?: string; // e.g., A, B
}

export type Relation = 'same' | 'opposed' | 'partial';

export interface Group {
  group_id: string;
  claim_ids: string[];
  canonical: string;
  relation: Relation;
  disagreement: string | null;
}

export type AgreementStatus = 'unanimous' | 'majority' | 'split' | 'solo';
export type VerifyDecision = 'verify' | 'review' | 'pass' | 'not_applicable';

export interface TriagedGroup extends Group {
  agreement_status: AgreementStatus;
  verify_decision: VerifyDecision;
  verify_reason: string;
  claims: Claim[]; // The actual claims mapped from claim_ids
}

export type ConstraintStatus = 'honors' | 'violates' | 'silent';

export interface ConstraintCheck {
  requirement: string;
  status: ConstraintStatus;
  evidence: string | null;
}

export interface CandidateResult {
  candidateLabel: string;
  checks: ConstraintCheck[];
}

export interface CandidateInput {
  label: string;
  text: string;
}

export interface PipelineResults {
  claims: Claim[];
  groups: TriagedGroup[];
  constraintChecks: CandidateResult[];
  successfulCandidatesCount: number;
}
