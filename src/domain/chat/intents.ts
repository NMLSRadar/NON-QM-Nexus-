/**
 * Intent classification for the chatbot Stage A router.
 *
 * Deterministic, tested pass over the normalized text. Classification is a
 * guardrail layer: it decides WHICH tools Stage B is allowed to call and how
 * the answer is shaped. It is not the source of any factual claim.
 */

import type { ChatIntent } from "./types";

/** Phrases that route a question OUT of scope — no tools, honest non-answer. */
const OUT_OF_SCOPE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /\b(legal|compliance|licens|tax) (advice|question|opinion)\b|\b(is this legal)\b|\bam i allowed\b/,
    reason: "legal_compliance_tax",
  },
  {
    re: /\b(call|list|mark|claim) it (owner[- ]?occupied|owner_occupied|primary|owner occupied|second home)\b|\bfake (the )?(income|employment|occupancy|citizenship|property use)\b|\b(misrepresent|misrepresenting|lying about)\b/,
    reason: "misrepresentation_framing",
  },
  {
    re: /\b(race|religion|national origin|sex|marital status|age|disability|familial status|protected class)\b/,
    reason: "protected_class",
  },
  {
    re: /\b(how (do|can) i (get|make) (a )?(discrimination|fair housing)|fair housing complaint)\b/,
    reason: "legal_compliance_tax",
  },
];

const DEFINITION_PATTERNS = [
  /\bwhat (does|is|do)\b.*\bmean\b/,
  /\bdefine\b/,
  /\bwhat[’']s (the )?difference (between|btw)\b/,
  /\bdifference between\b/,
  /\bhow is (x |the )?(dscr|ltv|dti|reserves|cltv|pitia|deposit utilization|expense factor) (calculated|computed)\b/,
  /\bhow (do|does|are) (you|they|we) (calculate|compute)\b/,
  /\bwhat (is|are) (ltv|dscr|dti|reserves|seasoning|cltv|pitia|ppp|no[- ]?ratio|no_ratio|non[- ]?warrantable|non_warrantable|wvoe|1099|heloc|second lien|ifc)\b/,
];

const APP_NAVIGATION_PATTERNS = [
  /\bwhere (do|can) i (upload|find|enter|add|attach|locate)\b/,
  /\bhow do i (upload|duplicate|copy|dupe|clone|delete|rename|share|export|start) (a |the )?(scenario|p&l|pnl|bank statement|document|file)\b/,
  /\bhow do i (duplicate|copy) (a |the )?scenario\b/,
  /\bwhere (is|are|do i find)\b.*\b(button|page|tab|screen|section|link)\b/,
];

const PROCESS_HELP_PATTERNS = [
  /\bhow (do|can) i (get|submit|request|send|file) (a |an )?exception\b/,
  /\bhow (do|can) i (get an |submit an |have an )?exception (submitted|approved|considered|reviewed)\b/,
  /\bwho[’']s fastest (to close|turn time)\b|\bfastest (to close|turn[- ]?time)\b|\bturn[- ]?time\b|\bturnaround\b|\bctc\b/,
  /\bhow (do|can) i (reach|contact|call|email) (the )?(ae|lender|account executive)\b/,
  /\bae contacts?\b/,
  /\bwhere (do|can) i (find|see) (the )?(ae|account executive) (contacts?|directory)\b/,
];

const COMPARISON_PATTERNS = [
  /\b(compare|comparison|versus|vs\.?|between)\b.*\b(and|vs\.?|versus)\b/,
  /\b(which|what)[’']?s (better|cheaper|more flexible|stronger)\b.*\b(or|vs\.?|between)\b/,
];

const EXCEPTION_GUIDANCE_PATTERNS = [
  /\bexception(s)?\b/,
  /\bflexib(le|ility)\b/,
  /\bcompensating factors?\b/,
  /\bwho (will|would|can) (actually )?(do|take|handle|look at) (it|this|that|these|such|the deal|the file|the loan)\b/,
  /\bwho actually does\b/,
  /\bwho does (this|it|that|these|such|files?|deals?|loans?)\b/,
  /\b(will|would|can|could) ([a-z][a-z ]*?) (approve|do|consider|take|accept) (this|it|the loan|the file|that)\b/,
  /\bmake (a |an )?exception\b|\bmakes sense\b|\boutside (the )?guidelines\b|\boutside (the )?box\b/,
  /\bone[- ]?off\b|\bwho[’']s lenient\b|\bwho is lenient\b|\bwho[’']s (more )?flexible\b/,
  /\bhair on it\b|\bnot a clean file\b|\blayered risk\b|\bcomplicated file\b|\bnuanced file\b|\bthick file\b|\bneeds (an |a )?exception\b|\bscratch and dent\b|\bcredit blemishes\b|\bcredit issues\b/,
];

/** Any extremum word signals a ranking/superlative question. */
const EXTREMUM_RE = /\b(lowest|highest|minimum|maximum|shortest|longest|best|most|least|largest|smallest|min|max)\b/;

/** Explicit floor/ceiling signals -> threshold (a value question, not a ranking). */
const THRESHOLD_SIGNAL_RE =
  /\b(allowed|cap|floor|ceiling|requirement|required)\b|\b(minimum|maximum|min|max) loan amount\b|\b(minimum|maximum|min|max) (down ?payment|ltv|fico|dti|dscr|reserves|seasoning) (allowed|requirement|required|for|across)\b/;

/** "who has X loans / who supports X / who does X / anyone doing X" */
const AVAILABILITY_PATTERNS = [
  /\bwho (has|offers|does|supports|allows|permits|takes|accepts|handles|carries|provides|covers)\b/,
  /\bwho (can|could|will|would) (do|handle|offer|take|underwrite|carry|write)\b(?!\s*(this|it|that|the file|the deal))\b/,
  /\bwhich (lenders?|programs?|companies?)\b/,
  /\banyone (doing|offering|that does|who does)\b/,
  /\bany (lender|program|one)\b.*\b(do|doing|offer|offering|support|allow)\b/,
  /\b(any|which) lenders?\b.*\b(do|doing|offer|offering|support)\b/,
  /\bdo (you|they|any|lenders?)\b.*\b(offer|support|allow|do)\b/,
  /\bwho allows\b/,
  /\b(itin|foreign[-_ ]?national|1099|llc|asset[-_ ]?depletion|bank[-_ ]?statement|non[-_ ]?warrantable)\b.*\b(loans?|lenders?|programs?|options?|borrowers?)\b/,
];

/** Pricing questions — answered directionally, never quoted. */
const PRICING_RE = /\b(pricing|price|cheaper|cheapest|rates?|points|yield spread|bps|quote)\b/;

/** Program-detail: user names a specific program to ask about its terms. */
const PROGRAM_DETAIL_PATTERN = /\b(tell me about|what (is|are)|what[’']s (the )?(min|max|minimum|maximum|ltv|dscr|fico|reserves|loan amount|seasoning|turnaround|turn[- ]?time)|details? on|guidelines? for|terms? for|does .*allow|does .*require)\b/;

const SCENARIO_TRIAGE_PATTERNS = [
  /\b(i have a borrower|borrower has|my borrower|borrower is|self[- ]?employed|fico|ltv|dscr|reserves|mortgage_lates|late|score)\b/,
  /\bwho (works|fits|qualifies|can do)\b/,
  /\bcan anyone\b/,
  /\bwho works\b/,
];

/**
 * Classify intent from the normalized text. Order is deliberate — the most
 * specific/intrusive checks (out-of-scope, definition, navigation) run first.
 */
export function classifyIntent(normalized: string, hasNamedProgram: boolean, hasUnknownProgramRef = false): { intent: ChatIntent; reason?: string } {
  for (const { re, reason } of OUT_OF_SCOPE_PATTERNS) {
    if (re.test(normalized)) return { intent: "out_of_scope", reason };
  }

  if (DEFINITION_PATTERNS.some((re) => re.test(normalized))) return { intent: "definition" };

  // Process help ("how do I submit an exception", "who's fastest") wins over
  // the broad exception keyword so a how-to is never treated as a flexibility
  // question.
  if (PROCESS_HELP_PATTERNS.some((re) => re.test(normalized))) return { intent: "process_help" };

  // Exception/flexibility is a strong signal — check before app-navigation and
  // generic superlative (e.g. "who is the most exception-friendly lender").
  if (EXCEPTION_GUIDANCE_PATTERNS.some((re) => re.test(normalized))) return { intent: "exception_guidance" };

  // App navigation only runs once how-to/flexibility have been ruled out, so
  // "where can I find flexible lenders" is not misread as a UI question.
  if (APP_NAVIGATION_PATTERNS.some((re) => re.test(normalized))) return { intent: "app_navigation" };

  if (COMPARISON_PATTERNS.some((re) => re.test(normalized))) return { intent: "comparison" };

  // A named program (or an explicit "tell me about X") asking about its terms.
  if ((hasNamedProgram || hasUnknownProgramRef) && PROGRAM_DETAIL_PATTERN.test(normalized)) return { intent: "program_detail" };

  // Pricing questions are answered directionally, never with a number.
  if (PRICING_RE.test(normalized)) return { intent: "comparison" };

  const hasExtremum = EXTREMUM_RE.test(normalized);
  const hasThreshold = THRESHOLD_SIGNAL_RE.test(normalized);
  const hasAvailability = AVAILABILITY_PATTERNS.some((re) => re.test(normalized));
  const hasScenario = SCENARIO_TRIAGE_PATTERNS.some((re) => re.test(normalized));

  // An extremum without an explicit floor/ceiling signal is a ranking
  // (superlative); an extremum with an allowed/cap/requirement signal is a
  // threshold (a bare value). Availability before scenario.
  if (hasExtremum && !hasThreshold) return { intent: "superlative_lookup" };
  if (hasThreshold) return { intent: "threshold_lookup" };
  if (hasAvailability) return { intent: "availability_lookup" };
  if (hasScenario) return { intent: "scenario_triage" };

  return { intent: "out_of_scope" };
}