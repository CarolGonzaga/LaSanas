"use client";
import * as Alert from "@radix-ui/react-alert-dialog";
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  busy = false,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Alert.Root open={open} onOpenChange={onOpenChange}>
      <Alert.Portal>
        <Alert.Overlay className="dialog-overlay" />
        <Alert.Content className="dialog-content compact">
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description className="muted">{description}</Alert.Description>
          {children}
          <div className="dialog-actions">
            <Alert.Cancel className="button secondary" disabled={busy}>
              Cancelar
            </Alert.Cancel>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "Aguarde…" : "Confirmar"}
            </button>
          </div>
        </Alert.Content>
      </Alert.Portal>
    </Alert.Root>
  );
}
