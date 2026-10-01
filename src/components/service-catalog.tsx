"use client";
import { useState } from "react";
import Link from "next/link";
import type { Dataset } from "@/lib/workspace";
import type { Row } from "@/lib/modules";
import { money } from "@/lib/format";
import { monthlyPlanPrice } from "@/lib/monthly-plan";

export function ServiceCatalog({
  data,
  edit,
  prefix,
}: {
  data: Dataset;
  edit: (table: string, row?: Partial<Row>) => void;
  prefix: string;
}) {
  const [table, setTable] = useState("service_types");
  const [query, setQuery] = useState("");
  const rows = (data[table] ?? []).filter(
    (row) =>
      !row.archived_at &&
      String(row.name).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Serviços</h1>
          <p>Cadastre e altere serviços avulsos e planos mensais.</p>
        </div>
        <button className="button" onClick={() => edit(table)}>
          Adicionar {table === "service_types" ? "serviço" : "plano"}
        </button>
      </div>
      <Link className="inline-link" href={`${prefix}/servicos-contratados`}>
        Ver execuções contratadas
      </Link>
      <div className="tabs">
        {[
          ["service_types", "Serviços avulsos"],
          ["service_packages", "Planos mensais"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={table === value ? "selected" : ""}
            onClick={() => setTable(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        aria-label="Buscar serviços"
        placeholder="Buscar serviços"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="record-list">
        {rows.map((row) => (
          <article className="production-item" key={row.id}>
            <div>
              <Link
                href={`${prefix}/${table === "service_types" ? "servicos" : "pacotes"}/${row.id}`}
              >
                <strong>{String(row.name)}</strong>
              </Link>
              <p>{String(row.description ?? "")}</p>
              <small>
                {table === "service_types"
                  ? money(Number(row.default_price))
                  : `${money(monthlyPlanPrice(row))}/mês · ${row.duration_months} meses · total ${money(Number(row.package_price))}`}{" "}
                · {row.active ? "Ativo" : "Inativo"}
              </small>
            </div>
            <button className="small-button" onClick={() => edit(table, row)}>
              Editar
            </button>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p className="quiet-empty">Nenhum serviço encontrado.</p>
      )}
    </>
  );
}
