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

Structure: heading with Anti-Corruption Court designation, parties, challenged decision, factual summary with corruption-specific elements, legal grounds under CC RA Chapter 30, violations, requests, attachments.`,

  // ═══════════════════════════════════════════════════════════════════════════
  // OMBUDSMAN - Human Rights Defender
  // ═══════════════════════════════════════════════════════════════════════════
  ombudsman: `
HUMAN RIGHTS DEFENDER (OMBUDSMAN) COMPLAINT INSTRUCTIONS:

You are drafting a complaint to the HUMAN RIGHTS DEFENDER OF THE REPUBLIC OF ARMENIA (\u0540\u0561\u0575\u0561\u057D\u057F\u0561\u0576\u056B \u0540\u0561\u0576\u0580\u0561\u057A\u0565\u057F\u0578\u0582\u0569\u0575\u0561\u0576 \u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576).

LEGAL BASIS:
- Constitution of RA, Article 191
- Law on Human Rights Defender (\u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576\u056B \u0574\u0561\u057D\u056B\u0576 \u0585\u0580\u0565\u0576\u0584)

JURISDICTION:
The Human Rights Defender considers complaints regarding:
1. Violations of human rights and fundamental freedoms by state/local authorities
2. Actions/inaction of officials that violate constitutional rights
3. Systemic human rights issues requiring legislative review
4. Conditions in detention facilities, psychiatric institutions, military units
5. Rights of vulnerable groups (children, disabled, elderly, refugees)

ADMISSIBILITY REQUIREMENTS:
1. Complaint concerns violation by state/local authority or official
2. Complainant is a victim or authorized representative
3. The matter is not pending in court (unless systemic issue)
4. Submitted within one year of the violation or discovery

MANDATORY STRUCTURE:
1. \u054D\u057F\u0561\u0581\u0578\u0572 / Recipient:
   \u0540\u0561\u0575\u0561\u057D\u057F\u0561\u0576\u056B \u0540\u0561\u0576\u0580\u0561\u057A\u0565\u057F\u0578\u0582\u0569\u0575\u0561\u0576 \u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576
   \u0535\u0580\u0587\u0561\u0576, \u054A\u0578\u0582\u0577\u056F\u056B\u0576\u056B 50\u0561, 0010

2. \u0534\u056B\u0574\u0578\u0572\u056B \u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580 / Applicant details:
   - Full name, address, contact information
   - Relationship to victim (if representative)

3. \u053D\u0561\u056D\u057F\u0561\u057E\u0578\u0580 \u056B\u0580\u0561\u057E\u0561\u056D\u0561\u056D\u057F \u0574\u0561\u0580\u0574\u056B\u0576 / Respondent authority:
   - Name of state body or official whose actions are complained about
   - Position and department

4. \u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u056B \u0576\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576 / Factual background:
   - Chronological description of events
   - Specific actions/inaction that violated rights
   - Dates and circumstances

5. \u053D\u0561\u056D\u057F\u057E\u0561\u056E \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580 / Violated rights:
   - Specific constitutional articles violated (RA Constitution)
   - International human rights norms (ECHR, ICCPR, CAT, CEDAW, CRC)
   - Domestic laws violated

6. \u053F\u056B\u0580\u0561\u057C\u057E\u0578\u0572 \u0574\u056B\u057B\u0578\u0581\u0576\u0565\u0580 / Previous remedies:
   - What steps were taken to resolve the issue
   - Responses received from authorities
   - Why ordinary remedies are inadequate

7. \u053D\u0576\u0564\u0580\u0561\u0576\u0584 / Requests:
   - Investigation of the violation
   - Recommendations to the authority
   - Systemic recommendations (if applicable)
   - Monitoring of implementation

8. \u053F\u0581\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580 / Attachments:
   - Copies of relevant documents
   - Correspondence with authorities
   - Evidence of the violation

POWERS OF THE OMBUDSMAN:
- Request information and documents from any state body
- Access any detention facility, institution without prior notice
- Attend court hearings
- Submit amicus curiae briefs
- Propose legislative amendments
- Publish special reports to Parliament

CITATION REQUIREMENTS:
1. Constitution of RA (specific articles on fundamental rights)
2. Law on Human Rights Defender (procedure, powers, obligations)
3. Relevant international conventions ratified by Armenia
4. Recommendations of UN treaty bodies and Special Rapporteurs
5. Previous Ombudsman annual reports on similar issues

Write in formal legal language suitable for submission to the national human rights institution.`
};
