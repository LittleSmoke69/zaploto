import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

export interface Database {
  public: {
    Tables: {
      webhook_configs: {
        Row: {
          id: string;
          webhook_url: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          webhook_url: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          webhook_url?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      whatsapp_instances: {
        Row: {
          id: string;
          instance_name: string;
          status: string;
          qr_code: string | null;
        number: string | null;
          created_at: string;
          connected_at: string | null;
          updated_at: string;
          hash: string | null;
          user_id: string | null; // novo
        };
        Insert: {
          id?: string;
          instance_name: string;
          status?: string;
          qr_code?: string | null;
          number?: string | null;
          created_at?: string;
          connected_at?: string | null;
          updated_at?: string;
          hash?: string | null;
          user_id?: string | null; // novo
        };
        Update: {
          id?: string;
          instance_name?: string;
          status?: string;
          qr_code?: string | null;
          number?: string | null;
          created_at?: string;
          connected_at?: string | null;
          updated_at?: string;
          hash?: string | null;
          user_id?: string | null; // novo
        };
      };

      searches: {
        Row: {
          id: string;
          city: string;
          state: string;
          niche: string;
          neighborhoods: string[] | null;
          status: string;
          total_results: number | null;
          created_at: string;
          place_id: string | null;
          rating: string | null;
          telefone: string | null;
          website: string | null;
          endereco: string | null;
          name: string | null;
          user_id: string | null; // novo
        };
        Insert: {
          id?: string;
          city: string;
          state: string;
          niche: string;
          neighborhoods?: string[] | null;
          status?: string;
          total_results?: number | null;
          created_at?: string;
          place_id?: string | null;
          rating?: string | null;
          telefone?: string | null;
          website?: string | null;
          endereco?: string | null;
          name?: string | null;
          user_id?: string | null; // novo
        };
        Update: {
          id?: string;
          city?: string;
          state?: string;
          niche?: string;
          neighborhoods?: string[] | null;
          status?: string;
          total_results?: number | null;
          created_at?: string;
          place_id?: string | null;
          rating?: string | null;
          telefone?: string | null;
          website?: string | null;
          endereco?: string | null;
          name?: string | null;
          user_id?: string | null; // novo
        };
      };

      whatsapp_groups: {
        Row: {
          id: string;
          instance_name: string;
          group_id: string;
          group_subject: string | null;
          picture_url: string | null;
          size: number | null;
          created_at: string;
          updated_at: string;
          user_id: string | null; // novo
        };
        Insert: {
          id?: string;
          instance_name: string;
          group_id: string;
          group_subject?: string | null;
          picture_url?: string | null;
          size?: number | null;
          created_at?: string;
          updated_at?: string;
          user_id?: string | null; // novo
        };
        Update: {
          id?: string;
          instance_name?: string;
          group_id?: string;
          group_subject?: string | null;
          picture_url?: string | null;
          size?: number | null;
          created_at?: string;
          updated_at?: string;
          user_id?: string | null; // novo
        };
      };

      profiles: {
        Row: {
          id: string;                 // uuid (PK)
          full_name: string | null;
          email: string;
          password_hash: string;      // armazenamos o hash
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          full_name?: string | null;
          email: string;
          password_hash: string;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string;
          password_hash?: string;
          created_at?: string;
          updated_at?: string | null;
        };
      };
    };
  };
}

/** Helpers de tipos úteis */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];