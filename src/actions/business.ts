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
  assignedTo: z.uuid().nullable(),
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
      p_assigned_to: values.assignedTo,
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
export async function createOpportunityMessage(input: unknown): Promise<Result> {
  try {
    const { db, workspace, user } = await requireContext();
    const values = z.object({
      opportunityId: z.uuid(),
      parentMessageId: z.uuid().nullable(),
      text: z.string().trim().min(1, "Digite a mensagem.").max(20000),
      direction: z.enum(["incoming", "outgoing"]),
      contactedAt: z.string().datetime({ local: true, message: "Informe a data e o horário da mensagem." }),
    }).parse(input);
    const { data: opportunity, error: opportunityError } = await db
      .from("opportunities")
      .select("id,author_id,publisher_id,publisher_contact_id,source_channel")
      .eq("id", values.opportunityId)
      .eq("workspace_id", workspace.id)
      .single();
    checked(opportunityError);
    if (!opportunity) throw new Error("Oportunidade não encontrada.");
    if (values.parentMessageId) {
      const { data: parent, error: parentError } = await db
        .from("communication_logs")
        .select("id")
        .eq("id", values.parentMessageId)
        .eq("workspace_id", workspace.id)
        .eq("opportunity_id", values.opportunityId)
        .single();
      checked(parentError);
      if (!parent) throw new Error("A mensagem original não pertence a esta oportunidade.");
    }
    const { data, error } = await db.from("communication_logs").insert({
      workspace_id: workspace.id,
      opportunity_id: opportunity.id,
      author_id: opportunity.author_id,
      publisher_id: opportunity.publisher_id,
      publisher_contact_id: opportunity.publisher_contact_id,
      channel: opportunity.source_channel,
      direction: values.direction,
      responsible_user_id: user.id,
       contacted_at: new Date(values.contactedAt).toISOString(),
      summary: values.text,
      parent_message_id: values.parentMessageId,
    }).select("id").single();
    checked(error);
    refresh();
    return { ok: true, id: data?.id, message: "Mensagem registrada." };
  } catch (error) { return failure(error); }
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
    const publisherContact =
      table === "publishers" && !id
        ? z
            .object({
              contact_name: z.string().trim().max(1000).nullable(),
              contact_role_or_department: z.string().trim().max(1000).nullable(),
              contact_email: z.preprocess((value) => value || null, z.email("E-mail do contato inválido.").nullable()),
              contact_whatsapp: z.string().trim().max(1000).nullable(),
              contact_instagram: z.string().trim().max(1000).nullable(),
              contact_x_twitter: z.string().trim().max(1000).nullable(),
              contact_preferred_channel: z.enum(["email", "whatsapp", "instagram", "x_twitter", "other"]).nullable(),
            })
            .parse({
              contact_name: mediaKitInput.contact_name || null,
              contact_role_or_department: mediaKitInput.contact_role_or_department || null,
              contact_email: mediaKitInput.contact_email || null,
              contact_whatsapp: mediaKitInput.contact_whatsapp || null,
              contact_instagram: mediaKitInput.contact_instagram || null,
              contact_x_twitter: mediaKitInput.contact_x_twitter || null,
              contact_preferred_channel: mediaKitInput.contact_preferred_channel || null,
            })
        : null;
    if (
      publisherContact &&
      !publisherContact.contact_name &&
      Object.values(publisherContact).some(Boolean)
    )
      throw new Error("Informe o nome do contato para salvar seus dados.");
    const applyPendingAssignee =
      table === "campaign_services" && mediaKitInput.apply_pending_assignee === true;
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
    const query = id
      ? db
          .from(table)
          .update(values)
          .eq("id", id)
          .eq("workspace_id", workspace.id)
      : db.from(table).insert({ ...values, workspace_id: workspace.id });
    const { data, error } = await query.select("id").single();
    checked(error);
    if (!data?.id) throw new Error("Não foi possível salvar o registro.");
    if (publisherContact?.contact_name) {
      const { error: contactError } = await db.from("publisher_contacts").insert({
        workspace_id: workspace.id,
        publisher_id: data.id,
        name: publisherContact.contact_name,
        role_or_department: publisherContact.contact_role_or_department,
        email: publisherContact.contact_email,
        whatsapp: publisherContact.contact_whatsapp,
        instagram: publisherContact.contact_instagram,
        x_twitter: publisherContact.contact_x_twitter,
        preferred_contact_channel: publisherContact.contact_preferred_channel,
      });
      checked(contactError);
    }
    if (table === "campaign_services" && id && applyPendingAssignee) {
      const { error: assignmentError } = await db
        .from("service_occurrences")
        .update({ assigned_to: values.assigned_to ?? null })
        .eq("campaign_service_id", id)
        .eq("workspace_id", workspace.id)
        .not("status", "in", '(completed,cancelled)');
      checked(assignmentError);
    }
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
      try {
        const { db } = await requireContext();
        await db.storage.from("business-assets").remove([uploaded]);
      } catch {
        // A falha principal deve chegar ao formulário, mesmo que a limpeza seja
        // temporariamente indisponível.
      }
    }
    return failure(e);
  }
}
export async function saveWorkspaceSettings(input: unknown): Promise<Result> {
  try {
    const { db, workspace } = await requireContext();
    if (workspace.role !== "admin") throw new Error("Apenas administradoras podem alterar a equipe.");
    const values = z.object({
      defaultProductionUserId: z.uuid().nullable(),
      memberId: z.uuid().optional(),
      homeView: z.enum(["management", "production"]).optional(),
    }).parse(input);
    if (values.defaultProductionUserId) {
      const { data, error } = await db.from("workspace_members").select("user_id").eq("workspace_id", workspace.id).eq("user_id", values.defaultProductionUserId).eq("active", true).maybeSingle();
      checked(error);
      if (!data) throw new Error("A responsável padrão deve ser uma integrante ativa.");
    }
    const { error: workspaceError } = await db.from("workspaces").update({ default_production_user_id: values.defaultProductionUserId }).eq("id", workspace.id);
    checked(workspaceError);
    if (values.memberId && values.homeView) {
      const { error } = await db.from("workspace_members").update({ home_view: values.homeView }).eq("workspace_id", workspace.id).eq("user_id", values.memberId);
      checked(error);
    }
    refresh();
    return { ok: true, message: "Configurações da equipe atualizadas." };
  } catch (error) { return failure(error); }
}
export async function saveMyProfile(
  input: unknown,
  upload?: FormData,
): Promise<Result> {
  let uploaded: string | null = null;
  try {
    const { db, workspace, user } = await requireContext();
    const { username } = z
      .object({
        username: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9._-]{2,40}$/, "Use 2 a 40 caracteres: letras, números, ponto, hífen ou sublinhado."),
      })
      .parse(input);
    const file = upload?.get("avatar");
    const values: Record<string, string> = { username };
    let previousAvatar: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Envie uma imagem JPG, PNG ou WebP de até 3 MB.");
      const { data: current, error: currentError } = await db
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .single();
      checked(currentError);
      previousAvatar = String(current?.avatar_url ?? "") || null;
      uploaded = `${workspace.id}/avatars/${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await db.storage
        .from("business-assets")
        .upload(uploaded, file, { contentType: file.type, upsert: false });
      checked(uploadError);
      values.avatar_url = uploaded;
    }
    const { error } = await db.from("profiles").update(values).eq("id", user.id);
    checked(error);
    if (previousAvatar && !/^https?:\/\//i.test(previousAvatar))
      await db.storage.from("business-assets").remove([previousAvatar]);
    refresh();
    return { ok: true, message: "Perfil atualizado." };
  } catch (error) {
    if (uploaded) {
      try {
        const { db } = await requireContext();
        await db.storage.from("business-assets").remove([uploaded]);
      } catch {}
    }
    return failure(error);
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
    } else if (action === "update-work-status") {
      const table = z.enum(["tasks", "service_occurrences"]).parse(args.source);
      const status = z.enum(["pending", "in_progress", "waiting", "completed", "cancelled"]).parse(args.status);
      const { error } = await db.from(table).update({ status }).eq("id", id).eq("workspace_id", workspace.id);
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
