import React, { useRef, useState } from "react";
import { Upload, X, Image, Film, FileWarning } from "lucide-react";

export interface UploadFile {
  file: File;
  preview: string | null;
  type: "image" | "video" | "other";
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

      {/* Previews */}
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-1">
          {files.map((f, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden bg-[#0a0f1a] border border-[#1e2d4a]">
              {f.type === "image" && f.preview ? (
                <img src={f.preview} alt={f.file.name} className="w-full h-16 object-cover" />
              ) : f.type === "video" ? (
                <div className="w-full h-16 flex flex-col items-center justify-center gap-1">
                  <Film className="w-5 h-5 text-blue-400" />
                  <span className="text-[9px] text-gray-500 px-1 truncate w-full text-center">{f.file.name}</span>
                </div>
              ) : (
                <div className="w-full h-16 flex flex-col items-center justify-center gap-1">
                  <FileWarning className="w-5 h-5 text-gray-500" />
                  <span className="text-[9px] text-gray-500 px-1 truncate w-full text-center">{f.file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              {f.type === "image" && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                  <p className="text-[9px] text-gray-300 truncate">{f.file.name}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export async function uploadEvidenceFiles(caseId: number, files: UploadFile[]): Promise<void> {
  if (!files.length) return;
  const formData = new FormData();
  files.forEach(f => formData.append("files", f.file));
  await fetch(`/api/cases/${caseId}/evidence/upload`, {
    method: "POST",
    body: formData,
    headers: { Authorization: `Bearer ${sessionStorage.getItem("sidms_token") ?? ""}` },
  });
}
