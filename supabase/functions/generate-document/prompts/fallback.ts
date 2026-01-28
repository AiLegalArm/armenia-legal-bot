// =============================================================================
// LEGACY CATEGORY FALLBACKS
// =============================================================================

export const fallbackPrompts: Record<string, string> = {
  "general": `Draft a formal legal document according to the laws of the Republic of Armenia.

Requirements:
- Use official business style
- Include all necessary structural elements
- Reference applicable Armenian legislation
- Ensure document is ready for submission

Output in Armenian.`,

  "civil_process": `Draft a civil procedural document for courts of the Republic of Armenia.

Requirements:
- Follow Civil Procedure Code of Armenia requirements
- Include proper party identification
- Cite relevant Civil Code and Civil Procedure Code provisions
- Structure according to court filing standards

Output in Armenian.`,

  "criminal_process": `Draft a criminal procedural document for criminal proceedings in Armenia.

Requirements:
- Follow Criminal Procedure Code of Armenia requirements
- Respect rights of participants
- Cite relevant Criminal Code and Criminal Procedure Code provisions
- Structure according to procedural standards

Output in Armenian.`,

  "constitutional": `IMPORTANT: This document MUST be written ENTIRELY in Armenian language. NO English text allowed in the output.

Draft a document for the Constitutional Court of Armenia.

Requirements:
- Follow Constitutional Court procedure requirements
- Reference Constitution of Armenia
- Cite Law on Constitutional Court
- Demonstrate constitutional significance of the issue

CRITICAL: Output entirely in Armenian.`,

  "pre_trial": `Draft a pre-trial legal document (demand, notice, response).

Requirements:
- Follow mandatory pre-trial procedure requirements
- Set clear deadlines for response
- Reference consequences of non-compliance
- Preserve evidence of delivery

Output in Armenian.`,

  "contract": `Draft a contractual document according to Armenian civil law.

Requirements:
- Follow Civil Code of Armenia requirements for contracts
- Include essential terms for the contract type
- Reference applicable Civil Code provisions
- Ensure enforceability under Armenian law

Output in Armenian.`
};
