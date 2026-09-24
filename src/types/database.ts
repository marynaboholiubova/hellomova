/**
 * Hand-maintained typings for the schema (see supabase/migrations).
 * Regenerate with `supabase gen types typescript` once a live project exists
 * and replace this file if the generated shape diverges.
 *
 * `Relationships` is required by @supabase/postgrest-js's generic table
 * shape even though these hand-written types don't model foreign-key
 * embeds — omitting it makes every `.from(...)` call resolve to `never`.
 */
export type Database = {
  public: {
    Views: Record<string, never>;
    Functions: {
      language_brain_ingest_lesson: {
        Args: {
          p_lesson_session_id: string;
          p_user_id: string;
          p_target_language_code: string;
          p_extraction_version: string;
          p_errors: unknown;
          p_vocabulary: unknown;
          p_grammar_total_turns: number;
          p_grammar_positive_turns: number;
          p_duration_ms: number;
        };
        Returns: unknown;
      };
      language_brain_record_review_result: {
        Args: {
          p_review_item_id: string;
          p_user_id: string;
          p_expected_current_stage: number;
          p_result: string;
          p_new_stage: number;
          p_new_due_at: string;
          p_new_mastery_score: number | null;
        };
        Returns: boolean;
      };
    };
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          native_language_code: string | null;
          learning_goal: string | null;
          selected_teacher_id: string | null;
          onboarding_step: string;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          native_language_code?: string | null;
          learning_goal?: string | null;
          selected_teacher_id?: string | null;
          onboarding_step?: string;
          onboarding_completed_at?: string | null;
        };
        Update: {
          display_name?: string | null;
          native_language_code?: string | null;
          learning_goal?: string | null;
          selected_teacher_id?: string | null;
          onboarding_step?: string;
          onboarding_completed_at?: string | null;
        };
        Relationships: [];
      };
      user_languages: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          current_cefr_level: string | null;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          current_cefr_level?: string | null;
          is_primary?: boolean;
        };
        Update: {
          target_language_code?: string;
          current_cefr_level?: string | null;
          is_primary?: boolean;
        };
        Relationships: [];
      };
      placement_test_attempts: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          score: number;
          total_questions: number;
          estimated_level: string;
          category_breakdown: unknown | null;
          test_version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          score: number;
          total_questions: number;
          estimated_level: string;
          category_breakdown?: unknown | null;
          test_version: string;
        };
        // Immutable record — no code path updates a placement attempt.
        Update: {
          target_language_code?: string;
          score?: number;
          total_questions?: number;
          estimated_level?: string;
          category_breakdown?: unknown | null;
          test_version?: string;
        };
        Relationships: [];
      };
      lesson_sessions: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          native_language_code: string;
          cefr_level: string | null;
          learning_goal: string;
          teacher_id: string;
          mode: string;
          status: string;
          prompt_version: string;
          summary: unknown | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          native_language_code: string;
          cefr_level?: string | null;
          learning_goal: string;
          teacher_id: string;
          mode?: string;
          status?: string;
          prompt_version: string;
          summary?: unknown | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          status?: string;
          summary?: unknown | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      lesson_messages: {
        Row: {
          id: string;
          lesson_session_id: string;
          user_id: string;
          role: string;
          content: string;
          metadata: unknown | null;
          client_turn_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lesson_session_id: string;
          user_id: string;
          role: string;
          content: string;
          metadata?: unknown | null;
          client_turn_id?: string | null;
        };
        // Immutable record — no code path updates a lesson message.
        Update: {
          content?: string;
          metadata?: unknown | null;
        };
        Relationships: [];
      };
      language_brain_profiles: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          lessons_ingested_count: number;
          last_ingested_lesson_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          lessons_ingested_count?: number;
          last_ingested_lesson_at?: string | null;
        };
        Update: {
          lessons_ingested_count?: number;
          last_ingested_lesson_at?: string | null;
        };
        Relationships: [];
      };
      language_brain_skill_states: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          skill: string;
          positive_evidence_count: number;
          evidence_count: number;
          // Generated column (Postgres computes it from the two counters
          // above) — never settable via Insert/Update, see 0006_language_brain.sql.
          score: number | null;
          last_evidence_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          skill: string;
          positive_evidence_count?: number;
          evidence_count?: number;
          last_evidence_at?: string | null;
        };
        Update: {
          positive_evidence_count?: number;
          evidence_count?: number;
          last_evidence_at?: string | null;
        };
        Relationships: [];
      };
      language_brain_error_patterns: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          category: string;
          pattern_key: string;
          example_original: string;
          example_corrected: string;
          explanation: string | null;
          first_seen_at: string;
          last_seen_at: string;
          occurrence_count: number;
          is_recurring: boolean;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          category: string;
          pattern_key: string;
          example_original: string;
          example_corrected: string;
          explanation?: string | null;
        };
        Update: {
          occurrence_count?: number;
          last_seen_at?: string;
          example_original?: string;
          example_corrected?: string;
          explanation?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      language_brain_vocabulary: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          canonical_form: string;
          surface_form: string;
          example_sentence: string | null;
          translation: string | null;
          first_seen_at: string;
          last_seen_at: string;
          encounter_count: number;
          mastery_score: number | null;
          review_stage: number;
          next_review_at: string | null;
          last_reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          canonical_form: string;
          surface_form: string;
          example_sentence?: string | null;
          translation?: string | null;
          review_stage?: number;
          next_review_at?: string | null;
        };
        Update: {
          encounter_count?: number;
          last_seen_at?: string;
          example_sentence?: string | null;
          translation?: string | null;
          mastery_score?: number | null;
          review_stage?: number;
          next_review_at?: string | null;
          last_reviewed_at?: string | null;
        };
        Relationships: [];
      };
      language_brain_review_items: {
        Row: {
          id: string;
          user_id: string;
          target_language_code: string;
          source_type: string;
          source_id: string;
          review_stage: number;
          due_at: string;
          status: string;
          last_result: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          target_language_code: string;
          source_type: string;
          source_id: string;
          review_stage?: number;
          due_at: string;
        };
        Update: {
          review_stage?: number;
          due_at?: string;
          status?: string;
          last_result?: string | null;
        };
        Relationships: [];
      };
      language_brain_ingestions: {
        Row: {
          id: string;
          lesson_session_id: string;
          user_id: string;
          target_language_code: string;
          status: string;
          extraction_version: string;
          errors_extracted_count: number;
          vocabulary_extracted_count: number;
          review_items_created_count: number;
          review_items_updated_count: number;
          skills_updated_count: number;
          duration_ms: number | null;
          error_message: string | null;
          attempt_count: number;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_session_id: string;
          user_id: string;
          target_language_code: string;
          status?: string;
          extraction_version: string;
          attempt_count?: number;
        };
        Update: {
          status?: string;
          extraction_version?: string;
          errors_extracted_count?: number;
          vocabulary_extracted_count?: number;
          review_items_created_count?: number;
          review_items_updated_count?: number;
          skills_updated_count?: number;
          duration_ms?: number | null;
          error_message?: string | null;
          attempt_count?: number;
          completed_at?: string | null;
        };
        Relationships: [];
      };
    };
  };
};
