"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="page">
      <div className="setup-card">
        <h1>Não foi possível carregar seus dados</h1>
        <p>
          Verifique sua conexão e se as migrations foram aplicadas. Nenhuma
          informação foi alterada.
        </p>
        <button className="button" onClick={reset}>
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
