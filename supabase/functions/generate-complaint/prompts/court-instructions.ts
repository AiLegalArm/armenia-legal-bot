// =============================================================================
// COURT TYPE SPECIFIC INSTRUCTIONS (KB-VALIDATED + RAG HOOKS)
// =============================================================================

type CourtType =
  | 'appellate'
  | 'cassation'
  | 'constitutional'
  | 'echr'
  | 'anticorruption'
  | 'ombudsman';

const COMMON_RAG_HOOKS_BLOCK = `
RAG HOOKS (OCR/METADATA EXTRACTION):
- Extract and normalize (if files/OCR provided):
  1) \u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580 (case number)
  2) \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B/\u0574\u0561\u0580\u0574\u0576\u056B \u0561\u0576\u057E\u0561\u0576\u0578\u0582\u0574 (court/authority name)
  3) \u0564\u0561\u057F\u0561\u057E\u0578\u0580 / \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u057F\u0561\u0580 \u0561\u0576\u0571 (judge/official)
  4) \u0561\u056F\u057F\u056B \u0585\u0580/\u0561\u0574\u056B\u057D/\u057F\u0561\u0580\u056B (act/decision date: DD.MM.YYYY)
  5) \u057D\u057F\u0561\u0581\u0574\u0561\u0576 \u0585\u0580 (date of receipt/service: DD.MM.YYYY)
- If any field is missing/uncertain: write "_____". Do not infer.

KB VALIDATION HOOKS:
- Validate ALL Armenian law citations via knowledge_base:
  (law/code name + article + part/point + version/date if provided).
- Validate RA court practice via legal_practice_kb:
  (court + case no + date). No KB match => do not invent.
- Validate ECHR case-law via echr_kb (or legal_practice_kb if stored there):
  (case name + application no + year). No KB match => do not invent.
- If KB confirmation is missing: flag as "KB validation not confirmed" and proceed without treating it as authoritative.
`;

export const COURT_INSTRUCTIONS: Record<string, string> = {
  // =========================================================================
  // APPELLATE COURT
  // =========================================================================
  appellate: `
APPELLATE COURT COMPLAINT INSTRUCTIONS:
You are drafting an APPELLATE complaint (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584).

${COMMON_RAG_HOOKS_BLOCK}

ADMISSIBILITY / SCOPE GATE:
- Appellate review may address:
  (a) errors in fact assessment (where allowed by procedure),
  (b) procedural violations,
  (c) misapplication / non-application of substantive law,
  (d) evidentiary issues.
- You MUST follow the applicable procedure track selected by the user/case context: criminal / civil / administrative.
- If the track is unclear, list it under REQUIRED INPUTS as a missing item.

FOCUS AREAS:
1) Incorrect fact assessment by first instance court (only to the extent appellate review permits)
2) Procedural violations during trial
3) Misapplication or non-application of substantive law
4) Evidentiary issues (admissibility, reliability, evaluation)

REFERENCE CODES (KB-CONDITIONAL):
- Criminal procedure: cite the relevant Armenian procedural code provisions from KB.
- Civil procedure: cite the relevant Armenian procedural code provisions from KB.
- Administrative procedure: cite the relevant Armenian procedural code provisions from KB.
NOTE: If the user provided article ranges (e.g., 376\u2013390), you may keep them as targets, but you MUST confirm exact articles in KB before asserting them.

STRUCTURE (STRICT):
heading, parties, challenged decision, factual summary, legal grounds, violations, requests, attachments.
`,

  // =========================================================================
  // CASSATION COURT
  // =========================================================================
  cassation: `
CASSATION COURT COMPLAINT INSTRUCTIONS:
You are drafting a CASSATION complaint (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584).

${COMMON_RAG_HOOKS_BLOCK}

CRITICAL LIMITATIONS (SCOPE GATE):
- NO factual reassessment (as a rule)
- ONLY errors of law
- ONLY fundamental / material violations affecting outcome and legal certainty
- The complaint must be framed as a "legal error" argument (norm \u2192 misapplication \u2192 consequence).

FOCUS AREAS:
1) Violation/misapplication of legal norms (substantive or procedural)
2) Inconsistent interpretation compared to Cassation Court practice (KB-confirmed)
3) Violation of legal certainty / foreseeability / uniformity of jurisprudence
4) Fundamental miscarriage of justice (legal standard must be KB-confirmed)

REFERENCE CODES (KB-CONDITIONAL):
- Criminal procedure: confirm exact Cassation articles in KB before citing.
- Civil procedure: confirm exact Cassation articles in KB before citing.
- Administrative procedure: confirm exact Cassation articles in KB before citing.

MANDATORY PRACTICE RULE:
- You MUST cite Cassation Court precedents IF AND ONLY IF KB confirms them for the issue.
- If KB does not confirm sufficient precedents, include "KB GAP NOTICE" and do not fabricate.
`,

  // =========================================================================
  // CONSTITUTIONAL COURT
  // =========================================================================
  constitutional: `
CONSTITUTIONAL COURT COMPLAINT INSTRUCTIONS:
You are drafting a CONSTITUTIONAL COURT application (\u0540\u0540 \u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576).

${COMMON_RAG_HOOKS_BLOCK}

STRICT REQUIREMENTS (SCOPE GATE):
1) Challenge constitutionality of a SPECIFIC legal norm (exact citation required)
2) Show that the norm was applied in applicant's case (link to a concrete act/decision)
3) Demonstrate violation of constitutional rights (specific constitutional provisions)
4) Prove exhaustion of ordinary remedies (where required by procedure)

PROHIBITIONS:
- NO procedural complaints as standalone (unless they relate directly to constitutionality of a norm)
- NO factual disputes as the core basis
- ONLY constitutional dimension: norm \u2192 constitutional standard \u2192 application in case \u2192 rights violation.

REFERENCES (KB-CONDITIONAL):
- RA Constitution provisions (KB-confirmed)
- Law on Constitutional Court (KB-confirmed)
- Constitutional Court practice (KB-confirmed if available; otherwise flag)

STRUCTURE (STRICT):
applicant info, challenged norm, constitutional provision(s) violated, causal link, exhaustion proof, request for norm review.
`,

  // =========================================================================
  // ECHR
  // =========================================================================
  echr: `
ECHR APPLICATION INSTRUCTIONS:
You are drafting an application to the EUROPEAN COURT OF HUMAN RIGHTS.

${COMMON_RAG_HOOKS_BLOCK}

ADMISSIBILITY REQUIREMENTS (STRICT):
1) Exhaustion of domestic remedies (all effective remedies, incl. Cassation where required)
2) Time-limit rule:
   - 4-month time limit applies generally after Protocol No. 15 changes.
   - Transitional rule: for final domestic decisions delivered BEFORE 01.02.2022, the 6-month time limit applies.
   - You MUST compute and state the deadline based on: final decision date + receipt date (if relevant) from OCR/metadata.
   - If dates are missing: mark "_____" and include REQUIRED INPUTS.
3) Victim status (direct/indirect/potential) + explain status
4) Significant disadvantage test (address if relevant)
5) No anonymity; not substantially the same as a matter already examined; not manifestly ill-founded (address briefly as needed)

STRUCTURE BY ECHR RULES (STRICT SECTIONS):
- Section I: Parties
- Section II: Statement of Facts
- Section III: Statement of Alleged Violations (by ECHR Article)
- Section IV: Compliance with Admissibility Criteria
- Section V: Object of the Application
- Section VI: Other International Proceedings
- Section VII: List of Documents

ECHR ARTICLES commonly invoked (examples):
- Article 6, Article 5, Article 3, Article 8, Article 13, Article 1 Protocol 1

CITATION RULE:
- Cite ECHR case-law ONLY if KB confirms: Case Name v. Country (year), application no. XXXXX/XX
- If KB cannot confirm enough cases: issue "KB GAP NOTICE".
`,

  // =========================================================================
  // ANTI-CORRUPTION COURT
  // =========================================================================
  anticorruption: `
ANTI-CORRUPTION COURT COMPLAINT INSTRUCTIONS:
You are drafting a complaint for the ANTI-CORRUPTION COURT (\u0540\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576).

${COMMON_RAG_HOOKS_BLOCK}

JURISDICTION GATE:
- Confirm the case falls within Anti-Corruption Court jurisdiction based on:
  (a) offense qualification / chapter / corruption category,
  (b) subject (official status),
  (c) statutory allocation rules.
- If qualification/jurisdiction basis is missing: list under REQUIRED INPUTS.

PATH SELECTION (MANDATORY):
You MUST determine which pathway applies (based on user/case context):
A) APPELLATE complaint (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584) against Anti-Corruption Court first instance decisions
B) CASSATION complaint (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584) to Cassation Court of RA
If unclear: stop and list REQUIRED INPUTS.

APPELLATE FOCUS:
- Procedural violations, evidence admissibility, fact assessment (if allowed)
- Cite KB-confirmed procedural code provisions

CASSATION FOCUS:
- ONLY errors of law, NO factual reassessment
- Cite KB-confirmed cassation procedural provisions
- Cite KB-confirmed Cassation precedents relevant to corruption / asset recovery (if present)

SPECIAL CONSIDERATIONS (ISSUE SPOTTING):
1) Financial evidence: bank docs, asset trails, forensic accounting
2) Recordings: legality, authenticity, chain of custody
3) Witness protection/anonymity: fair trial implications
4) Limitation periods: KB-confirmed rules only
5) Confiscation/asset recovery: domestic + international standards (KB-confirmed instruments only)
6) International cooperation frameworks (UNCAC/GRECO): cite only if present in KB

STRUCTURE:
heading with correct court designation, parties, challenged decision, factual summary, legal grounds, violations, requests, attachments.
`,

  // =========================================================================
  // OMBUDSMAN - Human Rights Defender
  // =========================================================================
  ombudsman: `
HUMAN RIGHTS DEFENDER (OMBUDSMAN) COMPLAINT INSTRUCTIONS:
You are drafting a complaint to the HUMAN RIGHTS DEFENDER OF THE REPUBLIC OF ARMENIA (\u0540\u0540 \u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576).

${COMMON_RAG_HOOKS_BLOCK}

LEGAL BASIS (KB-CONDITIONAL):
- RA Constitution (relevant rights + Ombudsman framework provisions) \u2014 KB-confirmed
- Law on Human Rights Defender (procedure/powers) \u2014 KB-confirmed

JURISDICTION GATE:
- The complaint must concern action/inaction by a state/local authority or official that allegedly violates rights.
- If the matter is pending in court, explain admissibility constraints and whether systemic dimension justifies review.

TIME LIMIT GATE:
- Submitted within one year of the violation or discovery (as per your instruction).
- Compute using extracted dates; if missing, use "_____".

MANDATORY STRUCTURE (KEEP AS PROVIDED; DO NOT ALTER RECIPIENT ADDRESS):
1) \u054D\u057F\u0561\u0581\u0578\u0572 / Recipient:
   \u0540\u0540 \u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576
   \u0535\u0580\u0587\u0561\u0576, \u054A\u0578\u0582\u0577\u056F\u056B\u0576\u056B 50\u0561, 0010

2) Applicant details:
   - Full name, address, contact
   - Relationship to victim (if representative)

3) Respondent authority:
   - Name of body/official, position, department

4) Factual background:
   - Chronology, specific acts/inaction, dates

5) Violated rights:
   - Constitutional rights (specific articles; KB-confirmed)
   - International norms (ECHR/ICCPR/CAT/CEDAW/CRC) only if KB confirms ratification/usage
   - Domestic laws violated (KB-confirmed)

6) Previous remedies:
   - Steps taken, responses received, why inadequate

7) Requests:
   - Investigation, recommendations, monitoring, systemic proposals

8) Attachments:
   - Copies of documents, correspondence, evidence

CITATION REQUIREMENTS (KB-CONDITIONAL):
- Constitution articles (KB-confirmed)
- Law on Human Rights Defender (KB-confirmed)
- International conventions ratified by Armenia (KB-confirmed)
- UN treaty bodies / Special Rapporteurs / Ombudsman reports: cite only if present in KB; otherwise flag "KB validation not confirmed"

TONE:
Formal, clear, rights-focused, suitable for submission to NHR institution.
`
};
