import React, { useRef, useState } from "react";
import { Upload, X, Image, Film, FileWarning } from "lucide-react";

export interface UploadFile {
  file: File;
  preview: string | null;
  type: "image" | "video" | "other";
  description: string;
}

interface Props {
  files: UploadFile[];
  onChange: (files: UploadFile[]) => void;
}

function makeUploadFile(file: File): UploadFile {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  return {
    file,
    preview: isImage ? URL.createObjectURL(file) : null,
    type: isImage ? "image" : isVideo ? "video" : "other",
    description: "",
  };
}

export default function EvidenceUpload({ files, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const added = Array.from(newFiles).map(makeUploadFile);
    onChange([...files, ...added]);
  };

  const remove = (i: number) => {
    const updated = files.filter((_, idx) => idx !== i);
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs text-gray-400 block">
        Beweismittel (Bilder / Videos)
      </label>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-5 cursor-pointer transition-colors
          ${dragging ? "border-[#c9a227] bg-[#c9a227]/5" : "border-[#1e2d4a] hover:border-[#c9a227]/40 hover:bg-[#c9a227]/5"}`}
      >
        <Upload className="w-6 h-6 text-gray-500" />
        <p className="text-xs text-gray-400 text-center">
          Dateien hier ablegen oder <span className="text-[#c9a227]">klicken zum Auswählen</span>
        </p>
        <p className="text-[10px] text-gray-600">JPG, PNG, GIF, MP4, MOV, WebM bis 200 MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={e => addFiles(e.target.files)}
      />

      {/* Previews with per-file description */}
      {files.length > 0 && (
        <div className="space-y-2 mt-1">
          {files.map((f, i) => (
            <div key={i} className="flex gap-2 items-stretch rounded-lg bg-[#0a0f1a] border border-[#1e2d4a] p-2">
              <div className="relative w-20 shrink-0 rounded overflow-hidden bg-[#0d1526]">
                {f.type === "image" && f.preview ? (
                  <img src={f.preview} alt={f.file.name} className="w-20 h-16 object-cover" />
                ) : f.type === "video" ? (
                  <div className="w-20 h-16 flex flex-col items-center justify-center gap-1">
                    <Film className="w-5 h-5 text-blue-400" />
                  </div>
                ) : (
                  <div className="w-20 h-16 flex flex-col items-center justify-center gap-1">
                    <FileWarning className="w-5 h-5 text-gray-500" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <p className="text-[10px] text-gray-400 truncate flex-1" title={f.file.name}>{f.file.name}</p>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
                    title="Entfernen"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={f.description}
                  onChange={e => {
                    const updated = files.slice();
                    updated[i] = { ...f, description: e.target.value };
                    onChange(updated);
                  }}
                  placeholder="Bildbeschreibung (Pflichtfeld) – erscheint unter dem Bild in der Akte"
                  rows={2}
                  maxLength={2000}
                  data-testid={`input-evidence-description-${i}`}
                  className={`w-full bg-[#0d1526] border rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-[#c9a227]/60
                    ${f.description.trim() ? "border-[#1e2d4a]" : "border-amber-700/60"}`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function allDescriptionsFilled(files: UploadFile[]): boolean {
  return files.every(f => f.description.trim().length > 0);
}

export async function uploadEvidenceFiles(caseId: number, files: UploadFile[]): Promise<void> {
  if (!files.length) return;
  const formData = new FormData();
  files.forEach(f => formData.append("files", f.file));
  files.forEach(f => formData.append("descriptions", f.description.trim()));
  await fetch(`/api/cases/${caseId}/evidence/upload`, {
    method: "POST",
    body: formData,
    headers: { Authorization: `Bearer ${sessionStorage.getItem("sidms_token") ?? ""}` },
  });
}
