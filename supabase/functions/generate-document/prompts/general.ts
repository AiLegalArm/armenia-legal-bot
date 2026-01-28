// =============================================================================
// GENERAL DOCUMENTS (8)
// =============================================================================

export const generalPrompts: Record<string, string> = {
  "application": `Draft a formal Application (\u0534\u056B\u0574\u0578\u0582\u0574 - \u0417\u0430\u044F\u0432\u043B\u0435\u043D\u0438\u0435) to a government agency.

DOCUMENT STRUCTURE:
1. AUTO-FILLED HEADER: To [Agency], From [Applicant Details], Date

2. GREETING: "\u0423\u0432\u0430\u0436\u0430\u0435\u043C\u043E\u0435 [\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E]," / "\u0540\u0561\u0580\u0563\u0565\u056C\u056B\u055D [Agency],"

3. BODY TEXT:
   - Clear statement of the problem/issue to be resolved
   - Required action (specific action requested)
   - List of attached documents (if any)

4. CLOSING:
   - Thank you
   - Full name and signature

ARMENIAN TEMPLATE:
"\u0540\u0561\u0580\u0563\u0565\u056C\u056B\u055D [Agency],

\u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0574 \u056C\u0578\u0582\u056E\u0565\u056C \u0570\u0565\u057F\u0587\u0575\u0561\u056C \u0570\u0561\u0580\u0581\u0568: [Describe issue, e.g., "\u054E\u0565\u0580\u0561\u0562\u0565\u0580\u0578\u0572 \u0570\u0561\u0580\u0581\u056B \u0576\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576"].

\u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0574\u055D [Specific action requested].

\u053F\u0581\u057E\u0561\u056E \u0567\u055D [Documents if any].

\u0540\u0561\u0580\u0563\u0561\u0576\u0584\u0578\u057E\u055D
[\u0531\u0576\u0578\u0582\u0576, \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576]"

RUSSIAN TEMPLATE:
"\u0423\u0432\u0430\u0436\u0430\u0435\u043C\u043E\u0435 [\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E],

\u041F\u0440\u043E\u0448\u0443 \u0440\u0435\u0448\u0438\u0442\u044C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0443\u044E \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443: [\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0443].

\u0422\u0440\u0435\u0431\u0443\u0435\u043C\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435: [\u041A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435, \u043A\u043E\u0442\u043E\u0440\u043E\u0435 \u0437\u0430\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0435\u0442\u0435].

\u041F\u0440\u0438\u043B\u0430\u0433\u0430\u044E: [\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B, \u0435\u0441\u043B\u0438 \u0435\u0441\u0442\u044C].

\u0421\u043F\u0430\u0441\u0438\u0431\u043E:
[\u0412\u0430\u0448\u0435 \u0438\u043C\u044F]"

Requirements:
- Clearly identify the applicant and the addressee
- Describe the issue concisely
- Formulate precise, actionable requests
- Follow official Armenian legal drafting standards
- Suitable for state actions/rights requests

Output: full legal document, ready for submission.`,

  "complaint": `Draft a substantiated Complaint (\u0532\u0578\u0572\u0578\u0584 - \u0416\u0430\u043B\u043E\u0431\u0430) against action or inaction of an authority.

DOCUMENT STRUCTURE:
1. AUTO-FILLED HEADER: To [Agency], From [Applicant Details], Date

2. GREETING: "\u0423\u0432\u0430\u0436\u0430\u0435\u043C\u043E\u0435 [\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E]," / "\u0540\u0561\u0580\u0563\u0565\u056C\u056B\u055D [Agency],"

3. BODY TEXT:
   - Description of the disputed action/inaction
   - Legal norm violated (specific law/article)
   - Demanded remedy (cancel/amend/investigate)
   - Attached evidence (if any)

4. CLOSING:
   - Thank you
   - Full name and signature

ARMENIAN TEMPLATE:
"\u0540\u0561\u0580\u0563\u0565\u056C\u056B\u055D [Agency],

\u0532\u0578\u0572\u0578\u0584\u0561\u0580\u056F\u0578\u0582\u0574 \u0565\u0574 [Agency Action/Inaction]-\u056B \u0564\u0565\u0574, \u0584\u0561\u0576\u056B \u0578\u0580 \u056D\u0561\u056D\u057F\u057E\u0565\u056C \u0567 [\u0555\u0580\u0565\u0576\u0584/\u0540\u0578\u0564\u057E\u0561\u056E, e.g., "\u053B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0561\u0562\u0565\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580 \u0555\u0580\u0565\u0576\u0584\u0568 \u0570\u0578\u0564\u057E\u0561\u056E Z"].

\u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0574\u055D [\u0549\u0565\u0572\u0561\u0580\u056F\u0565\u056C/\u0553\u0578\u0583\u0578\u056D\u0565\u056C/\u0540\u0565\u057F\u0561\u0584\u0576\u0576\u0565\u056C].

\u053F\u0581\u057E\u0561\u056E \u0567\u055D [\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580].

\u0540\u0561\u0580\u0563\u0561\u0576\u0584\u0578\u057E\u055D
[\u0531\u0576\u0578\u0582\u0576, \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576]"

RUSSIAN TEMPLATE:
"\u0423\u0432\u0430\u0436\u0430\u0435\u043C\u043E\u0435 [\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E],

\u0416\u0430\u043B\u0443\u044E\u0441\u044C \u043D\u0430 [\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435/\u0431\u0435\u0437\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u0430], \u043F\u043E\u0441\u043A\u043E\u043B\u044C\u043A\u0443 \u043E\u043D\u043E \u043D\u0430\u0440\u0443\u0448\u0430\u0435\u0442 [\u0417\u0430\u043A\u043E\u043D/\u0441\u0442\u0430\u0442\u044C\u044F].

\u0422\u0440\u0435\u0431\u0443\u044E: [\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C/\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C/\u0420\u0430\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u044C].

\u041F\u0440\u0438\u043B\u0430\u0433\u0430\u044E: [\u0414\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430].

\u0421\u043F\u0430\u0441\u0438\u0431\u043E:
[\u0412\u0430\u0448\u0435 \u0438\u043C\u044F]"

Requirements:
- Describe the disputed action/inaction clearly
- Identify violated rights and legal norms of the Republic of Armenia
- Clearly formulate remedial demands
- If relevant, refer to ECHR standards as interpretative guidance

Output a formal complaint document suitable for filing with any authority.`,

  "motion": `Draft a procedural motion within case {{CaseNumber}} before {{Court / Authority}}.

Requirements:
- State the procedural status of the applicant
- Justify the necessity of the motion
- Cite the relevant procedural code of Armenia
- Conclude with a clear request to the authority

Output a complete Armenian procedural document.`,

  "explanation": `Draft written explanations submitted by {{Person}} in case {{CaseNumber}}.

Requirements:
- Neutral, factual tone
- Logical presentation of events
- No emotional language
- Legal relevance of facts only

Produce a formal Armenian court-style explanation.`,

  "objection": `Draft formal objections to the arguments presented by the opposing party.

Requirements:
- Identify contested arguments
- Provide counter-arguments based on Armenian law
- Refer to applicable legal provisions
- Maintain professional judicial tone

Output in Armenian, suitable for court filing.`,

  "response_to_claim": `Draft a response to a claim or complaint filed against {{Respondent}}.

Requirements:
- State procedural position
- Address each claim separately
- Provide legal justification
- Include a concluding position on dismissal or partial satisfaction

Produce a full Armenian legal response.`,

  "supplement": `Draft a supplement or clarification to a previously submitted legal document.

Requirements:
- Reference the original document
- Specify what is clarified or supplemented
- Explain the legal necessity of the clarification

Output in formal Armenian legal language.`,

  "information_request": `Draft a Freedom of Information Request (\u054F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u0561\u0580\u0581\u0578\u0582\u0574) to a government authority.

DOCUMENT STRUCTURE (strictly follow this format):
1. AUTO-FILLED HEADER: To [Agency], From [Applicant Details], Date, Number

2. GREETING: "\u0423\u0432\u0430\u0436\u0430\u0435\u043C\u043E\u0435 [\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E]," / "\u0540\u0561\u0580\u0563\u0565\u056C\u056B\u055D [Agency],"

3. BODY TEXT:
   - Legal basis: Reference to Article 28 of the RA Constitution and Article 5 of the RA Law "On Freedom of Information"
   - Numbered list of specific information requests (1, 2, 3...)
   - Request for electronic delivery to specified email

4. CLOSING:
   - Thank you
   - Full name and signature line

5. NOTE: Legal deadline for response: 5 working days (may be extended)

ARMENIAN VERSION TEMPLATE:
"\u0540\u0561\u0580\u0563\u0565\u056C\u056B\u055D [\u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0561\u057F\u0578\u0582 \u0574\u0561\u0580\u0574\u056B\u0576],

\u0540\u0540 \u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0561\u0576 28-\u0580\u0564 \u0570\u0578\u0564\u057E\u0561\u056E\u056B \u0587 \u0540\u0540 \u00AB\u054F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0561\u0576 \u0561\u0566\u0561\u057F\u0578\u0582\u0569\u0575\u0561\u0576 \u0574\u0561\u057D\u056B\u0576\u00BB \u0585\u0580\u0565\u0576\u0584\u056B 5-\u0580\u0564 \u0570\u0578\u0564\u057E\u0561\u056E\u056B \u0570\u056B\u0574\u0561\u0576 \u057E\u0580\u0561 \u056D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0574 \u057F\u0580\u0561\u0574\u0561\u0564\u0580\u0565\u056C \u0570\u0565\u057F\u0587\u0575\u0561\u056C \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568:

1. [\u0540\u0561\u0580\u0581 1]
2. [\u0540\u0561\u0580\u0581 2]
3. [\u0540\u0561\u0580\u0581 3]

\u054F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u056D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0574 \u0578\u0582\u0572\u0561\u0580\u056F\u0565\u056C \u0567\u056C\u0565\u056F\u057F\u0580\u0578\u0576\u0561\u0575\u056B\u0576 \u0571\u0587\u0578\u057E [email].

\u0540\u0561\u0580\u0563\u0561\u0576\u0584\u0578\u057E\u055D
[\u0531\u0576\u0578\u0582\u0576/\u054D\u057F\u0578\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576]"

RUSSIAN VERSION TEMPLATE:
"\u0423\u0432\u0430\u0436\u0430\u0435\u043C\u043E\u0435 [\u0410\u0433\u0435\u043D\u0442\u0441\u0442\u0432\u043E],

\u041D\u0430 \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u0438 \u0441\u0442\u0430\u0442\u044C\u0438 28 \u041A\u043E\u043D\u0441\u0442\u0438\u0442\u0443\u0446\u0438\u0438 \u0420\u0410 \u0438 \u0441\u0442\u0430\u0442\u044C\u0438 5 \u0417\u0430\u043A\u043E\u043D\u0430 \u0420\u0410 \u00AB\u041E \u0441\u0432\u043E\u0431\u043E\u0434\u0435 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438\u00BB \u043F\u0440\u043E\u0448\u0443 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0443\u044E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E:

1. [\u0412\u0430\u0448 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0432\u043E\u043F\u0440\u043E\u0441]
2. [\u0412\u043E\u043F\u0440\u043E\u0441 2]
3. [\u0412\u043E\u043F\u0440\u043E\u0441 3]

\u041F\u0440\u043E\u0448\u0443 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E \u0432 \u044D\u043B\u0435\u043A\u0442\u0440\u043E\u043D\u043D\u043E\u043C \u0432\u0438\u0434\u0435 \u043D\u0430 [email].

\u0421\u043F\u0430\u0441\u0438\u0431\u043E:
[\u0418\u043C\u044F/\u043F\u043E\u0434\u043F\u0438\u0441\u044C]"

Requirements:
- Cite Article 28 of the RA Constitution
- Cite Article 5 of the RA Law "On Freedom of Information"
- Format requests as numbered list
- Use formal, polite language
- Include note about 5-day legal deadline

Output a complete legal document ready for submission to any government authority.`
};
