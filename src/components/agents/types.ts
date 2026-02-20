// =============================================================================
// MULTI-AGENT SYSTEM TYPES
// =============================================================================

// Frontend AgentType (used in multi-agent UI)
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

// Backend AnalysisType (used in ai-analyze edge function)
// Maps to supabase/functions/ai-analyze/system.ts ANALYSIS_TYPES
export type AnalysisType = 
  | 'defense_analysis'
  | 'prosecution_analysis'
  | 'judge_analysis'
  | 'aggregator'
  | 'evidence_admissibility'
  | 'charge_qualification'
  | 'procedural_violations'
  | 'substantive_law_violations'
  | 'fair_trial_and_rights';

// Mapping from frontend AgentType to backend AnalysisType
export const AGENT_TO_ANALYSIS_TYPE: Record<AgentType, AnalysisType> = {
  evidence_collector: 'evidence_admissibility',
  evidence_admissibility: 'evidence_admissibility',
  charge_qualification: 'charge_qualification',
  procedural_violations: 'procedural_violations',
  substantive_violations: 'substantive_law_violations',
  defense_strategy: 'defense_analysis',
  prosecution_weaknesses: 'prosecution_analysis',
  rights_violations: 'fair_trial_and_rights',
  aggregator: 'aggregator',
};

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
  nameRu: string;
  description: string;
  descriptionHy: string;
  descriptionRu: string;
  icon: string;
  color: string;
  order: number;
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    type: 'evidence_collector',
    name: 'Evidence Collector',
    nameHy: 'Ապացույցների հավաքող',
    nameRu: 'Сбор доказательств',
    description: 'Catalogs all evidence from case volumes',
    descriptionHy: 'Կատալոգավորում է գործի բոլոր ապացույցները',
    descriptionRu: 'Каталогизирует все доказательства из томов дела',
    icon: '🔍',
    color: 'bg-blue-500',
    order: 1
  },
  {
    type: 'evidence_admissibility',
    name: 'Evidence Admissibility',
    nameHy: 'Ապացույցների թույлատրելիություն',
    nameRu: 'Допустимость доказательств',
    description: 'Analyzes admissibility of each evidence',
    descriptionHy: 'Վերлուծум է ապацойцнерի թуйlatrelиуtуune',
    descriptionRu: 'Анализирует допустимость каждого доказательства',
    icon: '⚖️',
    color: 'bg-amber-500',
    order: 2
  },
  {
    type: 'charge_qualification',
    name: 'Charge Qualification',
    nameHy: 'Մեղадранkyի квалификация',
    nameRu: 'Квалификация обвинения',
    description: 'Verifies correctness of criminal charges',
    descriptionHy: 'Ступum է мегадранkyи hамаpataskhanutyuне',
    descriptionRu: 'Проверяет правильность квалификации обвинения',
    icon: '📋',
    color: 'bg-purple-500',
    order: 3
  },
  {
    type: 'procedural_violations',
    name: 'Procedural Violations',
    nameHy: 'Դատavараkan Խakhтuмнер',
    nameRu: 'Процессуальные нарушения',
    description: 'Finds CPC violations',
    descriptionHy: 'Haytnaberum е ՔԴՕ khakhтuмнере',
    descriptionRu: 'Выявляет нарушения УПК',
    icon: '🚨',
    color: 'bg-red-500',
    order: 4
  },
  {
    type: 'substantive_violations',
    name: 'Substantive Violations',
    nameHy: 'Нюtаkаn Խakhтuмнер',
    nameRu: 'Нарушения норм УК',
    description: 'Finds Criminal Code violations',
    descriptionHy: 'Haytnaberum е ՔՕ normeri khakhтuмнерe',
    descriptionRu: 'Выявляет нарушения норм Уголовного кодекса',
    icon: '📜',
    color: 'bg-orange-500',
    order: 5
  },
  {
    type: 'defense_strategy',
    name: 'Defense Strategy',
    nameHy: 'Паштpануtyan Стратегиа',
    nameRu: 'Стратегия защиты',
    description: 'Builds defense arguments',
    descriptionHy: 'Казмum е паштpануtyan фастаркнер',
    descriptionRu: 'Формирует аргументы защиты',
    icon: '🛡️',
    color: 'bg-green-500',
    order: 6
  },
  {
    type: 'prosecution_weaknesses',
    name: 'Prosecution Weaknesses',
    nameHy: 'Meghаdranki Тuyл Кohмер',
    nameRu: 'Слабости обвинения',
    description: 'Identifies prosecution gaps',
    descriptionHy: 'Haytnaberum е meghadranki тuyl koghmerе',
    descriptionRu: 'Выявляет слабые места обвинения',
    icon: '⚠️',
    color: 'bg-yellow-500',
    order: 7
  },
  {
    type: 'rights_violations',
    name: 'Rights Violations',
    nameHy: 'Иравунkyнери Хахтuмнер',
    nameRu: 'Нарушения прав',
    description: 'Finds Constitution & ECHR violations',
    descriptionHy: 'Sahmanadrutyан ew ЕКПМ хахтumнер',
    descriptionRu: 'Нарушения Конституции и ЕКПЧ',
    icon: '📜',
    color: 'bg-indigo-500',
    order: 8
  },
  {
    type: 'aggregator',
    name: 'Aggregator',
    nameHy: 'Агрегатор',
    nameRu: 'Агрегатор',
    description: 'Synthesizes all analyses into final report',
    descriptionHy: 'Hamadrum е bolor verluxutyunnerе',
    descriptionRu: 'Объединяет все анализы в итоговый отчёт',
    icon: '🧠',
    color: 'bg-teal-500',
    order: 9
  }
];

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, { en: string; hy: string; ru: string }> = {
  document: { en: 'Document', hy: 'Փաստաuтugt', ru: 'Документ' },
  testimony: { en: 'Testimony', hy: 'Цуцмунк', ru: 'Показание' },
  expert_conclusion: { en: 'Expert Conclusion', hy: 'Порджageti Езракацутюн', ru: 'Заключение эксперта' },
  physical: { en: 'Physical Evidence', hy: 'Вещakan Апацуйц', ru: 'Вещественное доказательство' },
  protocol: { en: 'Protocol', hy: 'Арdjанаgруtюн', ru: 'Протокол' },
  audio_video: { en: 'Audio/Video', hy: 'Аудио/Видео', ru: 'Аудио/Видео' },
  other: { en: 'Other', hy: 'Айл', ru: 'Другое' }
};

export const EVIDENCE_STATUS_LABELS: Record<EvidenceStatus, { en: string; hy: string; ru: string; color: string }> = {
  admissible: { en: 'Admissible', hy: 'Тuylatrelи', ru: 'Допустимо', color: 'bg-green-100 text-green-800' },
  inadmissible: { en: 'Inadmissible', hy: 'Антuylatrelи', ru: 'Недопустимо', color: 'bg-red-100 text-red-800' },
  questionable: { en: 'Questionable', hy: 'Касkахели', ru: 'Спорно', color: 'bg-yellow-100 text-yellow-800' },
  pending_review: { en: 'Pending Review', hy: 'Спасum е Стugман', ru: 'На проверке', color: 'bg-gray-100 text-gray-800' }
};
