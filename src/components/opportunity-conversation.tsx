"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Reply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createOpportunityMessage, removeRecord } from "@/actions/business";
import { date } from "@/lib/format";
import type { Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
import { Dialog, DialogContent } from "./ui/dialog";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Button } from "./ui/button";

function MessageNode({ message, childrenByParent, onReply, onDelete }: {
  message: Row;
  childrenByParent: Map<string, Row[]>;
  onReply: (message: Row) => void;
  onDelete: (message: Row) => void;
}) {
  const replies = childrenByParent.get(message.id) ?? [];
  return <li className="conversation-node">
    <article className={"conversation-message " + (message.direction === "outgoing" ? "outgoing" : "incoming")}>
      <small>{message.direction === "outgoing" ? "Enviada" : "Recebida"} · {date(String(message.contacted_at).slice(0, 10))}</small>
      <p>{String(message.summary)}</p>
      <div className="conversation-actions">
        <button className="small-button" onClick={() => onReply(message)}><Reply size={14} /> Responder</button>
        <button className="icon-button delete-button" aria-label="Excluir mensagem" onClick={() => onDelete(message)}><Trash2 size={14} /></button>
      </div>
    </article>
    {replies.length > 0 && <ol className="conversation-children">{replies.map((reply) => <MessageNode key={reply.id} message={reply} childrenByParent={childrenByParent} onReply={onReply} onDelete={onDelete} />)}</ol>}
  </li>;
}

export function OpportunityConversation({ opportunity, data, readOnly = false }: { opportunity: Row; data: Dataset; readOnly?: boolean }) {
  const router = useRouter();
  const [composer, setComposer] = useState<Row | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, start] = useTransition();
  const messages = (data.communication_logs ?? [])
    .filter((message) => message.opportunity_id === opportunity.id && !message.archived_at)
    .sort((a, b) => String(a.contacted_at).localeCompare(String(b.contacted_at)));
  const childrenByParent = new Map<string, Row[]>();
  messages.forEach((message) => {
    if (!message.parent_message_id) return;
    childrenByParent.set(String(message.parent_message_id), [...(childrenByParent.get(String(message.parent_message_id)) ?? []), message]);
  });
  const roots = messages.filter((message) => !message.parent_message_id || !messages.some((candidate) => candidate.id === message.parent_message_id));
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return toast.info("Entre com sua conta para registrar mensagens.");
    start(async () => {
      const result = await createOpportunityMessage({ opportunityId: opportunity.id, parentMessageId: composer?.id ?? null, text, direction: composer ? "outgoing" : "incoming" });
      if (result.ok) { toast.success(result.message); setComposer(undefined); setText(""); router.refresh(); } else toast.error(result.message);
    });
  }
  return <section className="conversation-panel">
    <div className="section-heading"><div><h2>Mensagens</h2><p className="muted">Registre mensagens copiadas da conversa e responda em sequência.</p></div><button className="button small" onClick={() => setComposer(null)}><MessageCircle size={16} /> Nova mensagem</button></div>
    {roots.length ? <ol className="conversation-list">{roots.map((message) => <MessageNode key={message.id} message={message} childrenByParent={childrenByParent} onReply={setComposer} onDelete={setRemoving} />)}</ol> : <p className="quiet-empty">Nenhuma mensagem registrada nesta oportunidade.</p>}
    <Dialog open={composer !== undefined} onOpenChange={(open) => !open && setComposer(undefined)}>
      <DialogContent title={composer ? "Responder mensagem" : "Nova mensagem"} description={composer ? "A resposta será registrada como enviada." : "A mensagem será registrada como recebida."}>
        <form className="record-form" onSubmit={submit}><label className="full">Mensagem<textarea rows={7} value={text} onChange={(event) => setText(event.target.value)} required autoFocus /></label><div className="dialog-actions full"><Button type="button" variant="secondary" onClick={() => setComposer(undefined)}>Cancelar</Button><Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button></div></form>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)} title="Excluir mensagem?" description="As respostas serão preservadas e passarão a aparecer como mensagens principais." busy={busy} onConfirm={() => {
      if (!removing) return;
      start(async () => { const result = await removeRecord("communication_logs", removing.id); if (result.ok) { toast.success(result.message); setRemoving(null); router.refresh(); } else toast.error(result.message); });
    }} />
  </section>;
}
