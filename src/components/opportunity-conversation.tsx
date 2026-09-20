"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createOpportunityMessage, removeRecord, updateOpportunityMessage } from "@/actions/business";
import { date } from "@/lib/format";
import { labelOf, type Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { Dialog, DialogContent } from "./ui/dialog";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Button } from "./ui/button";

const saoPauloTimeZone = "America/Sao_Paulo";
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: saoPauloTimeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
const toSaoPauloInput = (value: Date | string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: saoPauloTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(" ", "T");

export function OpportunityConversation({ opportunity, data, readOnly = false }: { opportunity: Row; data: Dataset; readOnly?: boolean }) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("incoming");
  const [contactedAt, setContactedAt] = useState(() => toSaoPauloInput(new Date()));
  const [editing, setEditing] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, start] = useTransition();
  const messages = (data.communication_logs ?? [])
    .filter((message) => message.opportunity_id === opportunity.id && !message.archived_at)
    .sort((a, b) => String(a.contacted_at).localeCompare(String(b.contacted_at)) || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  function openComposer() { setText(""); setDirection("incoming"); setContactedAt(toSaoPauloInput(new Date())); setComposerOpen(true); }
  function openEditor(message: Row) { setText(String(message.summary)); setDirection(message.direction === "outgoing" ? "outgoing" : "incoming"); setContactedAt(toSaoPauloInput(String(message.contacted_at))); setEditing(message); setComposerOpen(true); }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return toast.info("Entre com sua conta para registrar mensagens.");
    start(async () => {
      const result = editing
        ? await updateOpportunityMessage({ messageId: editing.id, opportunityId: opportunity.id, text, direction, contactedAt })
        : await createOpportunityMessage({ opportunityId: opportunity.id, parentMessageId: null, text, direction, contactedAt });
      if (result.ok) { toast.success(result.message); setComposerOpen(false); setEditing(null); router.refresh(); } else toast.error(result.message);
    });
  }
  return <article className="opportunity-conversation-card">
    <header className="opportunity-conversation-header">
      <div><strong>{labelOf(opportunity, "opportunities")}</strong><small>Criada em {date(String(opportunity.created_at).slice(0, 10))}</small></div>
      <button className="small-button" onClick={openComposer}><MessageCircle size={14} /> Nova mensagem</button>
    </header>
    <div className="chat-history" aria-label="Histórico de mensagens">
      {messages.length ? messages.map((message) => <div key={message.id} className={"chat-message " + (message.direction === "outgoing" ? "outgoing" : "incoming")}>
        <small>{message.direction === "outgoing" ? "Equipe" : "Cliente"} · {dateTime(String(message.contacted_at))}</small>
        <p>{String(message.summary)}</p>
        <div className="chat-actions"><button className="chat-action" aria-label="Editar mensagem" onClick={() => openEditor(message)}><Pencil size={13} /></button><button className="chat-action" aria-label="Excluir mensagem" onClick={() => setRemoving(message)}><Trash2 size={13} /></button></div>
      </div>) : <p className="quiet-empty">Nenhuma mensagem registrada.</p>}
    </div>
    <Dialog open={composerOpen} onOpenChange={(open) => { setComposerOpen(open); if (!open) setEditing(null); }}>
      <DialogContent title={editing ? "Editar mensagem" : "Nova mensagem"} description="Registre uma mensagem do cliente ou uma mensagem enviada pela equipe.">
        <form className="record-form" onSubmit={submit}>
          <label>Quem enviou?
            <select value={direction} onChange={(event) => setDirection(event.target.value as "incoming" | "outgoing")}><option value="incoming">Cliente</option><option value="outgoing">Equipe</option></select>
          </label>
          <label>Data e horário de envio (São Paulo)
            <input type="datetime-local" value={contactedAt} onChange={(event) => setContactedAt(event.target.value)} required />
          </label>
          <label className="full">Mensagem<textarea rows={7} value={text} onChange={(event) => setText(event.target.value)} required autoFocus /></label>
          <div className="dialog-actions full"><Button type="button" variant="secondary" onClick={() => setComposerOpen(false)}>Cancelar</Button><Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)} title="Excluir mensagem?" description="Esta mensagem será removida do histórico." busy={busy} onConfirm={() => {
      if (!removing) return;
      start(async () => { const result = await removeRecord("communication_logs", removing.id); if (result.ok) { toast.success(result.message); setRemoving(null); router.refresh(); } else toast.error(result.message); });
    }} />
  </article>;
}
