"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createOpportunityMessage, removeRecord } from "@/actions/business";
import { date } from "@/lib/format";
import { labelOf, type Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { Dialog, DialogContent } from "./ui/dialog";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Button } from "./ui/button";

const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const localDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

export function OpportunityConversation({ opportunity, data, readOnly = false }: { opportunity: Row; data: Dataset; readOnly?: boolean }) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<"incoming" | "outgoing">("incoming");
  const [contactedAt, setContactedAt] = useState(localDateTime);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, start] = useTransition();
  const messages = (data.communication_logs ?? [])
    .filter((message) => message.opportunity_id === opportunity.id && !message.archived_at)
    .sort((a, b) => String(a.contacted_at).localeCompare(String(b.contacted_at)) || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  function openComposer() { setText(""); setDirection("incoming"); setContactedAt(localDateTime()); setComposerOpen(true); }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return toast.info("Entre com sua conta para registrar mensagens.");
    start(async () => {
      const result = await createOpportunityMessage({ opportunityId: opportunity.id, parentMessageId: null, text, direction, contactedAt });
      if (result.ok) { toast.success(result.message); setComposerOpen(false); router.refresh(); } else toast.error(result.message);
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
        <button className="chat-delete" aria-label="Excluir mensagem" onClick={() => setRemoving(message)}><Trash2 size={13} /></button>
      </div>) : <p className="quiet-empty">Nenhuma mensagem registrada.</p>}
    </div>
    <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
      <DialogContent title="Nova mensagem" description="Registre uma mensagem do cliente ou uma mensagem enviada pela equipe.">
        <form className="record-form" onSubmit={submit}>
          <label>Quem enviou?
            <select value={direction} onChange={(event) => setDirection(event.target.value as "incoming" | "outgoing")}><option value="incoming">Cliente</option><option value="outgoing">Equipe</option></select>
          </label>
          <label>Data e horário de envio
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
