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
      events: {
        Row: {
          created_at: string
          id: string
          slug: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
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
      record_membership_invite: {
        Args: {
          _invite_error?: string
          _invited_user: string
          _request: string
        }
        Returns: undefined
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
      staff_role:
        | "owner"
        | "admin"
        | "editor"
        | "moderator"
        | "scanner"
        | "shift_lead"
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
      staff_role: [
        "owner",
        "admin",
        "editor",
        "moderator",
        "scanner",
        "shift_lead",
      ],
    },
  },
} as const
