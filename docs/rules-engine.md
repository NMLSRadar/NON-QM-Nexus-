# Rules Engine

Location: `src/domain/rules` (evaluation) and `src/domain/matching` (program-level orchestration).

## Rule anatomy

```jsonc
{
  "id": "r_summit_bs_cashout_ltv",
  "lenderId": "lender_summit",
  "programId": "prog_summit_bs12",
  "guidelineVersionId": "gv_summit_bs12_v1",
  "category": "ltv",
  "name": "Cash-out LTV cap 75% (Sample)",
  "conditions": {
    "any": [
      { "field": "loanPurpose", "operator": "not_equals", "value": "cash_out_refinance" },
      { "all": [{ "field": "calc.ltv", "operator": "lte", "value": 75 }] }
    ]
  },
  "outcomeWhenTrue": "pass",
  "outcomeWhenFalse": "fail",
  "severity": "hard",
  "userExplanation": "Cash-out refinances are capped at 75% LTV…",
  "sourceSection": "Section 4.2.3",
  "sourcePage": 18,
  "effectiveDate": "2026-01-01",
  "verificationStatus": "human_verified"
}
```

**Convention:** conditions describe the *passing* case. Rules that only apply in some situations guard themselves with an `any` branch that passes when the subject is absent (see the cash-out example: non-cash-out loans pass trivially).

## Fields rules can reference

Any dot-path into the evaluation context (`src/domain/rules/context.ts`): raw scenario fields (`fico`, `bankStatement.hasCashDeposits`, `creditEvents.bankruptcyMonthsSinceDischarge`, …) plus derived values under `calc.*` (`calc.ltv`, `calc.cltv`, `calc.dti`, `calc.dscr`, `calc.qualifyingMonthlyIncome`, `calc.reservesMonths`).

## Operators

`equals`, `not_equals`, `gt`, `gte`, `lt`, `lte`, `between` (inclusive `[lo, hi]`), `in`, `not_in`, `contains`, `exists`, `not_exists`. Date-difference comparisons are modeled as month-count fields (e.g. `bankruptcyMonthsSinceDischarge`); a `custom formula` operator is intentionally deferred until a sandboxed expression evaluator is added.

## Ternary semantics (the important part)

Every condition evaluates to **true / false / unknown**. A referenced field that is missing yields *unknown*, which propagates through AND/OR groups (AND short-circuits on false; OR short-circuits on true). A rule whose conditions resolve to unknown produces **manual_review** — a missing input can never silently pass or fail a rule.

## Outcomes and severity

Per rule: `pass`, `fail`, `warning`, `manual_review`, `not_applicable`.

Severity governs program classification:
- `hard` fail → program **ineligible**
- `soft` fail / warnings → **conditional**
- manual-review items (nothing failed) → **manual review**
- all pass, score ≥ 85 → **strong match**, otherwise **eligible**

## Activation lifecycle

A rule only runs when **all** hold (`activeRules.ts`):
1. `verificationStatus === "human_verified"` — drafts, imports, and AI extractions never run;
2. `asOf ≥ effectiveDate` (if set);
3. `asOf < expirationDate` (if set) — expired guidelines deactivate automatically.

Publication workflow (production): draft → submitted → reviewed → approved → published, with regression tests required before a guideline version can publish (see `docs/admin-guide.md`).

## Base program checks

Program-level constraint fields (doc types, purposes, occupancies, property types, states, citizenship, loan range, min FICO, max DTI, min DSCR, LTV matrix, reserves, IO availability) are evaluated by `matching/baseChecks.ts` for every program, so even a program with zero custom rules produces fully explained results. Custom rules layer on top for overlays.

## Ranking

`matching/score.ts` computes a 0–100 score from transparent weighted factors (LTV headroom 25, FICO fit 20, DTI/DSCR fit 15, loan amount 10, reserves 10, documentation burden 10, warnings/manual-review penalty 10). Hard-failed programs cap at 20. Every factor's points and note are shown in the UI ("Why this ranking?"). Pricing is never a factor.

## Testing rules

`tests/domain/rules.test.ts` covers operators, nesting, ternary behavior, and date windows; `tests/domain/matching.test.ts` is the scenario regression suite (expected statuses, controlling rules, and restructuring unlocks per sample scenario). Add a regression block per verified guideline program before publishing it.
