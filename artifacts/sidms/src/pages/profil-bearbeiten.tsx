import React, { useState } from "react";
import { useLocation } from "wouter";
import { UserCog, Shield, Radio, Save, ArrowLeft, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateOfficerPermissions,
  useChangeOfficerPassword,
  getGetOfficersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS = ["Anwesend", "In Einsatz", "Pause", "Abwesend"];
const RADIO_STATUS_OPTIONS = ["Aktiv", "Ausgeschaltet"];

const inputCls =
  "w-full bg-[#0a0f1a] border border-[#1e2d4a] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#c9a227]";

export default function ProfilBearbeiten() {
  const { officer, updateOfficer } = useAuth();
  const [, setLocation] = useLocation();
  const updateMutation = useUpdateOfficerPermissions();
  const passwordMutation = useChangeOfficerPassword();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: officer?.name ?? "",
    rank: officer?.rank ?? "",
    status: officer?.status ?? "Anwesend",
    radioStatus: officer?.radioStatus ?? "Aktiv",
    radioFreq: officer?.radioFreq ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pwForm, setPwForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  if (!officer) {
    return (
      <div className="text-sm text-gray-400">Kein angemeldeter Officer.</div>
    );
  }

  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccess(false);
  };

  const setPw = (key: keyof typeof pwForm, value: string) => {
    setPwForm((prev) => ({ ...prev, [key]: value }));
    setPwError(null);
    setPwSuccess(false);
  };

  const handleChangePassword = async () => {
    setPwError(null);
    setPwSuccess(false);

    const current = pwForm.current;
    const next = pwForm.next;
    const confirm = pwForm.confirm;

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

    const name = form.name.trim();
    const rank = form.rank.trim();
    const radioFreq = form.radioFreq.trim();

    if (!name) {
      setError("Name darf nicht leer sein.");
      return;
    }
    if (!rank) {
      setError("Rang darf nicht leer sein.");
      return;
    }
    if (!radioFreq) {
      setError("Funkfrequenz darf nicht leer sein.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMutation.mutateAsync({
        id: officer.id,
        data: {
          name,
          rank,
          status: form.status,
          radioStatus: form.radioStatus,
          radioFreq,
        },
      });
      updateOfficer({
        name: updated.name,
        rank: updated.rank,
        status: updated.status,
        radioStatus: updated.radioStatus ?? form.radioStatus,
        radioFreq: updated.radioFreq,
      });
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
          <Shield className="w-4 h-4 text-[#c9a227]" /> Profil
        </h2>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Dienstnummer</label>
          <input
            value={officer.dienstnummer}
            disabled
            className={`${inputCls} opacity-60 cursor-not-allowed`}
            data-testid="input-dienstnummer"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Name</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={inputCls}
            data-testid="input-name"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Rang</label>
          <input
            value={form.rank}
            onChange={(e) => set("rank", e.target.value)}
            className={inputCls}
            data-testid="input-rank"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Status</label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            className={inputCls}
            data-testid="select-status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[#0d1526] border border-[#1e2d4a] rounded p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#c9a227]" /> Funkeinstellungen
        </h2>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Frequenz</label>
          <input
            value={form.radioFreq}
            onChange={(e) => set("radioFreq", e.target.value)}
            className={inputCls}
            data-testid="input-radio-freq"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-gray-400">Funk-Status</label>
          <select
            value={form.radioStatus}
            onChange={(e) => set("radioStatus", e.target.value)}
            className={inputCls}
            data-testid="select-radio-status"
          >
            {RADIO_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
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

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          data-testid="button-save"
          className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#b8941f] text-black text-sm font-semibold rounded px-4 py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? "Speichern…" : "Speichern"}
        </button>
        <button
          onClick={() => setLocation("/einstellungen")}
          data-testid="button-back"
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-[#1e2d4a] rounded px-4 py-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>
      </div>
    </div>
  );
}
