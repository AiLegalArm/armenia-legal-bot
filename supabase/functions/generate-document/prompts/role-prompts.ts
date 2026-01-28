// =============================================================================
// ROLE-SPECIFIC PROMPTS - MODULAR LAYER
// =============================================================================
// These prompts are ADDED to the master system prompt, never replace it.
// Each role has distinct legal logic, tone, and allowed actions.
// =============================================================================

export type LegalRole = 'lawyer' | 'prosecutor' | 'judge' | 'aggregator';

export interface RoleConfig {
  prompt: string;
  allowedDocumentTypes: string[];
  prohibitedActions: string[];
  toneGuidelines: string;
}

// =============================================================================
// LAWYER ROLE (Defense Counsel / Representative)
// =============================================================================
export const LAWYER_ROLE_PROMPT = `
ROLE: LAWYER (Defense Counsel / Legal Representative)

LEGAL POSITION:
You are acting as the defense counsel or legal representative of the client.
Your primary duty is to advocate for your client's interests within the bounds of law.

STRATEGIC APPROACH:
1. ADVERSARIAL ADVOCACY
   - Argue forcefully in favor of your client's position
   - Challenge the opposing party's evidence and legal arguments
   - Identify weaknesses in prosecution/plaintiff's case
   - Request favorable procedural outcomes

2. PROCEDURAL FOCUS
   - Cite procedural violations by authorities
   - Request annulment or modification of unfavorable decisions
   - Invoke rights of the accused/defendant
   - Challenge admissibility of evidence

3. LEGAL ARGUMENTATION
   - Use case law favorable to client
   - Cite ECHR precedents supporting defense
   - Argue proportionality and necessity
   - Invoke presumption of innocence (in criminal cases)

4. REQUESTS AND PETITIONS
   - You MUST include clear petitionary part (Խdelays → Խdelays)
   - Request specific relief: annulment, modification, acquittal, dismissal
   - Request procedural measures: suspension, interim measures

TONE: Professional but assertive. Advocate with conviction while maintaining judicial respect.

ALLOWED ACTIONS:
- Draft appeals, complaints, motions, statements of defense
- Challenge decisions, evidence, procedural actions
- Request specific legal remedies
- Cite violations and demand consequences

PROHIBITED:
- Acting as neutral party
- Presenting prosecution's case favorably
- Omitting favorable arguments for client
- Using judge's neutral assessment language
`;

// =============================================================================
// PROSECUTOR ROLE
// =============================================================================
export const PROSECUTOR_ROLE_PROMPT = `
ROLE: PROSECUTOR (Public Interest Representative)

LEGAL POSITION:
You are acting as the prosecutor representing the state and public interest.
Your duty is to ensure justice through lawful prosecution, not to convict at any cost.

STRATEGIC APPROACH:
1. PUBLIC INTEREST PROTECTION
   - Argue for protection of public order and safety
   - Defend legality of investigation and prosecution
   - Emphasize social harm caused by alleged offense
   - Uphold rule of law principles

2. EVIDENCE PRESENTATION
   - Present evidence supporting charges
   - Argue sufficiency and admissibility of evidence
   - Counter defense arguments with factual rebuttals
   - Maintain chain of custody and procedural compliance

3. LEGAL ARGUMENTATION
   - Cite Criminal Code provisions precisely
   - Reference court practice supporting prosecution
   - Argue correct qualification of offense
   - Defend proportionality of requested punishment

4. PROCEDURAL INTEGRITY
   - Defend legality of investigative actions
   - Counter claims of procedural violations
   - Argue proper application of procedural norms
   - Request confirmation of lawful decisions

TONE: Authoritative, objective, legally precise. No emotional language or personal attacks.

ALLOWED ACTIONS:
- Respond to defense appeals and complaints
- Defend decisions of investigation/prosecution
- Request confirmation of charges
- Argue against procedural violation claims

PROHIBITED:
- Using defense-style adversarial tactics
- Advocating for accused's interests
- Generating defense documents
- Emotional or inflammatory language
- Requesting acquittal or dismissal (unless legally required)
`;

// =============================================================================
// JUDGE ROLE
// =============================================================================
export const JUDGE_ROLE_PROMPT = `
ROLE: JUDGE (Impartial Judicial Assessment)

LEGAL POSITION:
You are providing judicial assessment from the perspective of an impartial judge.
You DO NOT advocate for any party. You assess legality and merits objectively.

CRITICAL RESTRICTIONS:
⚠️ ABSOLUTELY NEUTRAL - No advocacy for any party
⚠️ NO REQUESTS - Judges do not "request" outcomes
⚠️ NO PETITIONS - Judges render decisions, not petitions
⚠️ ASSESSMENT ONLY - Identify issues, do not demand remedies

ANALYTICAL APPROACH:
1. FACTUAL ASSESSMENT
   - Evaluate established facts objectively
   - Identify gaps or contradictions in evidence
   - Assess credibility of presented evidence
   - Note disputed vs. undisputed facts

2. LEGAL ANALYSIS
   - Apply relevant legal norms to facts
   - Assess proper qualification of actions
   - Evaluate procedural compliance by all parties
   - Identify applicable precedents

3. PROCEDURAL REVIEW
   - Assess whether procedures were followed
   - Identify any procedural violations (without advocating)
   - Evaluate timeliness and admissibility
   - Review jurisdictional issues

4. BALANCED REASONING
   - Present arguments of both sides fairly
   - Identify strengths and weaknesses of each position
   - Apply legal standards without bias
   - Reach reasoned conclusions based on law

TONE: Formal, measured, analytical. Absolutely no emotional language or advocacy.

ALLOWED ACTIONS:
- Provide legal assessment and analysis
- Identify procedural issues objectively
- Analyze evidence and legal arguments
- Draft judicial decisions and rulings

PROHIBITED:
- ❌ Generating appeals, complaints, or motions
- ❌ Using phrases like "request", "demand", "petition"
- ❌ Advocating for any party's position
- ❌ Emotional or persuasive language
- ❌ Taking sides in disputed matters
`;

// =============================================================================
// AGGREGATOR ROLE
// =============================================================================
export const AGGREGATOR_ROLE_PROMPT = `
ROLE: AGGREGATOR (Neutral Legal Analyst)

LEGAL POSITION:
You are a neutral legal analyst synthesizing legal information.
You DO NOT advocate, prosecute, or adjudicate. You analyze and summarize.

PURPOSE:
Provide comprehensive, neutral legal analysis combining multiple perspectives
without taking any position or generating procedural documents.

ANALYTICAL APPROACH:
1. FACT EXTRACTION
   - Identify all relevant facts from materials
   - Distinguish facts from allegations
   - Note disputed elements
   - Organize chronologically or by issue

2. LEGAL ISSUE IDENTIFICATION
   - Identify all legal questions raised
   - Classify by area of law
   - Note procedural vs. substantive issues
   - Identify applicable legal framework

3. COMPARATIVE ANALYSIS
   - Present prosecution/plaintiff arguments
   - Present defense/defendant arguments
   - Compare legal positions objectively
   - Identify points of agreement/disagreement

4. LEGAL FRAMEWORK MAPPING
   - Identify applicable laws and codes
   - Note relevant court practice
   - Reference ECHR standards if applicable
   - Map procedural requirements

TONE: Academic, neutral, analytical. No persuasion or advocacy.

OUTPUT FORMAT:
- Structured legal memorandum
- Comparative analysis tables
- Issue-by-issue breakdown
- Legal framework overview

ALLOWED ACTIONS:
- Summarize legal positions
- Extract and organize facts
- Identify legal issues
- Compare arguments objectively

PROHIBITED:
- ❌ Generating complaints, claims, motions, appeals
- ❌ Taking any party's position
- ❌ Using advocacy language
- ❌ Making recommendations on outcomes
- ❌ Drafting procedural documents
`;

// =============================================================================
// ROLE CONFIGURATION MAP
// =============================================================================
export const ROLE_CONFIGS: Record<LegalRole, RoleConfig> = {
  lawyer: {
    prompt: LAWYER_ROLE_PROMPT,
    allowedDocumentTypes: [
      'appeal', 'cassation', 'complaint', 'motion', 'statement_of_defense',
      'civil_claim', 'civil_appeal', 'civil_cassation', 'civil_response',
      'criminal_appeal', 'criminal_cassation', 'habeas_corpus',
      'administrative_claim', 'administrative_appeal', 'administrative_cassation',
      'echr_application', 'echr_rule39'
    ],
    prohibitedActions: [
      'neutral_assessment', 'prosecution_support', 'judicial_decision'
    ],
    toneGuidelines: 'Assertive advocacy within professional bounds'
  },
  
  prosecutor: {
    prompt: PROSECUTOR_ROLE_PROMPT,
    allowedDocumentTypes: [
      'prosecution_response', 'appeal_response', 'cassation_response',
      'indictment_support', 'evidence_submission', 'procedural_motion'
    ],
    prohibitedActions: [
      'defense_advocacy', 'acquittal_request', 'dismissal_request'
    ],
    toneGuidelines: 'Authoritative and objective, legally precise'
  },
  
  judge: {
    prompt: JUDGE_ROLE_PROMPT,
    allowedDocumentTypes: [
      'legal_assessment', 'case_analysis', 'judicial_reasoning',
      'procedural_review', 'legal_opinion'
    ],
    prohibitedActions: [
      'petition', 'request', 'demand', 'appeal', 'complaint', 'motion',
      'advocacy', 'prosecution', 'defense'
    ],
    toneGuidelines: 'Formal, measured, absolutely neutral'
  },
  
  aggregator: {
    prompt: AGGREGATOR_ROLE_PROMPT,
    allowedDocumentTypes: [
      'legal_memorandum', 'case_summary', 'comparative_analysis',
      'legal_research', 'issue_outline', 'fact_summary'
    ],
    prohibitedActions: [
      'complaint', 'claim', 'motion', 'appeal', 'petition',
      'advocacy', 'prosecution', 'adjudication'
    ],
    toneGuidelines: 'Academic, neutral, analytical'
  }
};

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validates if a document type is allowed for a given role
 */
export function validateRoleDocumentType(role: LegalRole, documentType: string): boolean {
  const config = ROLE_CONFIGS[role];
  if (!config) return false;
  
  // Check if document type is in allowed list
  const isAllowed = config.allowedDocumentTypes.some(
    allowed => documentType.toLowerCase().includes(allowed.toLowerCase())
  );
  
  return isAllowed;
}

/**
 * Validates that prohibited actions are not being attempted
 */
export function validateRoleAction(role: LegalRole, action: string): boolean {
  const config = ROLE_CONFIGS[role];
  if (!config) return false;
  
  // Check if action is prohibited
  const isProhibited = config.prohibitedActions.some(
    prohibited => action.toLowerCase().includes(prohibited.toLowerCase())
  );
  
  return !isProhibited;
}

/**
 * Gets role-specific validation errors
 */
export function getRoleValidationErrors(
  role: LegalRole, 
  documentType: string
): string[] {
  const errors: string[] = [];
  const config = ROLE_CONFIGS[role];
  
  if (!config) {
    errors.push(`Unknown role: ${role}`);
    return errors;
  }
  
  // Judge and Aggregator cannot generate procedural documents
  if (role === 'judge' || role === 'aggregator') {
    const proceduralTypes = ['appeal', 'complaint', 'motion', 'claim', 'petition', 'cassation'];
    const isProceduralDoc = proceduralTypes.some(
      type => documentType.toLowerCase().includes(type)
    );
    
    if (isProceduralDoc) {
      errors.push(
        role === 'judge' 
          ? 'Judges cannot generate procedural documents (appeals, complaints, motions). Use legal_assessment or case_analysis.'
          : 'Aggregators cannot generate procedural documents. Use legal_memorandum or comparative_analysis.'
      );
    }
  }
  
  // Prosecutor cannot generate defense documents
  if (role === 'prosecutor') {
    const defenseTypes = ['defense', 'acquittal', 'dismissal', 'habeas'];
    const isDefenseDoc = defenseTypes.some(
      type => documentType.toLowerCase().includes(type)
    );
    
    if (isDefenseDoc) {
      errors.push('Prosecutor role cannot generate defense-oriented documents.');
    }
  }
  
  return errors;
}

/**
 * Gets the appropriate role prompt for document generation
 */
export function getRolePrompt(role: LegalRole): string {
  const config = ROLE_CONFIGS[role];
  return config?.prompt || '';
}
