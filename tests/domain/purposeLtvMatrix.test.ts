import { describe, expect, it } from "vitest";
import { deriveMaxLtv } from "@/domain/matching/baseChecks";
import type { Program } from "@/domain/types/program";
import type { Scenario } from "@/domain/types/scenario";

const program = {
  id:"p",lenderId:"l",organizationId:"o",name:"Matrix",isSampleData:false,active:true,
  incomeDocTypes:["dscr"],loanPurposes:["purchase","rate_term_refinance","cash_out_refinance"],occupancies:["investment"],propertyTypes:["single_family","condo"],eligibleStates:"ALL",citizenshipEligible:["us_citizen"],vestingEligible:["individual"],minLoanAmount:100000,maxLoanAmount:3000000,minFico:640,minDscr:0.8,baseMaxLtv:90,minReservesMonths:3,interestOnlyAvailable:true,prepaymentPenaltyOptions:[],guidelineVersionId:"g",guidelineVersionLabel:"v",effectiveDate:"2026-01-01",sourceCitation:"source",
  purposeLtvMatrix:[
    {maxLoanAmount:1500000,minFico:700,occupancy:"investment",minDscr:1,maxLtvPurchase:80,maxLtvRateTerm:80,maxLtvCashOut:75},
    {maxLoanAmount:2000000,minFico:700,occupancy:"investment",minDscr:.8,maxLtvPurchase:70,maxLtvRateTerm:70,maxLtvCashOut:null},
  ],
} as Program;
const scenario = (overrides:Partial<Scenario>={}):Scenario => ({id:"s",organizationId:"o",name:"S",createdByUserId:"u",loanPurpose:"purchase",occupancy:"investment",propertyType:"single_family",requestedLoanAmount:1000000,fico:720,createdAt:"2026-01-01",updatedAt:"2026-01-01",...overrides});

describe("purpose-aware lender LTV matrices",()=>{
  it("keeps cash-out below the purchase ceiling",()=>expect(deriveMaxLtv(scenario({loanPurpose:"cash_out_refinance"}),program,1.1)).toBe(75));
  it("treats an explicit N/A as unavailable when no alternative tier applies",()=>expect(deriveMaxLtv(scenario({loanPurpose:"cash_out_refinance",requestedLoanAmount:1800000}),program,.9)).toBe(0));
  it("uses a lower-DSCR tier only when calculated DSCR clears it",()=>expect(deriveMaxLtv(scenario({requestedLoanAmount:1800000}),program,.9)).toBe(70));
  it("does not fall back to the broad base cap outside all documented bands",()=>expect(deriveMaxLtv(scenario({requestedLoanAmount:3100000}),program,1.2)).toBe(0));
  it("still applies a property-type cap",()=>expect(deriveMaxLtv(scenario({propertyType:"condo"}),{...program,propertyTypeLtvCaps:{condo:65}},1.2)).toBe(65));
});
