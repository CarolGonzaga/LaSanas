import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
export const money = (value: number | string | null) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0),
  );
export const date = (value: string | null) =>
  value
    ? format(new Date(`${value}T12:00:00`), "dd/MM/yyyy", { locale: ptBR })
    : "—";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
