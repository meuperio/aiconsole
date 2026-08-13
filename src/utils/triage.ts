import { Claim, Group, TriagedGroup, AgreementStatus, VerifyDecision } from '../types';

export function enforceOneGroupPerClaim(groups: Group[], allClaims: Claim[]): Group[] {
  const usedClaimIds = new Set<string>();
  const validGroups: Group[] = [];
  let groupCounter = groups.length + 1;

  for (const g of groups) {
    const uniqueClaimsForGroup = [];
    for (const cid of g.claim_ids) {
      if (!usedClaimIds.has(cid)) {
        usedClaimIds.add(cid);
        uniqueClaimsForGroup.push(cid);
      }
    }
    if (uniqueClaimsForGroup.length > 0) {
      validGroups.push({ ...g, claim_ids: uniqueClaimsForGroup });
    }
  }

  // Any missing claims get their own solo group (AC-03 validation constraint)
  for (const c of allClaims) {
    if (!usedClaimIds.has(c.id)) {
      validGroups.push({
        group_id: `G_orphan_${groupCounter++}`,
        claim_ids: [c.id],
        canonical: c.text,
        relation: 'same',
        disagreement: null,
      });
    }
  }

  return validGroups;
}

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
    if (group.relation === 'opposed') {
      agreement_status = 'split';
    } else if (candidateCount === totalCandidates && totalCandidates > 0) {
      agreement_status = 'unanimous';
    } else if (candidateCount > totalCandidates / 2) {
      agreement_status = 'majority';
    } else if (candidateCount === 1) {
      agreement_status = 'solo';
    } else {
      // Fallback for minority matching "partial/minority" from BRD but keeping it within current types.
      agreement_status = 'split'; 
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
    } else if (claim_type === 'capability') {
      verify_decision = 'verify';
      verify_reason = 'capability assertions require external grounding';
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
