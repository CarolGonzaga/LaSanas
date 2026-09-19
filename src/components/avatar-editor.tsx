"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";

const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

export function AvatarEditor({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (file: File) => void;
}) {
  const [source, setSource] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!source) return;
    const url = URL.createObjectURL(source);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  const choose = (file: File | undefined) => {
    if (!file) return;
    if (!allowedTypes.includes(file.type) || file.size > 3 * 1024 * 1024) return;
    setSource(file);
    setZoom(1);
  };

  const save = async () => {
    if (!source) return;
    const image = new Image();
    image.src = URL.createObjectURL(source);
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Imagem inválida.")); });
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return;
    const cropSide = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const sourceX = (image.naturalWidth - cropSide) / 2;
    const sourceY = (image.naturalHeight - cropSide) / 2;
    context.drawImage(image, sourceX, sourceY, cropSide, cropSide, 0, 0, 512, 512);
    URL.revokeObjectURL(image.src);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    onSave(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Ajustar foto do perfil" description="Escolha uma imagem e aproxime o enquadramento antes de salvar.">
        <div className="avatar-editor">
          <label className="small-button avatar-file-button">Escolher imagem
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choose(event.target.files?.[0])} />
          </label>
          {preview ? (
            <>
              <div className="avatar-crop-preview">
                <img src={preview} alt="Prévia da foto de perfil" style={{ transform: `scale(${zoom})` }} />
              </div>
              <label className="avatar-zoom">Zoom
                <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              </label>
              <button className="button" type="button" onClick={save}>Usar esta foto</button>
            </>
          ) : <p className="muted">JPG, PNG ou WebP, até 3 MB.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
