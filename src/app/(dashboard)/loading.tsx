export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-label="Carregando">
      <div className="skeleton title-skeleton" />
      <div className="dashboard-stats">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    </div>
  );
}
