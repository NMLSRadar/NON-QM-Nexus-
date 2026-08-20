import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';

const APPLY = process.argv.includes('--apply');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase production configuration');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const org = 'bfe87b1c-86e7-4186-b1c4-ecc25d0e4420';
const auditedAt = '2026-08-19T00:00:00.000Z';
const alternativeDocs = new Set(['bank_statement', '1099', 'pnl_only', 'wvoe_only', 'asset_depletion', 'full_doc', 'dscr']);

const { data: lenders, error: lenderError } = await supabase.from('lenders').select('id,name').eq('organization_id', org).is('deleted_at', null);
if (lenderError) throw lenderError;
const { data: programs, error: programError } = await supabase.from('programs').select('id,lender_id,name,active,config').eq('organization_id', org).is('deleted_at', null).order('name');
if (programError) throw programError;
const lenderById = new Map(lenders.map((lender) => [lender.id, lender.name]));

function profileIssues(profile, doc) {
  if (!profile || typeof profile !== 'object') return ['missing_profile'];
  const issues = [];
  if (profile.documentationType !== doc) issues.push('documentation_type_mismatch');
  if (profile.verificationStatus !== 'human_verified') issues.push('not_human_verified');
  for (const field of ['displayName', 'guidelineVersionId', 'guidelineVersionLabel', 'effectiveDate', 'sourceCitation']) {
    if (typeof profile[field] !== 'string' || !profile[field].trim()) issues.push(`missing_${field}`);
  }
  if (!Array.isArray(profile.ruleIds)) issues.push('missing_rule_scope');
  const criteria = profile.criteria;
  if (!criteria || typeof criteria !== 'object') return [...issues, 'missing_criteria'];
  for (const field of ['loanPurposes', 'occupancies', 'propertyTypes', 'citizenshipEligible', 'vestingEligible', 'prepaymentPenaltyOptions']) {
    if (!Array.isArray(criteria[field])) issues.push(`missing_${field}`);
  }
  if (criteria.eligibleStates !== 'ALL' && !Array.isArray(criteria.eligibleStates)) issues.push('missing_eligibleStates');
  for (const field of ['minLoanAmount', 'maxLoanAmount', 'minFico', 'baseMaxLtv', 'minReservesMonths']) {
    if (typeof criteria[field] !== 'number' || !Number.isFinite(criteria[field])) issues.push(`missing_${field}`);
  }
  if (doc !== 'dscr' && (typeof criteria.maxDti !== 'number' || !Number.isFinite(criteria.maxDti))) issues.push('missing_maxDti');
  if (typeof criteria.interestOnlyAvailable !== 'boolean') issues.push('missing_interestOnlyAvailable');
  return issues;
}

const auditRows = [];
const updates = [];
for (const program of programs) {
  const config = program.config ?? {};
  const docs = Array.isArray(config.incomeDocTypes) ? config.incomeDocTypes.filter((doc) => alternativeDocs.has(doc)) : [];
  const multi = docs.length > 1;
  const profiles = config.documentationProfiles ?? {};
  const perDoc = Object.fromEntries(docs.map((doc) => [doc, multi ? profileIssues(profiles[doc], doc) : []]));
  const missingProfiles = docs.filter((doc) => perDoc[doc].length > 0);
  const status = !multi ? 'single_document_record' : missingProfiles.length === 0 ? 'profile_scoped' : 'verification_required';
  const marker = {
    version: 1,
    auditedAt,
    status,
    documentationTypes: docs,
    missingProfiles,
    rule: 'Multi-document rows require an independently human-verified profile for the requested documentation type. No sibling or lender-level values may be inherited.',
  };
  auditRows.push({
    lender: lenderById.get(program.lender_id) ?? program.lender_id,
    lenderId: program.lender_id,
    program: program.name,
    programId: program.id,
    active: program.active,
    documentationTypes: docs,
    multiDocument: multi,
    status,
    missingProfiles,
    profileIssues: Object.fromEntries(Object.entries(perDoc).filter(([, issues]) => issues.length > 0)),
    sourceCitation: config.sourceCitation ?? null,
    lastVerifiedDate: config.lastVerifiedDate ?? null,
  });
  const existingMarker = config.documentationProfileAudit;
  const markerCurrent =
    existingMarker?.version === marker.version &&
    existingMarker?.status === marker.status &&
    JSON.stringify([...(existingMarker?.documentationTypes ?? [])].sort()) === JSON.stringify([...marker.documentationTypes].sort()) &&
    JSON.stringify([...(existingMarker?.missingProfiles ?? [])].sort()) === JSON.stringify([...marker.missingProfiles].sort());
  if (multi && !markerCurrent) {
    updates.push({ id: program.id, config: { ...config, documentationProfileAudit: marker } });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  auditRuleVersion: 1,
  mode: APPLY ? 'apply' : 'dry-run',
  counts: {
    lenders: lenders.length,
    programs: programs.length,
    activePrograms: programs.filter((program) => program.active).length,
    multiDocumentPrograms: auditRows.filter((row) => row.multiDocument).length,
    profileScopedMultiDocumentPrograms: auditRows.filter((row) => row.status === 'profile_scoped').length,
    verificationRequiredMultiDocumentPrograms: auditRows.filter((row) => row.status === 'verification_required').length,
    wvoePrograms: auditRows.filter((row) => row.documentationTypes.includes('wvoe_only')).length,
    pendingUpdates: updates.length,
  },
  byLender: Object.values(auditRows.reduce((acc, row) => {
    const key = row.lenderId;
    acc[key] ??= { lender: row.lender, lenderId: row.lenderId, programCount: 0, multiDocumentCount: 0, verificationRequiredCount: 0 };
    acc[key].programCount += 1;
    if (row.multiDocument) acc[key].multiDocumentCount += 1;
    if (row.status === 'verification_required') acc[key].verificationRequiredCount += 1;
    return acc;
  }, {})).sort((a, b) => a.lender.localeCompare(b.lender)),
  multiDocumentPrograms: auditRows.filter((row) => row.multiDocument),
};

await writeFile('/tmp/nonqm-program-config-backup-2026-08-19.json', JSON.stringify(programs, null, 2), { mode: 0o600 });
if (APPLY) {
  for (const update of updates) {
    const { error } = await supabase.from('programs').update({ config: update.config }).eq('id', update.id).eq('organization_id', org);
    if (error) throw new Error(`Failed to update program ${update.id}: ${error.message}`);
  }
}
await writeFile('docs/program-documentation-profile-audit-2026-08-19.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.counts, null, 2));
