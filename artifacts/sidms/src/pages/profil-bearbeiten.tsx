import React, { useRef, useState } from "react";
import { useLocation } from "wouter";
import { UserCog, Shield, Save, ArrowLeft, CheckCircle2, AlertCircle, KeyRound, Camera, Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateOfficerPermissions,
  useChangeOfficerPassword,
  useRemoveOfficerAvatar,
  getGetOfficersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";

const inputCls =
  "w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#c9a227]";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export default function ProfilBearbeiten() {
  const { officer, updateOfficer } = useAuth();
  const [, setLocation] = useLocation();
  const updateMutation = useUpdateOfficerPermissions();
  const passwordMutation = useChangeOfficerPassword();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(officer?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removeAvatarMutation = useRemoveOfficerAvatar();

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  if (!officer) {
    return <div className="text-sm text-gray-400">Kein angemeldeter Officer.</div>;
  }

  const setPw = (key: keyof typeof pwForm, value: string) => {
    setPwForm((prev) => ({ ...prev, [key]: value }));
    setPwError(null);
    setPwSuccess(false);
  };

  const handleAvatarFile = async (file: File | null | undefined) => {
    setAvatarError(null);
    setAvatarSuccess(null);
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Ungültiger Dateityp. Erlaubt sind PNG, JPG, GIF und WebP.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("Die Datei ist zu groß (max. 5 MB).");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/officers/${officer.id}/avatar`, {
        method: "POST",
        body: formData,
        headers: { Authorization: `Bearer ${sessionStorage.getItem("sidms_token") ?? ""}` },
      });
      const data = (await res.json().catch(() => null)) as { avatarUrl?: string | null; error?: string } | null;
      if (!res.ok) {
        setAvatarError(data?.error ?? "Profilbild konnte nicht hochgeladen werden.");
        return;
      }
      updateOfficer({ avatarUrl: data?.avatarUrl ?? null });
      queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });
      setAvatarSuccess("Profilbild erfolgreich aktualisiert.");
    } catch {
      setAvatarError("Profilbild konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError(null);
    setAvatarSuccess(null);
    setRemoving(true);
    try {
      const updated = await removeAvatarMutation.mutateAsync({ id: officer.id });
      updateOfficer({ avatarUrl: updated.avatarUrl ?? null });
      queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });
      setAvatarSuccess("Profilbild entfernt.");
    } catch {
      setAvatarError("Profilbild konnte nicht entfernt werden. Bitte versuchen Sie es erneut.");
    } finally {
      setRemoving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError(null);
    setPwSuccess(false);

    const { current, next, confirm } = pwForm;

    if (!current) {
      setPwError("Bitte geben Sie Ihr aktuelles Passwort ein.");
      return;
    }
    if (!next) {
      setPwError("Bitte geben Sie ein neues Passwort ein.");
      return;
    }
    if (next.length < 4) {
      setPwError("Das neue Passwort muss mindestens 4 Zeichen lang sein.");
      return;
    }
    if (next !== confirm) {
      setPwError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (next === current) {
      setPwError("Das neue Passwort muss sich vom aktuellen unterscheiden.");
      return;
    }

    setPwSaving(true);
    try {
      await passwordMutation.mutateAsync({
        id: officer.id,
        data: { currentPassword: current, newPassword: next },
      });
      setPwForm({ current: "", next: "", confirm: "" });
      setPwSuccess(true);
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      if (status === 401) {
        setPwError("Das aktuelle Passwort ist falsch.");
      } else {
        setPwError("Das Passwort konnte nicht geändert werden. Bitte versuchen Sie es erneut.");
      }
    } finally {
      setPwSaving(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name darf nicht leer sein.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMutation.mutateAsync({
        id: officer.id,
        data: { name: trimmed },
      });
      updateOfficer({ name: updated.name });
      queryClient.invalidateQueries({ queryKey: getGetOfficersQueryKey() });
      setSuccess(true);
    } catch {
      setError("Die Änderungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <UserCog className="w-5 h-5 text-[#c9a227]" />
        <div>
          <h1 className="text-base font-semibold text-white">Profil bearbeiten</h1>
          <p className="text-xs text-gray-400">Aktualisieren Sie Ihre eigenen Profildaten.</p>
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Camera className="w-4 h-4 text-[#c9a227]" /> Profilbild
        </h2>

        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20 border border-[#c9a227]/50">
            {officer.avatarUrl && <AvatarImage src={officer.avatarUrl} alt={officer.name} />}
            <AvatarFallback className="bg-[#c9a227]/20 text-[#c9a227] text-lg font-semibold">
              {initials(officer.name)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || removing}
                data-testid="button-upload-avatar"
                className="flex items-center gap-2 text-sm text-white border border-[#1e2d4a] hover:border-[#c9a227]/60 rounded px-4 py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 text-[#c9a227]" />}
                {uploading ? "Wird hochgeladen…" : officer.avatarUrl ? "Bild ändern" : "Bild hochladen"}
              </button>
              {officer.avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploading || removing}
                  data-testid="button-remove-avatar"
                  className="flex items-center gap-2 text-sm text-red-400 border border-[#1e2d4a] hover:border-red-500/60 rounded px-4 py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {removing ? "Wird entfernt…" : "Bild entfernen"}
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-500">PNG, JPG, GIF oder WebP, max. 5 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            data-testid="input-avatar-file"
            onChange={(e) => handleAvatarFile(e.target.files?.[0])}
          />
        </div>

        {avatarError && (
          <div
            className="flex items-center gap-2 text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2"
            data-testid="text-avatar-error"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {avatarError}
          </div>
        )}
        {avatarSuccess && (
          <div
            className="flex items-center gap-2 text-sm text-green-400 bg-green-950/30 border border-green-900/50 rounded px-3 py-2"
            data-testid="text-avatar-success"
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {avatarSuccess}
          </div>
        )}
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#c9a227]" /> Profil
        </h2>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Name</label>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
              setSuccess(false);
            }}
            className={inputCls}
            data-testid="input-name"
          />
        </div>

        {error && (
          <div
            className="flex items-center gap-2 text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2"
            data-testid="text-error"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div
            className="flex items-center gap-2 text-sm text-green-400 bg-green-950/30 border border-green-900/50 rounded px-3 py-2"
            data-testid="text-success"
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Profil erfolgreich gespeichert.
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="button-save"
          className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#b8941f] text-black text-sm font-semibold rounded px-4 py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#c9a227]" /> Passwort ändern
        </h2>
        <p className="text-xs text-gray-400">
          Geben Sie Ihr aktuelles Passwort ein, um ein neues festzulegen.
        </p>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Aktuelles Passwort</label>
          <input
            type="password"
            autoComplete="current-password"
            value={pwForm.current}
            onChange={(e) => setPw("current", e.target.value)}
            className={inputCls}
            data-testid="input-current-password"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Neues Passwort</label>
          <input
            type="password"
            autoComplete="new-password"
            value={pwForm.next}
            onChange={(e) => setPw("next", e.target.value)}
            className={inputCls}
            data-testid="input-new-password"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Neues Passwort bestätigen</label>
          <input
            type="password"
            autoComplete="new-password"
            value={pwForm.confirm}
            onChange={(e) => setPw("confirm", e.target.value)}
            className={inputCls}
            data-testid="input-confirm-password"
          />
        </div>

        {pwError && (
          <div
            className="flex items-center gap-2 text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2"
            data-testid="text-password-error"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {pwError}
          </div>
        )}
        {pwSuccess && (
          <div
            className="flex items-center gap-2 text-sm text-green-400 bg-green-950/30 border border-green-900/50 rounded px-3 py-2"
            data-testid="text-password-success"
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Passwort erfolgreich geändert.
          </div>
        )}

        <button
          onClick={handleChangePassword}
          disabled={pwSaving}
          data-testid="button-change-password"
          className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#b8941f] text-black text-sm font-semibold rounded px-4 py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <KeyRound className="w-4 h-4" />
          {pwSaving ? "Wird geändert…" : "Passwort ändern"}
        </button>
      </div>

      <button
        onClick={() => setLocation("/dashboard")}
        data-testid="button-back"
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-[#1e2d4a] rounded px-4 py-2 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Zurück
      </button>
    </div>
  );
}
