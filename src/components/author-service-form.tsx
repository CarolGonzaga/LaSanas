"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAuthorService } from "@/actions/business";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { memberLabel, type Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";

export function AuthorServiceForm({
  author,
  data,
  open,
  onClose,
  readOnly = false,
}: {
  author: Row;
  data: Dataset;
  open: boolean;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [bookId, setBookId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [notes, setNotes] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState("to_confirm");
  const [scheduledDate, setScheduledDate] = useState("");
  const [assignedTo, setAssignedTo] = useState(
    String(data.workspace_settings?.[0]?.default_production_user_id ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const books = (data.books ?? []).filter(
    (book) => book.author_id === author.id && !book.archived_at,
  );
  const serviceTypes = (data.service_types ?? []).filter(
    (service) => service.active && !service.archived_at,
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) {
      toast.info("Entre com sua conta para salvar dados reais.");
      return;
    }
    setSaving(true);
    const result = await createAuthorService({
      authorId: author.id,
      bookId: bookId || null,
      serviceTypeId,
      quantity,
      unitPrice,
      notes,
      scheduleStatus,
      scheduledDate: scheduleStatus === "scheduled" ? scheduledDate : null,
      assignedTo: assignedTo || null,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    router.refresh();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        title="Adicionar serviço"
        description="O serviço será vinculado a esta autora e ficará pendente até a conclusão."
      >
        <form className="record-form" onSubmit={submit}>
          <label>
            Autora
            <input value={String(author.name)} readOnly />
          </label>
          <label>
            Livro relacionado
            <select value={bookId} onChange={(event) => setBookId(event.target.value)}>
              <option value="">Nenhum livro selecionado</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {String(book.title)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de serviço *
            <select
              value={serviceTypeId}
              onChange={(event) => setServiceTypeId(event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {serviceTypes.map((service) => (
                <option key={service.id} value={service.id}>
                  {String(service.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsável pela execução
            <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
              <option value="">Sem responsável</option>
              {(data.profiles ?? []).filter((profile) => profile.active).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {memberLabel(profile)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade *
            <input
              type="number"
              min="1"
              max="600"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              required
            />
          </label>
          <label>
            Valor unitário *
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              required
            />
          </label>
          <label>
            Situação da data *
            <select
              value={scheduleStatus}
              onChange={(event) => setScheduleStatus(event.target.value)}
            >
              <option value="to_confirm">A confirmar</option>
              <option value="scheduled">Data definida</option>
            </select>
          </label>
          {scheduleStatus === "scheduled" && (
            <label>
              Data *
              <input
                type="date"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
                required
              />
            </label>
          )}
          <label className="full">
            Observações
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <div className="dialog-actions full">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
