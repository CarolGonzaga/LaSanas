import type { Row } from "@/lib/modules";
export interface WorkspaceRecord extends Row {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
export interface Author extends WorkspaceRecord {
  name: string;
  pen_name: string | null;
  email: string | null;
  whatsapp: string | null;
}
export interface Publisher extends WorkspaceRecord {
  name: string;
  website: string | null;
  instagram: string | null;
}
export interface Book extends WorkspaceRecord {
  title: string;
  author_id: string;
  publisher_id: string | null;
  cover_ai_status: "unknown" | "confirmed_human" | "confirmed_ai" | "replaced";
}
export interface Opportunity extends WorkspaceRecord {
  name: string;
  responsible_user_id: string;
  source_channel: "email" | "whatsapp" | "instagram" | "x_twitter" | "other";
  status:
    | "new"
    | "contacted"
    | "media_kit_sent"
    | "waiting_book_data"
    | "proposal_requested"
    | "proposal_sent"
    | "negotiating"
    | "approved"
    | "lost"
    | "converted";
}
export interface Campaign extends WorkspaceRecord {
  name: string;
  total_value: number;
  payment_plan: "full_upfront" | "half_and_half";
  status:
    | "draft"
    | "awaiting_payment"
    | "active"
    | "paused"
    | "completed"
    | "cancelled";
}
export interface CampaignService extends WorkspaceRecord {
  campaign_id: string;
  service_type_id: string | null;
  custom_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}
export interface ServiceType extends WorkspaceRecord {
  name: string;
  default_price: number;
  active: boolean;
}
export interface ServiceOccurrence extends WorkspaceRecord {
  campaign_service_id: string;
  sequence_number: number;
  scheduled_date: string | null;
  status: "pending" | "completed" | "cancelled";
  completed_at: string | null;
}
export interface Payment extends WorkspaceRecord {
  campaign_id: string;
  amount: number;
  installment_number: number;
  due_date: string;
  paid_at: string | null;
  status: "pending" | "paid" | "cancelled";
}
export interface ClientAsset extends WorkspaceRecord {
  campaign_id: string;
  title: string;
  asset_type: "image" | "link" | "document";
  storage_path: string | null;
  external_url: string | null;
}
export interface Task extends WorkspaceRecord {
  title: string;
  assigned_to: string | null;
  due_date: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed";
}
