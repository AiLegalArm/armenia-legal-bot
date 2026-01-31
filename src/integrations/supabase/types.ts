export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_analysis: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          prompt_used: string | null
          response_text: string
          role: string
          sources_used: Json | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_used?: string | null
          response_text: string
          role: string
          sources_used?: Json | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_used?: string | null
          response_text?: string
          role?: string
          sources_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage: {
        Row: {
          created_at: string
          estimated_cost: number | null
          id: string
          model_name: string | null
          request_metadata: Json | null
          service_type: string
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          model_name?: string | null
          request_metadata?: Json | null
          service_type: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          model_name?: string | null
          request_metadata?: Json | null
          service_type?: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      audio_transcriptions: {
        Row: {
          confidence: number | null
          created_at: string
          duration_seconds: number | null
          file_id: string
          id: string
          language: string | null
          needs_review: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          speaker_labels: Json | null
          transcription_text: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          duration_seconds?: number | null
          file_id: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          speaker_labels?: Json | null
          transcription_text: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          duration_seconds?: number | null
          file_id?: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          speaker_labels?: Json | null
          transcription_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_transcriptions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "case_files"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      case_comments: {
        Row: {
          author_id: string
          case_id: string
          content: string
          created_at: string
          id: string
          is_internal: boolean
          updated_at: string
        }
        Insert: {
          author_id: string
          case_id: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_comments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_files: {
        Row: {
          case_id: string
          created_at: string
          deleted_at: string | null
          file_size: number | null
          file_type: string | null
          filename: string
          hash_sha256: string | null
          id: string
          original_filename: string
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          case_id: string
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          filename: string
          hash_sha256?: string | null
          id?: string
          original_filename: string
          storage_path: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string
          hash_sha256?: string | null
          id?: string
          original_filename?: string
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_files_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_number: string
          case_type: Database["public"]["Enums"]["case_type"] | null
          client_id: string | null
          court: string | null
          court_date: string | null
          court_name: string | null
          created_at: string
          current_stage: string | null
          deleted_at: string | null
          description: string | null
          facts: string | null
          id: string
          lawyer_id: string | null
          legal_question: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["case_priority"]
          status: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at: string
        }
        Insert: {
          case_number: string
          case_type?: Database["public"]["Enums"]["case_type"] | null
          client_id?: string | null
          court?: string | null
          court_date?: string | null
          court_name?: string | null
          created_at?: string
          current_stage?: string | null
          deleted_at?: string | null
          description?: string | null
          facts?: string | null
          id?: string
          lawyer_id?: string | null
          legal_question?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at?: string
        }
        Update: {
          case_number?: string
          case_type?: Database["public"]["Enums"]["case_type"] | null
          client_id?: string | null
          court?: string | null
          court_date?: string | null
          court_name?: string | null
          created_at?: string
          current_stage?: string | null
          deleted_at?: string | null
          description?: string | null
          facts?: string | null
          id?: string
          lawyer_id?: string | null
          legal_question?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_hy: string
          name_ru: string
          required_fields: string[]
          subcategory: string | null
          template_structure: Json
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_hy: string
          name_ru: string
          required_fields?: string[]
          subcategory?: string | null
          template_structure?: Json
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_hy?: string
          name_ru?: string
          required_fields?: string[]
          subcategory?: string | null
          template_structure?: Json
          updated_at?: string
        }
        Relationships: []
      }
      encrypted_pii: {
        Row: {
          created_at: string
          encrypted_value: string
          field_name: string
          id: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_value: string
          field_name: string
          id?: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_value?: string
          field_name?: string
          id?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          case_id: string | null
          created_at: string
          error_details: Json | null
          error_message: string
          error_type: string
          file_id: string | null
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          user_id: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          error_details?: Json | null
          error_message: string
          error_type: string
          file_id?: string | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          error_details?: Json | null
          error_message?: string
          error_type?: string
          file_id?: string | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "case_files"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          case_id: string | null
          content_text: string
          created_at: string
          id: string
          metadata: Json | null
          recipient_name: string | null
          recipient_organization: string | null
          recipient_position: string | null
          sender_address: string | null
          sender_contact: string | null
          sender_name: string | null
          source_text: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          content_text: string
          created_at?: string
          id?: string
          metadata?: Json | null
          recipient_name?: string | null
          recipient_organization?: string | null
          recipient_position?: string | null
          sender_address?: string | null
          sender_contact?: string | null
          sender_name?: string | null
          source_text?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          content_text?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          recipient_name?: string | null
          recipient_organization?: string | null
          recipient_position?: string | null
          sender_address?: string | null
          sender_contact?: string | null
          sender_name?: string | null
          source_text?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_versions: {
        Row: {
          article_number: string | null
          category: Database["public"]["Enums"]["kb_category"]
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          content_text: string
          id: string
          kb_id: string
          source_name: string | null
          source_url: string | null
          title: string
          version_date: string | null
          version_number: number
        }
        Insert: {
          article_number?: string | null
          category: Database["public"]["Enums"]["kb_category"]
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          content_text: string
          id?: string
          kb_id: string
          source_name?: string | null
          source_url?: string | null
          title: string
          version_date?: string | null
          version_number?: number
        }
        Update: {
          article_number?: string | null
          category?: Database["public"]["Enums"]["kb_category"]
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          content_text?: string
          id?: string
          kb_id?: string
          source_name?: string | null
          source_url?: string | null
          title?: string
          version_date?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_versions_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          article_number: string | null
          category: Database["public"]["Enums"]["kb_category"]
          content_text: string
          created_at: string
          current_version: number | null
          id: string
          is_active: boolean
          source_name: string | null
          source_url: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
          version_date: string | null
        }
        Insert: {
          article_number?: string | null
          category?: Database["public"]["Enums"]["kb_category"]
          content_text: string
          created_at?: string
          current_version?: number | null
          id?: string
          is_active?: boolean
          source_name?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          version_date?: string | null
        }
        Update: {
          article_number?: string | null
          category?: Database["public"]["Enums"]["kb_category"]
          content_text?: string
          created_at?: string
          current_version?: number | null
          id?: string
          is_active?: boolean
          source_name?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          version_date?: string | null
        }
        Relationships: []
      }
      legal_practice_kb: {
        Row: {
          applied_articles: Json | null
          case_number_anonymized: string | null
          content_text: string
          court_name: string | null
          court_type: Database["public"]["Enums"]["court_type"]
          created_at: string
          decision_date: string | null
          description: string | null
          id: string
          is_active: boolean
          is_anonymized: boolean
          key_violations: string[] | null
          legal_reasoning_summary: string | null
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          source_name: string | null
          source_url: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          applied_articles?: Json | null
          case_number_anonymized?: string | null
          content_text: string
          court_name?: string | null
          court_type: Database["public"]["Enums"]["court_type"]
          created_at?: string
          decision_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_anonymized?: boolean
          key_violations?: string[] | null
          legal_reasoning_summary?: string | null
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          source_name?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          applied_articles?: Json | null
          case_number_anonymized?: string | null
          content_text?: string
          court_name?: string | null
          court_type?: Database["public"]["Enums"]["court_type"]
          created_at?: string
          decision_date?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_anonymized?: boolean
          key_violations?: string[] | null
          legal_reasoning_summary?: string | null
          outcome?: Database["public"]["Enums"]["case_outcome"]
          practice_category?: Database["public"]["Enums"]["practice_category"]
          source_name?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          notification_type: string
          reminder_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type?: string
          reminder_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type?: string
          reminder_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_results: {
        Row: {
          confidence: number | null
          created_at: string
          extracted_text: string
          file_id: string
          id: string
          language: string | null
          needs_review: boolean
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extracted_text: string
          file_id: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extracted_text?: string
          file_id?: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "case_files"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auditor_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          encrypted_address: string | null
          encrypted_passport: string | null
          encrypted_ssn: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          auditor_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          encrypted_address?: string | null
          encrypted_passport?: string | null
          encrypted_ssn?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          auditor_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          encrypted_address?: string | null
          encrypted_passport?: string | null
          encrypted_ssn?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          case_id: string | null
          created_at: string
          description: string | null
          event_datetime: string
          id: string
          notify_before: number[]
          priority: Database["public"]["Enums"]["case_priority"]
          reminder_type: Database["public"]["Enums"]["reminder_type"]
          status: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          event_datetime: string
          id?: string
          notify_before?: number[]
          priority?: Database["public"]["Enums"]["case_priority"]
          reminder_type?: Database["public"]["Enums"]["reminder_type"]
          status?: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          event_datetime?: string
          id?: string
          notify_before?: number[]
          priority?: Database["public"]["Enums"]["case_priority"]
          reminder_type?: Database["public"]["Enums"]["reminder_type"]
          status?: Database["public"]["Enums"]["reminder_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          leader_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          leader_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          analysis_id: string | null
          case_id: string | null
          comment: string | null
          created_at: string
          id: string
          rating: number | null
          user_id: string | null
        }
        Insert: {
          analysis_id?: string | null
          case_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          analysis_id?: string | null
          case_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "ai_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feedback_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_budget_alert: { Args: { budget_limit?: number }; Returns: boolean }
      decrypt_pii: {
        Args: { _field_name: string; _user_id: string }
        Returns: string
      }
      decrypt_sensitive_data: {
        Args: { p_encrypted_data: string; p_key?: string }
        Returns: string
      }
      encrypt_pii: {
        Args: { _field_name: string; _user_id: string; _value: string }
        Returns: boolean
      }
      encrypt_sensitive_data: {
        Args: { p_data: string; p_key?: string }
        Returns: string
      }
      get_led_team_ids: { Args: { _user_id: string }; Returns: string[] }
      get_monthly_usage: {
        Args: never
        Returns: {
          service_type: string
          total_cost: number
          total_requests: number
          total_tokens: number
        }[]
      }
      get_team_member_ids: { Args: { _leader_id: string }; Returns: string[] }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_leader: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      log_api_usage: {
        Args: {
          _estimated_cost?: number
          _metadata?: Json
          _model_name?: string
          _service_type: string
          _tokens_used?: number
        }
        Returns: string
      }
      log_audit: {
        Args: {
          _action: string
          _details?: Json
          _record_id?: string
          _table_name?: string
        }
        Returns: string
      }
      log_error: {
        Args: {
          _case_id?: string
          _error_details?: Json
          _error_message: string
          _error_type: string
          _file_id?: string
        }
        Returns: string
      }
      retrieve_decrypted_pii: {
        Args: { p_field_name: string; p_user_id: string }
        Returns: string
      }
      search_knowledge_base: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          category: Database["public"]["Enums"]["kb_category"]
          content_text: string
          id: string
          rank: number
          source_name: string
          title: string
          version_date: string
        }[]
      }
      search_legal_practice: {
        Args: {
          category?: Database["public"]["Enums"]["practice_category"]
          court?: Database["public"]["Enums"]["court_type"]
          result_limit?: number
          search_query: string
        }
        Returns: {
          applied_articles: Json
          content_snippet: string
          court_type: Database["public"]["Enums"]["court_type"]
          id: string
          key_violations: string[]
          legal_reasoning_summary: string
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          relevance_rank: number
          title: string
        }[]
      }
      store_encrypted_pii: {
        Args: { p_field_name: string; p_user_id: string; p_value: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "lawyer" | "client" | "auditor"
      case_outcome:
        | "granted"
        | "rejected"
        | "partial"
        | "remanded"
        | "discontinued"
      case_priority: "low" | "medium" | "high" | "urgent"
      case_status: "open" | "in_progress" | "pending" | "closed" | "archived"
      case_type: "criminal" | "civil" | "administrative"
      court_type:
        | "first_instance"
        | "appeal"
        | "cassation"
        | "constitutional"
        | "echr"
      document_category:
        | "general"
        | "civil_process"
        | "criminal_process"
        | "administrative_process"
        | "constitutional"
        | "international"
        | "pre_trial"
        | "contract"
      kb_category:
        | "constitution"
        | "civil_code"
        | "criminal_code"
        | "labor_code"
        | "family_code"
        | "administrative_code"
        | "tax_code"
        | "court_practice"
        | "legal_commentary"
        | "other"
        | "criminal_procedure_code"
        | "civil_procedure_code"
        | "administrative_procedure_code"
        | "administrative_violations_code"
        | "land_code"
        | "forest_code"
        | "water_code"
        | "urban_planning_code"
        | "electoral_code"
        | "state_duty_law"
        | "citizenship_law"
        | "public_service_law"
        | "human_rights_law"
        | "anti_corruption_body_law"
        | "corruption_prevention_law"
        | "mass_media_law"
        | "education_law"
        | "healthcare_law"
        | "echr"
        | "eaeu_customs_code"
        | "judicial_code"
        | "constitutional_law"
        | "real_estate_code"
        | "housing_code"
        | "criminal_economic_code"
        | "justice_ministry_code"
        | "economic_code"
        | "cassation_criminal"
        | "cassation_civil"
        | "cassation_administrative"
        | "subsoil_code"
        | "penal_enforcement_code"
        | "constitutional_court_decisions"
        | "echr_judgments"
        | "government_decisions"
        | "central_electoral_commission_decisions"
        | "prime_minister_decisions"
      practice_category: "criminal" | "civil" | "administrative" | "echr"
      reminder_status: "active" | "completed" | "dismissed"
      reminder_type: "court_hearing" | "deadline" | "task" | "meeting" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "lawyer", "client", "auditor"],
      case_outcome: [
        "granted",
        "rejected",
        "partial",
        "remanded",
        "discontinued",
      ],
      case_priority: ["low", "medium", "high", "urgent"],
      case_status: ["open", "in_progress", "pending", "closed", "archived"],
      case_type: ["criminal", "civil", "administrative"],
      court_type: [
        "first_instance",
        "appeal",
        "cassation",
        "constitutional",
        "echr",
      ],
      document_category: [
        "general",
        "civil_process",
        "criminal_process",
        "administrative_process",
        "constitutional",
        "international",
        "pre_trial",
        "contract",
      ],
      kb_category: [
        "constitution",
        "civil_code",
        "criminal_code",
        "labor_code",
        "family_code",
        "administrative_code",
        "tax_code",
        "court_practice",
        "legal_commentary",
        "other",
        "criminal_procedure_code",
        "civil_procedure_code",
        "administrative_procedure_code",
        "administrative_violations_code",
        "land_code",
        "forest_code",
        "water_code",
        "urban_planning_code",
        "electoral_code",
        "state_duty_law",
        "citizenship_law",
        "public_service_law",
        "human_rights_law",
        "anti_corruption_body_law",
        "corruption_prevention_law",
        "mass_media_law",
        "education_law",
        "healthcare_law",
        "echr",
        "eaeu_customs_code",
        "judicial_code",
        "constitutional_law",
        "real_estate_code",
        "housing_code",
        "criminal_economic_code",
        "justice_ministry_code",
        "economic_code",
        "cassation_criminal",
        "cassation_civil",
        "cassation_administrative",
        "subsoil_code",
        "penal_enforcement_code",
        "constitutional_court_decisions",
        "echr_judgments",
        "government_decisions",
        "central_electoral_commission_decisions",
        "prime_minister_decisions",
      ],
      practice_category: ["criminal", "civil", "administrative", "echr"],
      reminder_status: ["active", "completed", "dismissed"],
      reminder_type: ["court_hearing", "deadline", "task", "meeting", "other"],
    },
  },
} as const
