"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Dialog, DialogContent } from "./ui/dialog";
import { options, type Row } from "@/lib/modules";
import type { Dataset } from "@/lib/workspace";
export function ActionDialog({
  operation,
  data,
  busy,
  close,
  run,
  copy,
}: {
  operation: { action: string; row: Row };
  data: Dataset;
  busy: boolean;
  close: () => void;
  run: (action: string, row: Row, args: Record<string, string>) => void;
  copy: (v: string) => void;
}) {
  const { action, row } = operation;
  const [variables, setVariables] = useState<Record<string, string>>({});
  const templateHref = usePathname().startsWith("/preview")
    ? "/preview/respostas"
    : "/respostas";
  const template =
    action === "announcement"
      ? data.response_templates?.find(
          (t) => t.category === "Leitura Coletiva" && t.active,
        )?.content
      : action === "kit"
        ? data.response_templates?.find(
            (t) =>
              t.active &&
              t.category === "Primeiro Contato" &&
              t.title === "Autora conhecida + media kit",
          )?.content
        : row.content;
  const source = String(
    template ??
      (action === "kit"
        ? "Olá, {autora}! Que bom que você entrou em contato. Vi o lançamento de {livro} e será um prazer divulgar seu livro. Estou enviando o media kit para você conhecer melhor o nosso trabalho."
        : "Vaga aberta para a leitura coletiva de {mes} de {ano}! Autoras independentes, entrem em contato para conhecer a proposta."),
  );
  const opportunityAuthor = data.authors?.find((author) => author.id === row.author_id);
  const opportunityBook = data.books?.find((book) => book.id === row.book_id);
  const text = source.replace(
    /\{(nome|autora|livro|editora|valor|mes|ano)\}/g,
    (_, key) =>
      variables[key] ??
      (key === "mes"
        ? (options.month[String(row.month)] ?? "{mes}")
        : key === "ano"
          ? String(row.year ?? "")
          : key === "autora" || key === "nome"
            ? String(opportunityAuthor?.name ?? "{" + key + "}")
            : key === "livro"
              ? String(opportunityBook?.title ?? "{livro}")
              : "{" + key + "}"),
  );
  const title =
    action === "resize"
      ? "Alterar quantidade"
      : action === "kit"
        ? "Registrar envio do media kit"
        : action === "override"
          ? "Exceção de pagamento"
          : action === "announcement"
            ? "Divulgar vaga"
            : "Preparar resposta";
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent title={title}>
        <form
          className="action-form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(
              action,
              row,
              Object.fromEntries(fd.entries()) as Record<string, string>,
            );
          }}
        >
          {action === "resize" && (
            <>
              <p>
                A redução remove apenas execuções pendentes. Execuções
                concluídas serão preservadas e bloquearão a redução.
              </p>
              <label>
                Nova quantidade
                <input
                  type="number"
                  name="quantity"
                  min="1"
                  max="600"
                  defaultValue={Number(row.quantity)}
                  required
                />
              </label>
            </>
          )}
          {action === "kit" && (
            <label>
              Versão enviada
              <select name="kit" required>
                <option value="">Selecione</option>
                {data.media_kits?.map((k) => (
                  <option value={k.id} key={k.id}>
                    {String(k.name)} — {String(k.year ?? k.version)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(action === "kit" || action === "announcement") && (
            <label>
              Canal
              <select
                name="channel"
                defaultValue={String(row.source_channel ?? "instagram")}
              >
                {Object.entries(options.channel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          )}
          {action === "override" && (
            <>
              <p>
                A exceção será registrada com sua conta, data e justificativa. A
                regra de capa sem IA continua obrigatória.
              </p>
              <label>
                Justificativa
                <textarea name="reason" required minLength={10} />
              </label>
              <label className="checkbox-label">
                <input type="checkbox" required /> Confirmo a liberação sem o
                pagamento inicial.
              </label>
            </>
          )}
          {["template", "announcement", "kit"].includes(action) && (
            <>
              {Array.from(
                new Set(
                  Array.from(
                    source.matchAll(
                      /\{(nome|autora|livro|editora|valor|mes|ano)\}/g,
                    ),
                    (m) => m[1],
                  ),
                ),
              ).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    value={
                      variables[k] ??
                      (k === "autora" || k === "nome"
                        ? String(opportunityAuthor?.name ?? "")
                        : k === "livro"
                          ? String(opportunityBook?.title ?? "")
                          : k === "mes"
                        ? (options.month[String(row.month)] ?? "")
                        : k === "ano"
                          ? String(row.year ?? "")
                          : "")
                    }
                    onChange={(e) =>
                      setVariables({ ...variables, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                Texto pronto
                <textarea rows={6} value={text} readOnly />
              </label>
              <button
                type="button"
                className="button secondary"
                onClick={() => copy(text)}
              >
                <Copy size={15} /> Copiar texto
              </button>
              <Link href={templateHref} className="text-link">
                Abrir templates
              </Link>
            </>
          )}
          {action !== "template" && (
            <button className="button" disabled={busy}>
              {busy
                ? "Salvando…"
                : action === "announcement"
                  ? "Marcar anúncio como publicado"
                  : action === "kit"
                    ? "Registrar envio do media kit"
                    : "Confirmar"}
            </button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
