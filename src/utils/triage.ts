import { Claim, Group, TriagedGroup, AgreementStatus, VerifyDecision } from '../types';

export function computeTriage(
  groups: Group[],
  allClaims: Claim[],
  totalCandidates: number
): TriagedGroup[] {
  return groups.map((group) => {
    // Map claim IDs to actual claim objects
    const groupClaims = group.claim_ids
      .map((id) => allClaims.find((c) => c.id === id))
      .filter((c): c is Claim => c !== undefined);

    // Determine unique candidates involved in this group
    const uniqueCandidates = new Set(
      groupClaims.map((c) => c.originalCandidateId).filter(Boolean)
    );
    const candidateCount = uniqueCandidates.size;

    // Compute agreement_status
    let agreement_status: AgreementStatus = 'solo';
    if (candidateCount === 1) {
      agreement_status = 'solo';
    } else if (candidateCount === totalCandidates && totalCandidates > 0) {
      agreement_status = 'unanimous';
    } else if (candidateCount > totalCandidates / 2) {
      agreement_status = 'majority';
    } else if (group.relation === 'opposed' && candidateCount > 1) {
      agreement_status = 'split';
    } else {
      // If it's 2 out of 4, it's not majority, it's not unanimous, it's not solo.
      // The prompt does not explicitly define what to call exactly 50%.
      // Let's call it split if opposed, otherwise it falls back. 
      // If not opposed, and >1 but <= half... let's default to split or majority?
      // Wait, prompt: "majority - more than half but not all".
      // "split - represented by multiple candidates with relation: opposed"
      // What if it's 2 out of 4 and relation is 'same'?
      // I'll extend majority to include >= half just for completeness, 
      // or add 'minority'. Let's just use 'split' if not majority, just to fit the 4 labels.
      // Wait, "A group with 2 of 3 candidates is majority, never solo."
      if (candidateCount > 1) {
        agreement_status = 'majority'; // Fallback if it's 50%.
      }
      if (group.relation === 'opposed' && candidateCount > 1) {
        agreement_status = 'split';
      }
    }

    // Compute claim_type (take the first claim's type, assuming they should be similar, 
    // or if mixed, just take the first. The prompt says "carried through from extraction").
    const claim_type = groupClaims[0]?.type || 'opinion';

    // Compute verify_decision
    let verify_decision: VerifyDecision = 'pass';
    let verify_reason = '';

    const checkableTypes = ['date', 'quantity', 'version', 'citation'];

    if (claim_type === 'opinion' || claim_type === 'recommendation') {
      verify_decision = 'not_applicable';
      verify_reason = 'Not a factual claim';
    } else if (group.relation === 'opposed') {
      verify_decision = 'verify';
      verify_reason = 'models disagree';
    } else if (checkableTypes.includes(claim_type)) {
      verify_decision = 'verify';
      verify_reason = 'checkable fact type — verify even when unanimous';
    } else if (agreement_status === 'solo') {
      verify_decision = 'verify';
      verify_reason = 'asserted by one model only';
    } else if (group.relation === 'partial') {
      verify_decision = 'review';
      verify_reason = 'models differ in scope or confidence';
    } else {
      verify_decision = 'pass';
      verify_reason = 'unanimous or majority agreement on uncheckable fact';
    }

    return {
      ...group,
      claims: groupClaims,
      agreement_status,
      verify_decision,
      verify_reason,
    };
  });
}
