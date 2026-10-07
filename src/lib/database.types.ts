export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string;
          display_name: string | null;
          bio: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          username: string;
          display_name?: string | null;
          bio?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          email?: string;
          username?: string;
          display_name?: string | null;
          bio?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          follower_id: string;
          followee_id: string;
          created_at: string;
        };
        Insert: {
          follower_id: string;
          followee_id: string;
          created_at?: string;
        };
        Update: {
          follower_id?: string;
          followee_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          id: string;
          author_id: string;
          text: string;
          choices: string[];
          question_type: 'multiple_choice' | 'free_text';
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          text: string;
          choices: string[];
          question_type?: 'multiple_choice' | 'free_text';
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          text?: string;
          choices?: string[];
          question_type?: 'multiple_choice' | 'free_text';
          is_public?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      question_secrets: {
        Row: { question_id: string; correct_answer_index: number | null; correct_answer: string | null };
        Insert: { question_id: string; correct_answer_index?: number | null; correct_answer?: string | null };
        Update: { correct_answer_index?: number | null; correct_answer?: string | null };
        Relationships: [];
      };
      answers: {
        Row: {
          id: string;
          question_id: string;
          responder_id: string;
          selected_choice_index: number | null;
          answer_text: string | null;
          is_correct: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          responder_id: string;
          selected_choice_index?: number | null;
          answer_text?: string | null;
          is_correct: boolean;
          created_at?: string;
        };
        Update: {
          selected_choice_index?: number;
          answer_text?: string | null;
          is_correct?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      question_reports: {
        Row: {
          id: string;
          question_id: string;
          reporter_id: string;
          reason: 'answer_wrong' | 'ambiguous';
          is_anonymous: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          reporter_id: string;
          reason: 'answer_wrong' | 'ambiguous';
          is_anonymous?: boolean;
          created_at?: string;
        };
        Update: {
          reason?: 'answer_wrong' | 'ambiguous';
          is_anonymous?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      bot_follow_opt_outs: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      profile_question_counts: {
        Args: { p_author_id: string; p_viewer_id: string | null };
        Returns: { total_questions: number; unanswered_questions: number }[];
      };
      create_question_with_secret: {
        Args: {
          p_author_id: string;
          p_text: string;
          p_choices: string[];
          p_question_type: 'multiple_choice' | 'free_text';
          p_is_public: boolean;
          p_correct_answer_index: number | null;
          p_correct_answer: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {};
  };
}

export type Question = Database['public']['Tables']['questions']['Row'];
