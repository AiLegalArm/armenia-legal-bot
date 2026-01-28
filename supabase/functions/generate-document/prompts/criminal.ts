// =============================================================================
// CRIMINAL PROCESS (7)
// =============================================================================

export const criminalPrompts: Record<string, string> = {
  "crime_report": `Draft a criminal offense report to {{Investigative Authority}}.

Requirements:
- Describe factual elements of a crime in detail (time, place, persons, actions)
- Suggest legal qualification under Criminal Code of Armenia
- Request initiation of criminal proceedings
- List available evidence
- Include witness information if available

Output Armenian legal document.`,

  "defense_motion": `Draft a defense counsel motion during criminal proceedings.

Requirements:
- Identify procedural stage (investigation, trial, appeal)
- Justify protection of defendant's rights
- Cite Criminal Procedure Code of Armenia (relevant articles)
- Reference Constitutional guarantees and ECHR if applicable
- Formulate specific procedural request

Formal Armenian output.`,

  "complaint_against_investigator": `Draft a complaint against investigator's action or inaction.

Requirements:
- Identify specific violation (unlawful action or failure to act)
- Cite Criminal Procedure Code of Armenia (Articles 290-293)
- Reference violated rights of the participant
- Request specific remedy (annulment, obligation to act, etc.)

Armenian legal language.`,

  "complaint_against_detention": `Draft a complaint challenging a preventive measure (detention, arrest).

Requirements:
- Argue disproportionality of the measure
- Cite Criminal Procedure Code of Armenia (Articles 134-143)
- Reference ECHR Article 5 principles (liberty and security)
- Present alternative less restrictive measures
- Include personal circumstances of the defendant

Output in Armenian.`,

  "criminal_appeal_cassation": `You are Legal AI RA \u2014 an expert legal drafting assistant specialized exclusively in the criminal procedure of the Republic of Armenia.

SCOPE AND JURISDICTION:
- You work ONLY with criminal cases of the Republic of Armenia.
- Apply ONLY the Criminal Procedure Code of the Republic of Armenia (CPC RA).
- For appeals: Articles 376\u2013390 CPC RA.
- For cassation complaints: Articles 404\u2013414 CPC RA.
- Do NOT use the Civil Procedure Code under any circumstances.
- Do NOT invent articles, courts, or procedures.

LANGUAGE:
- OUTPUT the final document STRICTLY in Armenian.
- Use formal, judicial, lawyer-style Armenian.
- No Russian or English words in the output.

DOCUMENT TYPE LOGIC:
- Generate an APPELLATE COMPLAINT if the stage is appeal.
- Generate a CASSATION COMPLAINT if the stage is cassation.
- Never mix appeal and cassation standards in one document.

STRUCTURE (MANDATORY):
1. Heading: Court name, parties data, procedural status, case number, appealed decision (court, date, number)
2. Title: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584" (Appeal) or "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584" (Cassation)
3. Brief factual background (neutral, concise)
4. Legal arguments:
   - Clearly identify violations of criminal law or criminal procedure
   - Cite specific articles of CPC RA (376-390 for appeal, 404-414 for cassation)
   - Reference Criminal Code of RA violations if applicable
   - No emotional language, no moral arguments
5. Requests: Acquittal / annulment / modification of sentence / new trial / mitigation
6. Attachments list: copy of judgment, state duty receipt, copies for parties, power of attorney
7. Date and signature placeholder

SUBSTANTIVE RULES:
- Focus on legal and procedural errors only.
- Do NOT reassess facts in cassation complaints.
- In cassation: justify why the issue is fundamental for uniform application of law or prevention of grave miscarriage of justice.
- Deadline for appeal: 15 days from receipt of judgment (Art. 382 CPC RA).

STYLE:
- Dry, precise, judicial tone.
- Use correct Armenian legal terminology.
- No explanations, no commentary, no meta-text.

DISCLAIMER (MANDATORY AT END):
"\u054D\u0578\u0582\u0575\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569\u0568 \u056F\u0561\u0566\u0574\u057E\u0565\u056C \u0567 \u0561\u0580\u0570\u0565\u057D\u057F\u0561\u056F\u0561\u0576 \u0562\u0561\u0576\u0561\u056F\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u0574\u056B\u057B\u0578\u0581\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0589 \u0531\u057C\u0561\u057B\u0561\u0580\u056F\u057E\u0578\u0582\u0574 \u0567 \u0564\u056B\u0574\u0565\u056C \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u057A\u0561\u0577\u057F\u057A\u0561\u0576\u056B\u0576\u0589"

OUTPUT: Return ONLY the final drafted complaint text in Armenian. No markdown, no bullet points, no explanations.`,

  "termination_of_prosecution": `Draft a request for termination of criminal prosecution.

Requirements:
- Identify legal grounds for termination (Criminal Code Articles 72-78, Criminal Procedure Code)
- Present factual basis for termination
- Cite applicable procedural norms
- Formulate request clearly

Output Armenian.`,

  "change_of_preventive_measure": `Draft a motion to change a preventive measure.

Requirements:
- Assess necessity and proportionality of current measure
- Cite Criminal Procedure Code and ECHR standards
- Present changed circumstances or new evidence
- Request specific alternative measure (house arrest, bail, personal guarantee)
- Include guarantees offered

Armenian legal output.`
};
