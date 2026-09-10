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
      };
      questions: {
        Row: {
          id: string;
          author_id: string;
          text: string;
          choices: string[];
          correct_answer_index: number;
          question_type: 'multiple_choice' | 'free_text';
          correct_answer: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          text: string;
          choices: string[];
          correct_answer_index: number;
          question_type?: 'multiple_choice' | 'free_text';
          correct_answer?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          text?: string;
          choices?: string[];
          correct_answer_index?: number;
          question_type?: 'multiple_choice' | 'free_text';
          correct_answer?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
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
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}

export type Question = Database['public']['Tables']['questions']['Row'];
