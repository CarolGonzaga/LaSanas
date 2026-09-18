"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
export default function Login() {
  const router = useRouter();
  const [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  return (
    <main className="login">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <section className="login-story">
        <Link className="brand" href="/login">
          <Image
            className="brand-logo"
            src="/lasanas-logo.png"
            alt="LaSanas"
            width={48}
            height={48}
            unoptimized
            priority
          />
          <span>LaSanas</span>
        </Link>
        <div>
          <h1>Gestão de publicidade literária</h1>
          <p>Campanhas, agenda e financeiro.</p>
        </div>
      </section>
      <section className="login-form-area">
        <form
          className="login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError("");
            const fd = new FormData(e.currentTarget);
            try {
              const { error } = await createClient().auth.signInWithPassword({
                email: String(fd.get("email")),
                password: String(fd.get("password")),
              });
              if (error) {
                setError(
                  "Não foi possível entrar. Confira seu e-mail e senha.",
                );
                return;
              }
              router.replace("/dashboard");
              router.refresh();
            } catch {
              setError("Falha de conexão. Tente novamente.");
            } finally {
              setLoading(false);
            }
          }}
        >
          <h2>Entrar</h2>
          <p>Entre com sua conta para continuar.</p>
          <label htmlFor="email">
            E-mail
            <input
              id="email"
              name="email"
              type="email"
              placeholder="voce@exemplo.com"
              required
              autoComplete="email"
            />
          </label>
          <label htmlFor="password">
            Senha
            <div className="password">
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                placeholder="Sua senha"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button className="button" disabled={loading}>
            {loading ? "Entrando…" : "Entrar no workspace"}
            <ArrowRight size={17} />
          </button>
          <small>Acesso exclusivo para a equipe.</small>
          {process.env.NODE_ENV === "development" && (
            <Link className="preview-link" href="/preview">
              Explorar a prévia local da interface →
            </Link>
          )}
        </form>
      </section>
    </main>
  );
}
