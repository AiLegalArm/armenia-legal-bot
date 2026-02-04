// =============================================================================
// MULTI-AGENT SYSTEM TYPES
// =============================================================================

export type AgentType = 
  | 'evidence_collector'
  | 'evidence_admissibility'
  | 'charge_qualification'
  | 'procedural_violations'
  | 'substantive_violations'
  | 'defense_strategy'
  | 'prosecution_weaknesses'
  | 'rights_violations'
  | 'aggregator';

export type EvidenceType = 
  | 'document'
  | 'testimony'
  | 'expert_conclusion'
  | 'physical'
  | 'protocol'
  | 'audio_video'
  | 'other';

export type EvidenceStatus = 
  | 'admissible'
  | 'inadmissible'
  | 'questionable'
  | 'pending_review';

export type AgentRunStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface CaseVolume {
  id: string;
  case_id: string;
  volume_number: number;
  title: string;
  description?: string;
  file_id?: string;
  page_count?: number;
  ocr_completed: boolean;
  ocr_text?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentAnalysisRun {
  id: string;
  case_id: string;
  agent_type: AgentType;
  status: AgentRunStatus;
  started_at?: string;
  completed_at?: string;
  analysis_result?: string;
  summary?: string;
  findings?: AgentFinding[];
  sources_used?: Array<{ title: string; category: string }>;
  tokens_used?: number;
  error_message?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentFinding {
  id?: string;
  run_id?: string;
  case_id?: string;
  finding_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  legal_basis?: string[];
  evidence_refs?: string[];
  volume_refs?: string[];
  page_references?: string[];
  recommendation?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface EvidenceItem {
  id: string;
  case_id: string;
  volume_id?: string;
  evidence_number: number;
  evidence_type: EvidenceType;
  title: string;
  description?: string;
  page_reference?: string;
  source_document?: string;
  date_obtained?: string;
  obtained_by?: string;
  admissibility_status: EvidenceStatus;
  admissibility_notes?: string;
  related_articles?: string[];
  violations_found?: string[];
  defense_arguments?: string;
  prosecution_position?: string;
  ai_analysis?: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AggregatedReport {
  id: string;
  case_id: string;
  report_type: string;
  title: string;
  executive_summary?: string;
  evidence_summary?: string;
  violations_summary?: string;
  defense_strategy?: string;
  prosecution_weaknesses?: string;
  recommendations?: string;
  full_report?: string;
  agent_runs?: string[];
  statistics?: Record<string, unknown>;
  generated_at: string;
  created_by?: string;
}

// Agent configuration
export interface AgentConfig {
  type: AgentType;
  name: string;
  nameHy: string;
  description: string;
  descriptionHy: string;
  icon: string;
  color: string;
  order: number;
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    type: 'evidence_collector',
    name: 'Evidence Collector',
    nameHy: '\u0531\u057a\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056b \u0570\u0561\u057e\u0561\u0584\u0578\u0572',
    description: 'Catalogs all evidence from case volumes',
    descriptionHy: '\u053f\u0561\u057f\u0561\u056c\u0578\u0563\u0561\u057e\u0578\u0580\u0578\u0582\u0574 \u0567 \u0563\u0578\u0580\u056e\u056b \u0562\u0578\u056c\u0578\u0580 \u0561\u057a\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u0568',
    icon: '\ud83d\udd0d',
    color: 'bg-blue-500',
    order: 1
  },
  {
    type: 'evidence_admissibility',
    name: 'Evidence Admissibility',
    nameHy: '\u0531\u057a\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056b \u0569\u0578\u0582\u0575\u056c\u0561\u057f\u0580\u0565\u056c\u056b\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
    description: 'Analyzes admissibility of each evidence',
    descriptionHy: '\u054e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0574 \u0567 \u0561\u057a\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056b \u0569\u0578\u0582\u0575\u056c\u0561\u057f\u0580\u0565\u056c\u056b\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568',
    icon: '\u2696\ufe0f',
    color: 'bg-amber-500',
    order: 2
  },
  {
    type: 'charge_qualification',
    name: 'Charge Qualification',
    nameHy: '\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056b \u0578\u0580\u0561\u056f\u0561\u057e\u0578\u0580\u0578\u0582\u0574',
    description: 'Verifies correctness of criminal charges',
    descriptionHy: '\u054d\u057f\u0578\u0582\u0563\u0578\u0582\u0574 \u0567 \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056b \u0570\u0561\u0574\u0561\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568',
    icon: '\ud83d\udccb',
    color: 'bg-purple-500',
    order: 3
  },
  {
    type: 'procedural_violations',
    name: 'Procedural Violations',
    nameHy: '\u0534\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576 \u056d\u0561\u056d\u057f\u0578\u0582\u0574\u0576\u0565\u0580',
    description: 'Finds CPC violations',
    descriptionHy: '\u0540\u0561\u0575\u057f\u0576\u0561\u0562\u0565\u0580\u0578\u0582\u0574 \u0567 \u0554\u0534\u0555 \u056d\u0561\u056d\u057f\u0578\u0582\u0574\u0576\u0565\u0580\u0568',
    icon: '\ud83d\udea8',
    color: 'bg-red-500',
    order: 4
  },
  {
    type: 'substantive_violations',
    name: 'Substantive Violations',
    nameHy: '\u0546\u0575\u0578\u0582\u0569\u0561\u056f\u0561\u0576 \u056d\u0561\u056d\u057f\u0578\u0582\u0574\u0576\u0565\u0580',
    description: 'Finds Criminal Code violations',
    descriptionHy: '\u0540\u0561\u0575\u057f\u0576\u0561\u0562\u0565\u0580\u0578\u0582\u0574 \u0567 \u0554\u0555 \u0576\u0578\u0580\u0574\u0565\u0580\u056b \u056d\u0561\u056d\u057f\u0578\u0582\u0574\u0576\u0565\u0580\u0568',
    icon: '\ud83d\udcdc',
    color: 'bg-orange-500',
    order: 5
  },
  {
    type: 'defense_strategy',
    name: 'Defense Strategy',
    nameHy: '\u054a\u0561\u0577\u057f\u057a\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u057d\u057f\u0580\u0561\u057f\u0565\u0563\u056b\u0561',
    description: 'Builds defense arguments',
    descriptionHy: '\u053f\u0561\u0566\u0574\u0578\u0582\u0574 \u0567 \u057a\u0561\u0577\u057f\u057a\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580',
    icon: '\ud83d\udee1\ufe0f',
    color: 'bg-green-500',
    order: 6
  },
  {
    type: 'prosecution_weaknesses',
    name: 'Prosecution Weaknesses',
    nameHy: '\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056b \u0569\u0578\u0582\u0575\u056c \u056f\u0578\u0572\u0574\u0565\u0580',
    description: 'Identifies prosecution gaps',
    descriptionHy: '\u0540\u0561\u0575\u057f\u0576\u0561\u0562\u0565\u0580\u0578\u0582\u0574 \u0567 \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056b \u0569\u0578\u0582\u0575\u056c \u056f\u0578\u0572\u0574\u0565\u0580\u0568',
    icon: '\u26a0\ufe0f',
    color: 'bg-yellow-500',
    order: 7
  },
  {
    type: 'rights_violations',
    name: 'Rights Violations',
    nameHy: '\u053b\u0580\u0561\u057e\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056b \u056d\u0561\u056d\u057f\u0578\u0582\u0574\u0576\u0565\u0580',
    description: 'Finds Constitution & ECHR violations',
    descriptionHy: '\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0587 \u0535\u053f\u0553\u0544 \u056d\u0561\u056d\u057f\u0578\u0582\u0574\u0576\u0565\u0580',
    icon: '\ud83d\udcdc',
    color: 'bg-indigo-500',
    order: 8
  },
  {
    type: 'aggregator',
    name: 'Aggregator',
    nameHy: '\u0531\u0563\u0580\u0565\u0563\u0561\u057f\u0578\u0580',
    description: 'Synthesizes all analyses into final report',
    descriptionHy: '\u0540\u0561\u0574\u0561\u0564\u0580\u0578\u0582\u0574 \u0567 \u0562\u0578\u056c\u0578\u0580 \u057e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580\u0568',
    icon: '\ud83e\udde0',
    color: 'bg-teal-500',
    order: 9
  }
];

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, { en: string; hy: string }> = {
  document: { en: 'Document', hy: '\u0553\u0561\u057d\u057f\u0561\u0569\u0578\u0582\u0572\u0569' },
  testimony: { en: 'Testimony', hy: '\u0551\u0578\u0582\u0581\u0574\u0578\u0582\u0576\u0584' },
  expert_conclusion: { en: 'Expert Conclusion', hy: '\u0553\u0578\u0580\u0571\u0561\u0563\u0565\u057f\u056b \u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576' },
  physical: { en: 'Physical Evidence', hy: '\u054e\u0565\u0572\u0561\u056f\u0561\u0576 \u0561\u057a\u0561\u0581\u0578\u0582\u0575\u0581' },
  protocol: { en: 'Protocol', hy: '\u0531\u0580\u0571\u0561\u0576\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576' },
  audio_video: { en: 'Audio/Video', hy: '\u0531\u0578\u0582\u0564\u056b\u0578/\u054e\u056b\u0564\u0565\u0578' },
  other: { en: 'Other', hy: '\u0531\u0575\u056c' }
};

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, { en: string; hy: string; color: string }> = {
  admissible: { en: 'Admissible', hy: '\u0539\u0578\u0582\u0575\u056c\u0561\u057f\u0580\u0565\u056c\u056b', color: 'bg-green-100 text-green-800' },
  inadmissible: { en: 'Inadmissible', hy: '\u0531\u0576\u0569\u0578\u0582\u0575\u056c\u0561\u057f\u0580\u0565\u056c\u056b', color: 'bg-red-100 text-red-800' },
  questionable: { en: 'Questionable', hy: '\u053f\u0561\u057d\u056f\u0561\u056e\u0565\u056c\u056b', color: 'bg-yellow-100 text-yellow-800' },
  pending_review: { en: 'Pending Review', hy: '\u054d\u057a\u0561\u057d\u0578\u0582\u0574 \u0567 \u057d\u057f\u0578\u0582\u0563\u0574\u0561\u0576', color: 'bg-gray-100 text-gray-800' }
};
