import { Claim, Group, ConstraintCheck } from '../types';

export async function extractClaims(text: string, prefix: string): Promise<Claim[]> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, prefix }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to extract claims');
  }
  const data = await res.json();
  return data.claims || [];
}

export async function alignClaims(claims: Claim[]): Promise<Group[]> {
  const res = await fetch('/api/align', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claims }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to align claims');
  }
  const data = await res.json();
  return data.groups || [];
}

export async function checkConstraints(text: string, constraints: string): Promise<ConstraintCheck[]> {
  const res = await fetch('/api/check-constraints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, constraints }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to check constraints');
  }
  const data = await res.json();
  return data.checks || [];
}
