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
      activities: {
        Row: {
          archived: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      activity_permissions: {
        Row: {
          activity_id: string
          can_admin: boolean
          can_read: boolean
          can_write: boolean
          created_at: string
          user_id: string
        }
        Insert: {
          activity_id: string
          can_admin?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          can_admin?: boolean
          can_read?: boolean
          can_write?: boolean
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_permissions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      attributes: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          is_status: boolean
          key: string
          label: string
          lookup_column: string | null
          lookup_source_attr: string | null
          lookup_tool_id: string | null
          options: Json | null
          position: number
          required: boolean
          type: Database["public"]["Enums"]["attribute_type"]
          validation: Json | null
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          is_status?: boolean
          key: string
          label: string
          lookup_column?: string | null
          lookup_source_attr?: string | null
          lookup_tool_id?: string | null
          options?: Json | null
          position?: number
          required?: boolean
          type: Database["public"]["Enums"]["attribute_type"]
          validation?: Json | null
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          is_status?: boolean
          key?: string
          label?: string
          lookup_column?: string | null
          lookup_source_attr?: string | null
          lookup_tool_id?: string | null
          options?: Json | null
          position?: number
          required?: boolean
          type?: Database["public"]["Enums"]["attribute_type"]
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "attributes_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attributes_lookup_tool_id_fkey"
            columns: ["lookup_tool_id"]
            isOneToOne: false
            referencedRelation: "lookup_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          activity_id: string | null
          changed_by: string | null
          changes: Json | null
          id: number
          occurred_at: string
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          activity_id?: string | null
          changed_by?: string | null
          changes?: Json | null
          id?: number
          occurred_at?: string
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          activity_id?: string | null
          changed_by?: string | null
          changes?: Json | null
          id?: number
          occurred_at?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      instances: {
        Row: {
          activity_id: string
          created_at: string
          created_by: string | null
          data: Json
          id: string
          status: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          activity_id: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          activity_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          status?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "instances_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_rows: {
        Row: {
          created_at: string
          data: Json
          id: string
          key_value: string
          tool_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          key_value: string
          tool_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          key_value?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lookup_rows_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "lookup_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      lookup_tools: {
        Row: {
          activity_id: string
          columns: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key_column: string
          name: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          columns?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key_column: string
          name: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          columns?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key_column?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lookup_tools_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
      can_admin_activity: {
        Args: { _aid: string; _uid: string }
        Returns: boolean
      }
      can_read_activity: {
        Args: { _aid: string; _uid: string }
        Returns: boolean
      }
      can_write_activity: {
        Args: { _aid: string; _uid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      instance_assigned_to_user: {
        Args: { _activity_id: string; _data: Json; _uid: string }
        Returns: boolean
      }
      norm_actor_text: { Args: { _value: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "superviseur" | "operateur"
      attribute_type: "text" | "number" | "date" | "enum" | "boolean"
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
      app_role: ["admin", "superviseur", "operateur"],
      attribute_type: ["text", "number", "date", "enum", "boolean"],
    },
  },
} as const
