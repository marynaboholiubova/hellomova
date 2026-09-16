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
    Functions: Record<string, never>;
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
    };
  };
};
