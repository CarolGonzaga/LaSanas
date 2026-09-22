export function monthlyPlanPrice(plan: Record<string, unknown>) {
  const months = Math.max(1, Number(plan.duration_months || 1));
  return Math.round((Number(plan.package_price || 0) / months) * 100) / 100;
}
