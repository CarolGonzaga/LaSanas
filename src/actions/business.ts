"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireContext } from "@/lib/workspace";
import { parseRecord } from "@/lib/validation";
import { moduleByTable } from "@/lib/modules";

export type Result = {
  ok: boolean;
  message: string;
  id?: string;
  url?: string;
  fields?: Record<string, string>;
};
function failure(error: unknown): Result {
  if (error instanceof z.ZodError)
    return {
      ok: false,
      message: "Revise os campos do formulário.",
      fields: Object.fromEntries(
        error.issues.map((i) => [String(i.path[0]), i.message]),
      ),
    };
  return {
    ok: false,
    message:
      error instanceof Error
        ? error.message
        : "Não foi possível concluir. Tente novamente.",
  };
}
function checked(error: { message: string; code?: string } | null) {
  if (error)
    throw new Error(
      error.code === "23503"
        ? "Este registro possui vínculos ou um relacionamento inválido. Revise os dados antes de continuar."
        : error.code === "23505"
          ? "Já existe um registro com essa combinação de dados."
          : error.code === "42501"
            ? "Você não possui acesso a este workspace."
            : error.message,
    );
}
function refresh() {
  revalidatePath("/", "layout");
}
const authorServiceInput = z.object({
  authorId: z.uuid(),
  bookId: z.uuid().nullable(),
  serviceTypeId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(600),
  unitPrice: z
    .string()
    .regex(
      /^\d{1,10}(\.\d{1,2})?$/,
      "Informe um valor positivo com até duas casas decimais.",
    ),
  notes: z.string().trim().max(20000).nullable(),
  scheduleStatus: z.enum(["to_confirm", "scheduled"]),
  scheduledDate: z.iso.date().nullable(),
});
export async function createAuthorService(input: unknown): Promise<Result> {
  try {
    const { db, workspace } = await requireContext();
    const values = authorServiceInput.parse(input);
    if (values.scheduleStatus === "scheduled" && !values.scheduledDate)
      throw new Error("Informe a data ou marque o serviço como a confirmar.");
    const { data, error } = await db.rpc("create_author_service", {
      p_workspace: workspace.id,
      p_author: values.authorId,
      p_book: values.bookId,
      p_service_type: values.serviceTypeId,
      p_quantity: values.quantity,
      p_unit_price: values.unitPrice,
      p_notes: values.notes || null,
      p_schedule_status: values.scheduleStatus,
      p_scheduled_date: values.scheduledDate,
    });
    checked(error);
    refresh();
    return {
      ok: true,
      id: String(data),
      message: "Serviço adicionado à autora.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function saveRecord(
  table: string,
  id: string | null,
  input: unknown,
  upload?: FormData,
): Promise<Result> {
  let uploaded: string | null = null;
  try {
    const { db, workspace } = await requireContext();
    if (id) z.uuid().parse(id);
    const mediaKitInput = input as Record<string, unknown>;
    const registerMediaKitSend =
      table === "media_kits" && mediaKitInput.register_sent === true;
    const paymentPlanAction =
      table === "campaigns" && id
        ? z
            .enum(["keep", "rebuild_pending", "rebuild_all"])
            .parse(mediaKitInput.payment_plan_action ?? "keep")
        : "keep";
    const opportunityMediaKitSent =
      table === "opportunities"
        ? z.enum(["yes", "no"]).parse(mediaKitInput.media_kit_sent)
        : null;
    const sentOpportunityId = registerMediaKitSend
      ? z.uuid().parse(mediaKitInput.sent_opportunity_id)
      : null;
    const sentChannel = registerMediaKitSend
      ? z
          .enum(["email", "whatsapp", "instagram", "x_twitter", "other"])
          .parse(mediaKitInput.sent_channel)
      : null;
    const values = parseRecord(table, input);
    let previousPaymentPlan: string | null = null;
    if (table === "campaigns" && id) {
      const { data, error } = await db
        .from("campaigns")
        .select("payment_plan")
        .eq("id", id)
        .eq("workspace_id", workspace.id)
        .single();
      checked(error);
      previousPaymentPlan = String(data?.payment_plan ?? "");
    }
    if (table === "opportunities") {
      if (opportunityMediaKitSent === "no") {
        values.media_kit_version_id = null;
        values.media_kit_sent_at = null;
      } else {
        if (!values.media_kit_version_id)
          throw new Error("Selecione o media kit enviado.");
        if (!values.media_kit_sent_at)
          throw new Error("Informe a data de envio do media kit.");
      }
    }
    if (
      table === "service_occurrences" &&
      values.schedule_status === "scheduled" &&
      !values.scheduled_date
    )
      throw new Error("Informe a data ou marque o serviço como a confirmar.");
    if (
      table === "service_occurrences" &&
      values.schedule_status === "to_confirm"
    )
      values.scheduled_date = null;
    if (table === "campaigns" && !id && upload?.get("book_club_slot_id"))
      values.book_club_slot_id = z
        .uuid()
        .parse(upload.get("book_club_slot_id"));
    const field = table === "books" ? "cover_storage_path" : "storage_path";
    const file = upload?.get("file");
    let previous: string | null = null;
    let previousBucket = "business-assets";
    if (file instanceof File && file.size > 0) {
      if (!["client_assets", "books", "media_kits"].includes(table))
        throw new Error("Upload não permitido.");
      const allowed =
        table === "media_kits"
          ? ["application/pdf"]
          : table === "books"
            ? ["image/jpeg", "image/png", "image/webp"]
            : ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (file.size > 3 * 1024 * 1024 || !allowed.includes(file.type))
        throw new Error(
          "Envie imagem JPG, PNG, WebP ou PDF de até 3 MB, conforme o tipo de material.",
        );
      if (
        table === "client_assets" &&
        ((values.asset_type === "image" && !file.type.startsWith("image/")) ||
          (values.asset_type === "document" && file.type !== "application/pdf"))
      )
        throw new Error("O arquivo não corresponde ao tipo do material.");
      const folder =
        table === "books"
          ? "books"
          : table === "media_kits"
            ? "media-kits"
            : "campaigns/" + z.uuid().parse(values.campaign_id);
      uploaded =
        workspace.id +
        "/" +
        folder +
        "/" +
        crypto.randomUUID() +
        "-" +
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { error } = await db.storage
        .from("business-assets")
        .upload(uploaded, file, { contentType: file.type, upsert: false });
      checked(error);
      if (id) {
        const { data } = await db
          .from(table)
          .select("*")
          .eq("id", id)
          .eq("workspace_id", workspace.id)
          .single();
        previous = String(data?.[field] ?? "") || null;
        previousBucket = String(data?.storage_bucket ?? "business-assets");
      }
      Object.assign(values, { [field]: uploaded });
      if (table === "client_assets") values.storage_bucket = "business-assets";
      if (table !== "books")
        Object.assign(values, {
          original_filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        });
    }
    if (!id && table === "media_kits") values.active = false;
    const query = id
      ? db
          .from(table)
          .update(values)
          .eq("id", id)
          .eq("workspace_id", workspace.id)
      : db.from(table).insert({ ...values, workspace_id: workspace.id });
    const { data, error } = await query.select("id").single();
    checked(error);
    if (
      table === "campaigns" &&
      id &&
      previousPaymentPlan !== values.payment_plan &&
      paymentPlanAction !== "keep"
    ) {
      const { error: paymentError } = await db.rpc(
        "rebuild_campaign_payments",
        {
          p_campaign: id,
          p_mode: paymentPlanAction,
        },
      );
      checked(paymentError);
    }
    if (registerMediaKitSend && sentOpportunityId && sentChannel) {
      const mediaKitId = z.uuid().parse(data?.id);
      const { error: sendError } = await db.rpc("mark_media_kit", {
        p_opportunity: sentOpportunityId,
        p_kit: mediaKitId,
        p_channel: sentChannel,
      });
      checked(sendError);
    }
    if (previous) {
      const { error: removeError } = await db.storage
        .from(previousBucket)
        .remove([previous]);
      if (removeError) {
        refresh();
        return {
          ok: true,
          id: data?.id,
          message:
            "Registro salvo. O arquivo antigo não pôde ser removido; tente novamente no Storage.",
        };
      }
    }
    refresh();
    return { ok: true, id: data?.id, message: "Registro salvo com sucesso." };
  } catch (e) {
    if (uploaded) {
      const { db } = await requireContext();
      await db.storage.from("business-assets").remove([uploaded]);
    }
    return failure(e);
  }
}
export async function removeRecord(table: string, id: string): Promise<Result> {
  try {
    if (!moduleByTable(table)) throw new Error("Tipo inválido.");
    z.uuid().parse(id);
    const { db, workspace } = await requireContext();
    if (table === "campaign_services") {
      const { error } = await db.rpc("delete_campaign_service", {
        p_service: id,
      });
      checked(error);
      refresh();
      return { ok: true, message: "Serviço e execuções associadas removidos." };
    }
    const { data, error: readError } = await db
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspace.id)
      .single();
    checked(readError);
    const path = data?.storage_path ?? data?.cover_storage_path;
    const { error } = await db
      .from(table)
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspace.id);
    checked(error);
    if (path) {
      const { error: storageError } = await db.storage
        .from(data?.storage_bucket ?? "business-assets")
        .remove([path]);
      if (storageError) {
        refresh();
        return {
          ok: true,
          message:
            "Registro excluído. O arquivo não pôde ser removido do Storage; solicite a limpeza ao administrador.",
        };
      }
    }
    refresh();
    return { ok: true, message: "Registro excluído." };
  } catch (e) {
    return failure(e);
  }
}
export async function businessAction(
  action: string,
  id: string,
  args: Record<string, string> = {},
): Promise<Result> {
  try {
    z.uuid().parse(id);
    const { db, workspace } = await requireContext();
    if (action === "resize") {
      const { error } = await db.rpc("resize_service", {
        p_id: id,
        p_quantity: z.coerce
          .number()
          .int()
          .min(1)
          .max(600)
          .parse(args.quantity),
      });
      checked(error);
    } else if (action === "delete-campaign") {
      const { error } = await db.rpc("delete_campaign", {
        p_campaign: id,
        p_return_opportunity: args.returnOpportunity === "true",
      });
      checked(error);
    } else if (action === "kit") {
      const { error } = await db.rpc("mark_media_kit", {
        p_opportunity: id,
        p_kit: z.uuid().parse(args.kit),
        p_channel: z
          .enum(["email", "whatsapp", "instagram", "x_twitter", "other"])
          .parse(args.channel),
      });
      checked(error);
    } else if (action === "activate-kit") {
      const { error } = await db.rpc("activate_kit", { p_id: id });
      checked(error);
    } else if (action === "override") {
      if (workspace.role !== "admin")
        throw new Error("Apenas administradoras podem registrar exceções.");
      const reason = z.string().trim().min(10).parse(args.reason);
      const { error } = await db
        .from("campaigns")
        .update({ payment_override_reason: reason })
        .eq("id", id)
        .eq("workspace_id", workspace.id);
      checked(error);
    } else if (action === "complete-task" || action === "complete-occurrence") {
      const table =
        action === "complete-task" ? "tasks" : "service_occurrences";
      const { error } = await db
        .from(table)
        .update({ status: args.undo === "true" ? "pending" : "completed" })
        .eq("id", id)
        .eq("workspace_id", workspace.id);
      checked(error);
    } else if (action === "archive") {
      if (
        ![
          "authors",
          "publishers",
          "books",
          "campaigns",
          "opportunities",
        ].includes(args.table)
      )
        throw new Error("Tipo inválido.");
      const { error } = await db
        .from(args.table)
        .update({
          archived_at: args.undo === "true" ? null : new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workspace_id", workspace.id);
      checked(error);
    } else if (action === "production") {
      const { error } = await db
        .from("campaigns")
        .update({ status: "active" })
        .eq("id", id)
        .eq("workspace_id", workspace.id);
      checked(error);
    } else if (action === "announcement") {
      const { error } = await db
        .from("collective_reading_slots")
        .update({
          announcement_published_at: new Date().toISOString(),
          announcement_channel: z
            .enum(["email", "whatsapp", "instagram", "x_twitter", "other"])
            .parse(args.channel),
        })
        .eq("id", id)
        .eq("workspace_id", workspace.id);
      checked(error);
    } else throw new Error("Ação inválida.");
    refresh();
    return { ok: true, message: "Atualização concluída." };
  } catch (e) {
    return failure(e);
  }
}
export async function assetUrl(table: string, id: string): Promise<Result> {
  try {
    if (!["client_assets", "books", "media_kits"].includes(table))
      throw new Error("Tipo inválido.");
    const { db, workspace } = await requireContext();
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("id", z.uuid().parse(id))
      .eq("workspace_id", workspace.id)
      .single();
    checked(error);
    const path = data?.storage_path ?? data?.cover_storage_path;
    if (path) {
      const { data: signed, error } = await db.storage
        .from(data?.storage_bucket ?? "business-assets")
        .createSignedUrl(path, 600);
      checked(error);
      return {
        ok: true,
        message: "Link temporário válido por 10 minutos.",
        url: signed?.signedUrl,
      };
    }
    const url = data?.external_url ?? data?.cover_external_url;
    if (!url || !/^https?:\/\//.test(url))
      throw new Error("Nenhum arquivo ou link disponível.");
    return { ok: true, message: "Link disponível.", url };
  } catch (e) {
    return failure(e);
  }
}
export async function selectWorkspace(id: string): Promise<Result> {
  try {
    const { db, user } = await requireContext();
    const { data, error } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", z.uuid().parse(id))
      .eq("user_id", user.id)
      .eq("active", true)
      .single();
    checked(error);
    if (!data) throw new Error("Sem acesso.");
    (await cookies()).set("workspace", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    refresh();
    return { ok: true, message: "Workspace alterado." };
  } catch (e) {
    return failure(e);
  }
}
