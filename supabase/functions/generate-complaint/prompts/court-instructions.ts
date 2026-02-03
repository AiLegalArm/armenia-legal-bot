// =============================================================================
// COURT TYPE SPECIFIC INSTRUCTIONS
// =============================================================================

export const COURT_INSTRUCTIONS: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // APPELLATE COURT
  // ═══════════════════════════════════════════════════════════════════════════
  appellate: `
APPELLATE COURT COMPLAINT INSTRUCTIONS:

You are drafting an APPELLATE complaint (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584).

Focus areas:
1. Incorrect fact assessment by first instance court
2. Procedural violations during trial
3. Misapplication or non-application of substantive law
4. Evidentiary issues

Reference codes:
- Criminal: UPC RA Articles 376-390
- Civil: CPC RA Articles 379-394
- Administrative: APC RA Articles 118-127

Structure: heading, parties, challenged decision, factual summary, legal grounds, violations, requests, attachments.`,

  // ═══════════════════════════════════════════════════════════════════════════
  // CASSATION COURT
  // ═══════════════════════════════════════════════════════════════════════════
  cassation: `
CASSATION COURT COMPLAINT INSTRUCTIONS:

You are drafting a CASSATION complaint (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584).

CRITICAL LIMITATIONS:
- NO factual reassessment allowed
- ONLY errors of law
- ONLY fundamental violations

Focus areas:
1. Violation of legal norms (substantive or procedural)
2. Inconsistent interpretation compared to Cassation Court practice
3. Violation of legal certainty principle
4. Fundamental miscarriage of justice

Reference codes:
- Criminal: UPC RA Articles 404-414
- Civil: CPC RA Articles 395-408
- Administrative: APC RA Articles 128-136

You MUST cite Cassation Court precedents if available. If none found, state explicitly.`,

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTITUTIONAL COURT
  // ═══════════════════════════════════════════════════════════════════════════
  constitutional: `
CONSTITUTIONAL COURT COMPLAINT INSTRUCTIONS:

You are drafting a CONSTITUTIONAL COURT application.

STRICT REQUIREMENTS:
1. Challenge constitutionality of a specific legal norm
2. Show that the norm was applied in applicant's case
3. Demonstrate violation of constitutional rights
4. Prove exhaustion of ordinary remedies

Reference: RA Constitution, Constitutional Court Law

Structure: applicant info, challenged norm, constitutional provision violated, causal link, exhaustion proof, request for norm review.

NO procedural complaints. NO factual disputes. Only constitutional dimension.`,

  // ═══════════════════════════════════════════════════════════════════════════
  // ECHR
  // ═══════════════════════════════════════════════════════════════════════════
  echr: `
ECHR APPLICATION INSTRUCTIONS:

You are drafting an application to the EUROPEAN COURT OF HUMAN RIGHTS.

ADMISSIBILITY REQUIREMENTS:
1. Exhaustion of domestic remedies (all RA courts including Cassation)
2. Four-month rule from final domestic decision (after Feb 2022) or six-month (before)
3. Victim status (direct, indirect, or potential)
4. Significant disadvantage test

STRUCTURE BY ECHR RULES:
- Section I: Parties
- Section II: Statement of Facts
- Section III: Statement of Alleged Violations (by ECHR Article)
- Section IV: Compliance with Admissibility Criteria
- Section V: Object of the Application
- Section VI: Other International Proceedings
- Section VII: List of Documents

ECHR ARTICLES commonly invoked:
- Article 6: Right to fair trial
- Article 5: Right to liberty
- Article 3: Prohibition of torture
- Article 8: Right to private life
- Article 13: Right to effective remedy
- Article 1 Protocol 1: Protection of property

Cite ECHR case-law in format: Case Name v. Country (year), application no. XXXXX/XX`,

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTI-CORRUPTION COURT
  // ═══════════════════════════════════════════════════════════════════════════
  anticorruption: `
ANTI-CORRUPTION COURT COMPLAINT INSTRUCTIONS:

You are drafting a complaint for the ANTI-CORRUPTION COURT (\u0540\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576).

JURISDICTION:
The Anti-Corruption Court of RA has exclusive jurisdiction over:
1. Corruption crimes under Criminal Code of RA (Chapter 30)
2. Money laundering and terrorist financing
3. High-level official corruption cases
4. Property crimes by officials

APPELLATE COMPLAINT (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584):
- Challenge first instance Anti-Corruption Court decisions
- Focus on procedural violations and evidence admissibility
- Reference: UPC RA Articles 376-390

CASSATION COMPLAINT (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584):
- Appealed to Cassation Court of RA
- ONLY errors of law, NO factual reassessment
- Reference: UPC RA Articles 404-414
- Cite Cassation Court precedents on corruption cases

SPECIAL CONSIDERATIONS:
1. Evidence handling in corruption cases (financial documents, recordings)
2. Witness protection and anonymity issues
3. Statute of limitations for corruption crimes
4. Property confiscation and asset recovery
5. International cooperation (UNCAC, GRECO)

Structure: heading with Anti-Corruption Court designation, parties, challenged decision, factual summary with corruption-specific elements, legal grounds under CC RA Chapter 30, violations, requests, attachments.`
};
