import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseKey)

// Tipos atualizados
export interface Database {
  public: {
    Tables: {
      webhook_configs: {
        Row: {
          id: string
          webhook_url: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          webhook_url: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          webhook_url?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      whatsapp_instances: {
        Row: {
          id: string
          instance_name: string
          status: string
          qr_code: string | null
          number: string | null
          created_at: string
          connected_at: string | null
          updated_at: string
          hash: string | null
        }
        Insert: {
          id?: string
          instance_name: string
          status?: string
          qr_code?: string | null
          number?: string | null
          created_at?: string
          connected_at?: string | null
          updated_at?: string
          hash?: string | null
        }
        Update: {
          id?: string
          instance_name?: string
          status?: string
          qr_code?: string | null
          number?: string | null
          created_at?: string
          connected_at?: string | null
          updated_at?: string
          hash?: string | null
        }
      }
      searches: {
        Row: {
          id: string
          city: string
          state: string
          niche: string
          neighborhoods: string[] | null
          status: string
          total_results: number | null
          created_at: string
          place_id: string | null
          rating: string | null
          telefone: string | null
          website: string | null
          endereco: string | null
          name: string | null
        }
        Insert: {
          id?: string
          city: string
          state: string
          niche: string
          neighborhoods?: string[] | null
          status?: string
          total_results?: number | null
          created_at?: string
          place_id?: string | null
          rating?: string | null
          telefone?: string | null
          website?: string | null
          endereco?: string | null
          name?: string | null
        }
        Update: {
          id?: string
          city?: string
          state?: string
          niche?: string
          neighborhoods?: string[] | null
          status?: string
          total_results?: number | null
          created_at?: string
          place_id?: string | null
          rating?: string | null
          telefone?: string | null
          website?: string | null
          endereco?: string | null
          name?: string | null
        }
      }
    }
  }
}

export type WebhookConfig = Database['public']['Tables']['webhook_configs']['Row']
export type WhatsAppInstance = Database['public']['Tables']['whatsapp_instances']['Row']
export type Search = Database['public']['Tables']['searches']['Row']