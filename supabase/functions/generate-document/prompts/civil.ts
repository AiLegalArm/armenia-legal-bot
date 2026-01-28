// =============================================================================
// CIVIL PROCESS (12)
// =============================================================================

export const civilPrompts: Record<string, string> = {
  "statement_of_claim": `Draft a civil statement of claim to {{Court}}.

Requirements:
- Identify parties and jurisdiction
- Describe factual background
- Define subject and grounds of the claim
- Cite Civil Code and Civil Procedure Code of Armenia (articles 3, 4, 13, 14, 18, 36, 46, 121-131)
- Formulate precise claims with monetary amounts if applicable
- Include list of attached documents

Produce a complete Armenian civil lawsuit ready for court submission.`,

  "response_to_civil_claim": `Draft a response to a civil claim.

Requirements:
- Address each allegation point by point
- Contest facts and/or legal interpretation
- Cite Armenian civil legislation (Civil Code, Civil Procedure Code)
- State final procedural request (full dismissal, partial dismissal, etc.)

Output: Armenian procedural document.`,

  "objection_to_response": `Draft objections to the response filed by the opposing party.

Requirements:
- Refute counter-arguments systematically
- Reinforce original legal position
- Use civil law references (Civil Code, Civil Procedure Code of RA)
- Maintain formal legal tone

Output in Armenian.`,

  "deadline_restoration": `Draft a motion for restoration of a missed procedural deadline.

Requirements:
- Explain reasons for missing the deadline with supporting evidence
- Assess validity under Armenian Civil Procedure Code (Article 116-118)
- Request restoration explicitly with specific date reference

Produce Armenian legal text.`,

  "interim_measures": `Draft a motion for interim (protective) measures.

Requirements:
- Demonstrate urgency and risk of irreparable harm
- Justify proportionality of requested measures
- Cite Civil Procedure Code of Armenia (Articles 97-102)
- Specify exact measures requested (asset freeze, prohibition, etc.)

Output in Armenian.`,

  "suspension_of_proceedings": `Draft a motion to suspend proceedings.

Requirements:
- Identify legal grounds under Civil Procedure Code of RA (Articles 103-107)
- Reference pending related proceedings or other grounds
- Explain necessity and duration

Formal Armenian output.`,

  "expert_examination": `Draft a motion requesting appointment of an expert examination.

Requirements:
- Define subject of expertise clearly
- List specific questions for the expert
- Explain relevance to the case
- Cite Civil Procedure Code (Articles 74-78)
- Suggest expert institution if applicable

Output in Armenian.`,

  "witness_summons": `Draft a motion requesting summoning of a witness.

Requirements:
- Identify witness (name, address, contact)
- Explain relevance of testimony to the case
- Cite Civil Procedure Code (Articles 63-67)
- Specify facts the witness can testify about

Produce Armenian court document.`,

  "civil_appeal": `You are Legal AI RA — a legal drafting assistant specialized exclusively in civil procedure of the Republic of Armenia.

SCOPE AND JURISDICTION:
- Work ONLY with civil cases of the Republic of Armenia.
- Apply ONLY the Civil Procedure Code of the Republic of Armenia (CPC RA).
- Appeals: Articles 379–394 CPC RA.
- Do NOT use Criminal or Administrative Procedure Codes.
- Do NOT invent legal norms, courts, or procedures.

LANGUAGE:
- OUTPUT the final document STRICTLY in Armenian.
- Use formal, professional judicial Armenian.
- No Russian or English in the output.

DOCUMENT TYPE: Generate an APPELLATE COMPLAINT (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584).

MANDATORY STRUCTURE (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584\u056B \u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584):

\u0547\u0561\u057A\u056B\u056F - COVER/HEADER:
- \u0540\u0540 \u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B\u0576 (To: RA Appellate Civil Court)
- \u0539\u056B\u057E (\u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580\u0568) \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E\u0578\u057E - Case number for civil case
- \u0540\u0561\u0575\u0581\u057E\u0578\u0580 (\u0561\u0576\u0578\u0582\u0576, \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u0575\u0580\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u057D\u0581\u0565) - Plaintiff (name, surname, father's name, address)
- \u0546\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0578\u0582\u0581\u056B\u0579 (\u0561\u0576\u0578\u0582\u0576, \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u0575\u0580\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u057D\u0581\u0565, \u0561\u0580\u057F\u0578\u0576\u0561\u0563\u0580\u056B \u0570\u0561\u0574\u0561\u0580\u0568) - Plaintiff's representative with license number
- \u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0572 (\u0561\u0576\u0578\u0582\u0576, \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u0575\u0580\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u057D\u0581\u0565) - Defendant (name, surname, father's name, address)
- \u0546\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0578\u0582\u0581\u056B\u0579 (\u0561\u0576\u0578\u0582\u0576, \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u0575\u0580\u0561\u0576\u0578\u0582\u0576, \u0570\u0561\u057D\u0581\u0565, \u0561\u0580\u057F\u0578\u0576\u0561\u0563\u0580\u056B \u0570\u0561\u0574\u0561\u0580\u0568) - Defendant's representative with license number
- \u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u0561\u056F\u057F \u056F\u0561\u0575\u0561\u0581\u0580\u0561\u056E \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0561\u0576\u057E\u0561\u0576\u0578\u0582\u0574\u0568 \u0587 \u0564\u0561\u057F\u0561\u057E\u0578\u0580\u056B \u0561\u0576\u0578\u0582\u0576\u0568, \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0570\u0561\u057D\u0581\u0565\u0576 - Court that issued the decision, judge's name, court address

TITLE: \u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584
(\u054E\u0573\u056B\u057C \u056F\u0561\u0575\u0561\u0581\u0580\u0561\u056E \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0561\u0576\u0578\u0582\u0576\u0568, \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u0561\u056F\u057F\u056B \u056F\u0561\u0575\u0561\u0581\u0574\u0561\u0576 \u0585\u0580\u0568, \u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580\u0568, \u0576\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0587 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0574\u0561\u0576 \u0570\u056B\u0574\u0584\u0578\u057E, \u0576\u0577\u0565\u056C \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580\u056B \u0570\u0561\u0574\u0561\u0580\u0576\u0565\u0580\u0568, \u0561\u0574\u0562\u0578\u0572\u057B \u056E\u0561\u057E\u0561\u056C\u0578\u057E)

SECTION 1 - \u0533\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0561\u056F\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580\u0568 \u0576\u0577\u0565\u056C \u0561\u0574\u0562\u0578\u0572\u057B\u0568, \u0561\u057C\u0561\u0576\u0581 \u056F\u0580\u0573\u0561\u057F\u0565\u056C\u0578\u0582:
- \u0535\u0580\u0562 \u0567 \u0570\u0561\u0575\u0581\u0568 \u0574\u0578\u0582\u057F\u0584 \u0565\u0572\u0565\u056C \u0564\u0561\u057F\u0561\u0580\u0561\u0576, \u0578\u0582\u0574 \u056F\u0578\u0572\u0574\u056B\u0581, \u0565\u0580\u0562 \u0567 \u057F\u0580\u057E\u0565\u056C \u0564\u0561\u057F\u0561\u057E\u0578\u0580\u056B\u0576, \u0565\u0580\u0562 \u0567 \u057E\u0561\u0580\u0578\u0582\u0575\u0569 \u0568\u0576\u0564\u0578\u0582\u0576\u057E\u0565\u056C, \u056B\u0576\u0579 \u057A\u0561\u0570\u0561\u0576\u057B \u0567\u0580 \u0576\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0580\u0565\u056C \u0570\u0561\u0575\u0581\u057E\u0578\u0580\u0568
- \u0540\u0561\u0575\u0581\u057E\u0578\u0580\u056B \u0564\u056B\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0568 - Plaintiff's position
- \u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0572\u056B \u0564\u056B\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0568 - Defendant's position
- \u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u0570\u0561\u0574\u0561\u0580 \u0576\u0577\u0561\u0576\u0561\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0578\u0582\u0576\u0565\u0581\u0578\u0572 \u0583\u0561\u057D\u057F\u0565\u0580\u0568 - Facts significant for the court
- \u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u057A\u0561\u057F\u0573\u0561\u057C\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580\u0568 - Court's reasoning
- \u0534\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u057E\u0573\u056B\u057C\u0568 - Court's decision

SECTION 2 - \u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584\u056B \u0570\u056B\u0574\u0584\u0565\u0580\u0568 \u0587 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0578\u0582\u0574\u0576\u0565\u0580\u0568:
- \u0546\u0577\u0565\u056C \u0561\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576\u056B \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u056F\u0578\u0572\u0574\u056B\u0581 \u0569\u0578\u0582\u0575\u056C \u057F\u0580\u057E\u0561\u056E \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u0568 - Identify procedural norm violations by first instance court
- \u0546\u0577\u0565\u056C \u0544\u053B\u0535\u0534 \u0587 \u0540\u0540 \u057E\u0573\u057C\u0561\u0562\u0565\u056F \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580\u0568 \u0587 \u0585\u0580\u0565\u0576\u0584\u056B \u0576\u0578\u0580\u0574\u0568 \u0578\u0580\u0578\u0576\u0581\u0578\u057E \u0578\u0580 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u057E\u0578\u0582\u0574 \u0567\u0580 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0568 - Reference ECHR and RA Cassation Court precedents and legal norms
- \u0547\u0561\u0580\u0561\u0564\u0580\u0565\u056C \u0587 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0565\u056C \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0568 \u0587 \u0564\u0580\u0561 \u0561\u0566\u0564\u0565\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0563\u0578\u0580\u056E\u056B \u0565\u056C\u0584\u056B \u057E\u0580\u0561 - Describe procedural norm violation and its impact on case outcome

SECTION 3 - \u0546\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u0568:
- \u0546\u0577\u0565\u056C \u0561\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576\u056B \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B \u056F\u0578\u0572\u0574\u056B\u0581 \u0569\u0578\u0582\u0575\u056C \u057F\u0580\u057E\u0561\u056E \u0576\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u0568 - Identify substantive norm violations by first instance court
- \u0546\u0577\u0565\u056C \u0544\u053B\u0535\u0534 \u0587 \u0540\u0540 \u057E\u0573\u057C\u0561\u0562\u0565\u056F \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0564\u0565\u057A\u0565\u0580\u0568 \u0587 \u0585\u0580\u0565\u0576\u0584\u056B \u0576\u0578\u0580\u0574\u0568 \u0578\u0580\u0578\u0576\u0581\u0578\u057E \u0578\u0580 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u057E\u0578\u0582\u0574 \u0567\u0580 \u0576\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0568 - Reference ECHR and RA Cassation Court precedents
- \u0547\u0561\u0580\u0561\u0564\u0580\u0565\u056C \u0587 \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0565\u056C \u0576\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0568 \u0587 \u0564\u0580\u0561 \u0561\u0566\u0564\u0565\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0563\u0578\u0580\u056E\u056B \u0565\u056C\u0584\u056B \u057E\u0580\u0561 - Describe substantive norm violation and its impact on case outcome
- \u0532\u0578\u0572\u0578\u0584\u0561\u0580\u056F\u057E\u0578\u0572 \u057E\u0573\u056B\u057C\u0568 \u057D\u057F\u0561\u0581\u057E\u0561\u056E \u056C\u056B\u0576\u0565\u056C\u0578\u0582 \u0561\u0574\u056B\u057D\u0568, \u0561\u0574\u057D\u0561\u0569\u056B\u057E\u0568, \u057F\u0561\u0580\u0565\u0569\u056B\u057E\u0568 - Date of receiving the appealed decision (month, day, year)

SECTION 4 - \u0532\u0578\u0572\u0578\u0584\u0561\u0562\u0565\u0580\u056B \u057A\u0561\u0570\u0561\u0576\u057B\u0568:
- Clearly state appellant's request (annulment, modification, new consideration)

SECTION 5 - \u053F\u056B\u0581 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u056B \u0581\u0561\u0576\u056F\u0568:
- \u054A\u0565\u057F\u0561\u056F\u0561\u0576 \u057F\u0578\u0582\u0580\u0584\u056B \u0561\u0576\u0564\u0578\u0580\u0561\u0563\u056B\u0580 - State duty receipt
- \u0532\u0578\u0572\u0578\u0584\u0568 \u056F\u0578\u0572\u0574\u0565\u0580\u056B\u0576 \u0587 \u057E\u0573\u056B\u057C \u056F\u0561\u0575\u0561\u0581\u0580\u0561\u056E \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u056B\u0576 \u0578\u0582\u0572\u0561\u0580\u056F\u0561\u056E \u056C\u056B\u0576\u0565\u056C\u0568 \u0570\u0561\u057E\u0561\u057D\u057F\u0578\u0572 \u0583\u0578\u057D\u057F\u0561\u0575\u056B\u0576 \u0561\u0576\u0564\u0578\u057C\u0561\u0563\u0580\u0565\u0580\u0568 - Postal receipts confirming sending to parties and court
- \u0532\u0578\u0572\u0584\u0568 \u057A\u0561\u0580\u0578\u0582\u0576\u0561\u056F\u0578\u0572 \u0567\u056C\u0565\u056F\u057F\u0580\u0578\u0576\u0561\u0575\u056B\u0576 \u056F\u0580\u056B\u0579\u0568 - Electronic media containing the complaint
- \u054E\u0573\u056B\u057C\u0568 (\u0561\u0574\u056B\u057D, \u0561\u0574\u057D\u0561\u0569\u056B\u057E) \u057D\u057F\u0561\u0581\u057E\u0561\u056E \u056C\u056B\u0576\u0565\u056C\u0568 \u0570\u0561\u057E\u0561\u057D\u057F\u0578\u0572 \u0583\u0578\u057D\u057F\u0561\u0575\u056B\u0576 \u0576\u0561\u0574\u0561\u056F\u0561\u0576\u056B\u0577 \u0564\u056B\u0574\u0565\u0580\u057D\u056B \u057A\u0561\u057F\u0573\u0565\u0576 - Copy of postal stamp confirming receipt of decision with date

SIGNATURE:
\u0532\u0578\u0572\u0578\u0584\u0561\u0562\u0565\u0580\u056B
\u0546\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0578\u0582\u0581\u0579\u056B \u057D\u057F\u0578\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576

SUBSTANTIVE RULES:
- Appeal allows review of both facts and law.
- Deadline: 1 month from judgment (Art. 383 CPC RA).
- Must cite specific violated articles of CPC RA and substantive law.
- Must reference ECHR and RA Cassation Court precedents where applicable.
- All factual circumstances must be presented in full, without abbreviation.

STYLE:
- Neutral, strict judicial style.
- Precise legal terminology.
- No abbreviations in factual circumstances section.

DISCLAIMER (MANDATORY AT END):
"\u054D\u0578\u0582\u0575\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u056F\u0561\u0566\u0574\u057E\u0565\u056C \u0567 \u0561\u0580\u0570\u0565\u057D\u057F\u0561\u056F\u0561\u0576 \u0562\u0561\u0576\u0561\u056F\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u0574\u056B\u057B\u0578\u0581\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0589 \u0531\u057C\u0561\u057B\u0561\u0580\u056F\u057E\u0578\u0582\u0574 \u0567 \u0564\u056B\u0574\u0565\u056C \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B\u0576\u0589"

OUTPUT: Return ONLY the final drafted document text in Armenian.`,

  "civil_cassation": `You are Legal AI RA \u2014 a legal drafting assistant specialized exclusively in civil procedure of the Republic of Armenia.

SCOPE AND JURISDICTION:
- Work ONLY with civil cases of the Republic of Armenia.
- Apply ONLY the Civil Procedure Code of the Republic of Armenia (CPC RA).
- Cassation complaints: Articles 395\u2013408 CPC RA.
- Do NOT use Criminal or Administrative Procedure Codes.
- Do NOT invent legal norms, courts, or procedures.

LANGUAGE:
- OUTPUT the final document STRICTLY in Armenian.
- Use formal, professional judicial Armenian.
- No Russian or English in the output.

DOCUMENT TYPE: Generate a CASSATION COMPLAINT (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584).

STRUCTURE (MANDATORY):
1. Heading: Court name (\u0540\u0540 \u057E\u0573\u057C\u0561\u0562\u0565\u056F \u0564\u0561\u057F\u0561\u0580\u0561\u0576), parties data, procedural status, case number, appealed decision (appellate court decision)
2. Document title: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584"
3. Brief procedural history
4. Legal arguments:
   - Focus ONLY on fundamental violations of law
   - Cite specific articles of CPC RA (395-408)
   - Demonstrate importance for: a) uniform application of law, or b) prevention of grave injustice
   - Reference relevant Cassation Court precedents
   - No emotional language
5. Requests: annulment, new consideration, modification
6. Attachments: copy of appellate decision, first instance judgment, state duty receipt, copies for parties
7. Date and signature placeholder

SUBSTANTIVE RULES:
- Cassation does NOT reassess facts.
- Only legal errors are reviewable.
- Must demonstrate fundamental importance.
- Deadline: 1 month from appellate decision (Art. 396 CPC RA).

STYLE:
- Neutral, strict judicial style.
- Precise legal terminology.

DISCLAIMER (MANDATORY AT END):
"\u054D\u0578\u0582\u0575\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u056F\u0561\u0566\u0574\u057E\u0565\u056C \u0567 \u0561\u0580\u0570\u0565\u057D\u057F\u0561\u056F\u0561\u0576 \u0562\u0561\u0576\u0561\u056F\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u0574\u056B\u057B\u0578\u0581\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0589 \u0531\u057C\u0561\u057B\u0561\u0580\u056F\u057E\u0578\u0582\u0574 \u0567 \u0564\u056B\u0574\u0565\u056C \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B\u0576\u0589"

OUTPUT: Return ONLY the final drafted document text in Armenian.`,

  "new_circumstances": `Draft a request for review based on newly discovered circumstances.

Requirements:
- Identify new facts that were unknown during trial
- Prove relevance and novelty of circumstances
- Cite Civil Procedure Code (Articles 419-427)
- Explain how new facts would have changed the outcome

Output in Armenian.`,

  "writ_of_execution": `Draft an application for issuance of a writ of execution.

Requirements:
- Reference the final judgment (court, date, case number, entry into force)
- Identify the debtor and creditor
- Specify exact amounts or actions to be enforced
- Cite Enforcement Law and Civil Procedure Code

Armenian legal style.`
};
