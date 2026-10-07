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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      application_events: {
        Row: {
          application_id: string
          at: string
          from_status: Database["public"]["Enums"]["application_status"] | null
          guest_message: string | null
          id: number
          public_message: string | null
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Insert: {
          application_id: string
          at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          guest_message?: string | null
          id?: never
          public_message?: string | null
          to_status: Database["public"]["Enums"]["application_status"]
        }
        Update: {
          application_id?: string
          at?: string
          from_status?: Database["public"]["Enums"]["application_status"] | null
          guest_message?: string | null
          id?: never
          public_message?: string | null
          to_status?: Database["public"]["Enums"]["application_status"]
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          age_confirmed: boolean
          consent_at: string | null
          consent_method: string | null
          consent_version: string | null
          contact_email: string | null
          created_at: string
          display_name: string | null
          event_id: string
          guest_reply: string | null
          id: string
          idempotency_key: string | null
          marketing_consent: boolean
          note: string | null
          public_message: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["application_status"]
          submit_fingerprint: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          age_confirmed?: boolean
          consent_at?: string | null
          consent_method?: string | null
          consent_version?: string | null
          contact_email?: string | null
          created_at?: string
          display_name?: string | null
          event_id: string
          guest_reply?: string | null
          id?: string
          idempotency_key?: string | null
          marketing_consent?: boolean
          note?: string | null
          public_message?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submit_fingerprint?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Update: {
          age_confirmed?: boolean
          consent_at?: string | null
          consent_method?: string | null
          consent_version?: string | null
          contact_email?: string | null
          created_at?: string
          display_name?: string | null
          event_id?: string
          guest_reply?: string | null
          id?: string
          idempotency_key?: string | null
          marketing_consent?: boolean
          note?: string | null
          public_message?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submit_fingerprint?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "applications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_private_details: {
        Row: {
          event_id: string
          staff_notes: string
          updated_at: string
          updated_by: string | null
          venue_address: string
        }
        Insert: {
          event_id: string
          staff_notes?: string
          updated_at?: string
          updated_by?: string | null
          venue_address?: string
        }
        Update: {
          event_id?: string
          staff_notes?: string
          updated_at?: string
          updated_by?: string | null
          venue_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_private_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tiers: {
        Row: {
          active: boolean
          amount_minor: number
          created_at: string
          currency: string
          event_id: string
          id: string
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_minor: number
          created_at?: string
          currency: string
          event_id: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_minor?: number
          created_at?: string
          currency?: string
          event_id?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address_reveal_at: string | null
          cancelled_at: string | null
          capacity: number | null
          created_at: string
          description: string
          entry_closes_at: string | null
          entry_opens_at: string | null
          id: string
          is_synthetic: boolean
          qr_release_at: string | null
          reserve_ttl_minutes: number
          sales_close_at: string | null
          sales_open: boolean
          slug: string
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          timezone: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          address_reveal_at?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          created_at?: string
          description?: string
          entry_closes_at?: string | null
          entry_opens_at?: string | null
          id?: string
          is_synthetic?: boolean
          qr_release_at?: string | null
          reserve_ttl_minutes?: number
          sales_close_at?: string | null
          sales_open?: boolean
          slug: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          address_reveal_at?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          created_at?: string
          description?: string
          entry_closes_at?: string | null
          entry_opens_at?: string | null
          id?: string
          is_synthetic?: boolean
          qr_release_at?: string | null
          reserve_ttl_minutes?: number
          sales_close_at?: string | null
          sales_open?: boolean
          slug?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          timezone?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          code: string
          created_at: string
          email: string
          error: string | null
          expires_at: string
          id: string
          invited_user_id: string | null
          issued_by: string | null
          request_id: string | null
          revoked_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invite_status"]
          token_hash: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          code: string
          created_at?: string
          email: string
          error?: string | null
          expires_at?: string
          id?: string
          invited_user_id?: string | null
          issued_by?: string | null
          request_id?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          code?: string
          created_at?: string
          email?: string
          error?: string | null
          expires_at?: string
          id?: string
          invited_user_id?: string | null
          issued_by?: string | null
          request_id?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "membership_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_requests: {
        Row: {
          consent_at: string | null
          consent_method: string | null
          consent_version: string | null
          created_at: string
          current_invite_id: string | null
          display_name: string
          email: string
          event_slug: string | null
          id: string
          invite_error: string | null
          invited_at: string | null
          invited_user_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["membership_request_status"]
          telegram_username: string
          updated_at: string
        }
        Insert: {
          consent_at?: string | null
          consent_method?: string | null
          consent_version?: string | null
          created_at?: string
          current_invite_id?: string | null
          display_name: string
          email: string
          event_slug?: string | null
          id?: string
          invite_error?: string | null
          invited_at?: string | null
          invited_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["membership_request_status"]
          telegram_username: string
          updated_at?: string
        }
        Update: {
          consent_at?: string | null
          consent_method?: string | null
          consent_version?: string | null
          created_at?: string
          current_invite_id?: string | null
          display_name?: string
          email?: string
          event_slug?: string | null
          id?: string
          invite_error?: string | null
          invited_at?: string | null
          invited_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["membership_request_status"]
          telegram_username?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_requests_current_invite_id_fkey"
            columns: ["current_invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
        ]
      }
      motion_defaults: {
        Row: {
          created_at: string
          key: string
          schema_version: number
          settings: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          key: string
          schema_version: number
          settings: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          schema_version?: number
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          environment: string
          event_id: string
          id: string
          reservation_id: string
          review_reason: string | null
          status: Database["public"]["Enums"]["order_status"]
          tier_id: string
          tier_name: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          environment: string
          event_id: string
          id?: string
          reservation_id: string
          review_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tier_id: string
          tier_name: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          environment?: string
          event_id?: string
          id?: string
          reservation_id?: string
          review_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tier_id?: string
          tier_name?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      participations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          order_id: string
          status: Database["public"]["Enums"]["participation_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          order_id: string
          status?: Database["public"]["Enums"]["participation_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["participation_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount_minor: number
          currency: string
          environment: string
          id: number
          kind: string
          occurred_at: string
          order_id: string
          outcome: string
          provider: string
          provider_event_id: string
          provider_payment_id: string
          received_at: string
        }
        Insert: {
          amount_minor: number
          currency: string
          environment: string
          id?: never
          kind: string
          occurred_at: string
          order_id: string
          outcome: string
          provider: string
          provider_event_id: string
          provider_payment_id: string
          received_at?: string
        }
        Update: {
          amount_minor?: number
          currency?: string
          environment?: string
          id?: never
          kind?: string
          occurred_at?: string
          order_id?: string
          outcome?: string
          provider?: string
          provider_event_id?: string
          provider_payment_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          environment: string
          id: string
          last_event_at: string | null
          order_id: string
          provider: string
          provider_payment_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency: string
          environment: string
          id?: string
          last_event_at?: string | null
          order_id: string
          provider: string
          provider_payment_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          last_event_at?: string | null
          order_id?: string
          provider?: string
          provider_payment_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          telegram_id: number | null
          telegram_username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          telegram_id?: number | null
          telegram_username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          telegram_id?: number | null
          telegram_username?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          actor: string
          amount_minor: number
          created_at: string
          currency: string
          environment: string
          id: string
          idempotency_key: string
          order_id: string
          request_hash: string
          status: string
        }
        Insert: {
          actor: string
          amount_minor: number
          created_at?: string
          currency: string
          environment: string
          id?: string
          idempotency_key: string
          order_id: string
          request_hash: string
          status?: string
        }
        Update: {
          actor?: string
          amount_minor?: number
          created_at?: string
          currency?: string
          environment?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          request_hash?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          application_id: string
          created_at: string
          event_id: string
          expires_at: string
          id: string
          idempotency_key: string
          status: Database["public"]["Enums"]["reservation_status"]
          tier_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          event_id: string
          expires_at: string
          id?: string
          idempotency_key: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tier_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          event_id?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          tier_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "event_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      site_media: {
        Row: {
          slot: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          slot: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          slot?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      site_sections: {
        Row: {
          body: string
          created_at: string
          key: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          key: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          key?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_assignments: {
        Row: {
          created_at: string
          event_id: string | null
          granted_by: string | null
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string | null
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { _token_hash?: string; _user: string }
        Returns: string
      }
      admin_event_transition: {
        Args: { _action: string; _expected_version: number; _id: string }
        Returns: string
      }
      admin_save_event: {
        Args: { _data: Json; _expected_version: number; _id: string }
        Returns: string
      }
      admin_save_private_details: {
        Args: { _address: string; _event: string; _notes: string }
        Returns: undefined
      }
      admin_save_tier: {
        Args: {
          _active: boolean
          _amount: number
          _currency: string
          _event: string
          _name: string
          _tier: string
        }
        Returns: string
      }
      apply_payment_event: {
        Args: {
          _amount: number
          _currency: string
          _env: string
          _event_id: string
          _kind: string
          _occurred_at: string
          _order: string
          _payment_id: string
          _provider: string
        }
        Returns: string
      }
      cancel_my_order: { Args: { _order: string }; Returns: string }
      expire_reservations: { Args: never; Returns: number }
      grant_staff_assignment: {
        Args: {
          _email: string
          _event?: string
          _role: Database["public"]["Enums"]["staff_role"]
          _valid_until?: string
        }
        Returns: string
      }
      guest_application_action: {
        Args: {
          _action: string
          _app: string
          _expected_version: number
          _reply?: string
        }
        Returns: Database["public"]["Enums"]["application_status"]
      }
      guest_update_display_name: {
        Args: { _app: string; _expected_version: number; _name: string }
        Returns: number
      }
      issue_invite: {
        Args: { _actor: string; _request: string }
        Returns: {
          code: string
          id: string
        }[]
      }
      mark_invite: {
        Args: {
          _error?: string
          _invite: string
          _sent: boolean
          _token_hash?: string
          _user?: string
        }
        Returns: undefined
      }
      membership_decide: {
        Args: {
          _decision: Database["public"]["Enums"]["membership_request_status"]
          _request: string
        }
        Returns: Json
      }
      moderate_application: {
        Args: {
          _action: string
          _app: string
          _expected_version: number
          _public_message?: string
        }
        Returns: Database["public"]["Enums"]["application_status"]
      }
      my_admission: { Args: never; Returns: string }
      my_staff_access: { Args: { _area: string }; Returns: boolean }
      order_history: {
        Args: { _order: string }
        Returns: {
          action: string
          at: string
          details: Json
          result: string
        }[]
      }
      record_membership_invite: {
        Args: {
          _invite_error?: string
          _invited_user: string
          _request: string
        }
        Returns: undefined
      }
      refund_sandbox: {
        Args: { _amount: number; _idem: string; _order: string }
        Returns: Json
      }
      request_history: {
        Args: { _request: string }
        Returns: {
          action: string
          at: string
          details: Json
          result: string
        }[]
      }
      reserve_seat: {
        Args: { _event: string; _idem: string; _tier: string }
        Returns: Json
      }
      review_membership_request_service: {
        Args: {
          _actor: string
          _decision: Database["public"]["Enums"]["membership_request_status"]
          _request: string
        }
        Returns: Database["public"]["Enums"]["membership_request_status"]
      }
      revoke_invite: {
        Args: { _actor: string; _invite: string }
        Returns: boolean
      }
      revoke_staff_assignment: {
        Args: { _assignment: string }
        Returns: string
      }
      save_site_section: {
        Args: {
          _actor: string
          _body: string
          _key: string
          _status: string
          _title: string
        }
        Returns: undefined
      }
      set_admission_service: {
        Args: { _source: string; _state: string; _user: string }
        Returns: undefined
      }
      staff_can: { Args: { _cap: string; _event?: string }; Returns: boolean }
      submit_application: {
        Args: {
          _age_confirmed: boolean
          _consent_version: string
          _display_name: string
          _event: string
          _idempotency: string
        }
        Returns: string
      }
      submit_application_v2: {
        Args: {
          _age_confirmed: boolean
          _consent_version: string
          _display_name: string
          _event: string
          _idempotency: string
        }
        Returns: Json
      }
      submit_membership_request: {
        Args: {
          _consent_version: string
          _display_name: string
          _email: string
          _event_slug: string
          _identifier_hash: string
          _telegram_username: string
        }
        Returns: undefined
      }
      telegram_consume_login: {
        Args: { _hash: string; _telegram_id: number }
        Returns: string
      }
    }
    Enums: {
      application_status:
        | "submitted"
        | "withdrawn"
        | "approved"
        | "rejected"
        | "under_review"
        | "needs_info"
        | "waitlisted"
      event_status: "draft" | "published" | "archived"
      invite_status:
        | "created"
        | "sent"
        | "failed"
        | "accepted"
        | "revoked"
        | "expired"
        | "replaced"
      membership_request_status: "pending" | "approved" | "rejected"
      order_status:
        | "awaiting_payment"
        | "paid"
        | "failed"
        | "cancelled"
        | "expired"
        | "needs_review"
        | "refunded"
      participation_status: "active" | "revoked" | "refunded"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      reservation_status: "active" | "converted" | "expired" | "cancelled"
      staff_role:
        | "owner"
        | "admin"
        | "editor"
        | "moderator"
        | "scanner"
        | "shift_lead"
        | "finance"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      application_status: [
        "submitted",
        "withdrawn",
        "approved",
        "rejected",
        "under_review",
        "needs_info",
        "waitlisted",
      ],
      event_status: ["draft", "published", "archived"],
      invite_status: [
        "created",
        "sent",
        "failed",
        "accepted",
        "revoked",
        "expired",
        "replaced",
      ],
      membership_request_status: ["pending", "approved", "rejected"],
      order_status: [
        "awaiting_payment",
        "paid",
        "failed",
        "cancelled",
        "expired",
        "needs_review",
        "refunded",
      ],
      participation_status: ["active", "revoked", "refunded"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      reservation_status: ["active", "converted", "expired", "cancelled"],
      staff_role: [
        "owner",
        "admin",
        "editor",
        "moderator",
        "scanner",
        "shift_lead",
        "finance",
      ],
    },
  },
} as const
