import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Missing Supabase production configuration');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const org = 'bfe87b1c-86e7-4186-b1c4-ecc25d0e4420';
const { data: lenders, error: le } = await supabase.from('lenders').select('id,name,active').eq('organization_id', org).is('deleted_at', null).order('name');
if (le) throw le;
const { data: programs, error: pe } = await supabase.from('programs').select('id,lender_id,name,active,config').eq('organization_id', org).is('deleted_at', null).order('name');
if (pe) throw pe;
const lenderById = new Map(lenders.map((l) => [l.id, l.name]));
const rows = programs.map((p) => {
  const c = p.config ?? {};
  return {
    lender: lenderById.get(p.lender_id) ?? p.lender_id,
    programId: p.id,
    program: p.name,
    active: p.active,
    docs: c.incomeDocTypes ?? null,
    baseMaxLtv: c.baseMaxLtv ?? null,
    minFico: c.minFico ?? null,
    maxDti: c.maxDti ?? null,
    maxLoanAmount: c.maxLoanAmount ?? null,
    reserves: c.minReservesMonths ?? null,
    hasEligibilityLtvMatrix: Array.isArray(c.eligibilityLtvMatrix) && c.eligibilityLtvMatrix.length > 0,
    hasIncomeDocTypeLtvCaps: !!c.incomeDocTypeLtvCaps && Object.keys(c.incomeDocTypeLtvCaps).length > 0,
    hasIncomeDocTypePurposeRestrictions: !!c.incomeDocTypePurposeRestrictions && Object.keys(c.incomeDocTypePurposeRestrictions).length > 0,
    matrixConfirmationRequired: c.matrixConfirmationRequired === true,
    sourceCitation: c.sourceCitation ?? null,
    guidelineVersionLabel: c.guidelineVersionLabel ?? null,
    lastVerifiedDate: c.lastVerifiedDate ?? null,
  };
});
const multiDoc = rows.filter((r) => Array.isArray(r.docs) && r.docs.length > 1);
const relevant = rows.filter((r) => Array.isArray(r.docs) && r.docs.some((d) => ['bank_statement','1099','pnl_only','wvoe_only','asset_depletion'].includes(d)));
const wvoe = rows.filter((r) => Array.isArray(r.docs) && r.docs.includes('wvoe_only'));
console.log(JSON.stringify({ counts: { lenders: lenders.length, programs: rows.length, activePrograms: rows.filter(r=>r.active).length, multiDoc: multiDoc.length, relevant: relevant.length, wvoe: wvoe.length }, wvoe, relevant }, null, 2));
