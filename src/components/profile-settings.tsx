"use client";

import {
  Bell,
  Check,
  Mail,
  MapPinOff,
  Pencil,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { PartnerInvite } from "@/components/partner-invite";
import { usePassport } from "@/components/passport-provider";
import type { Member } from "@/lib/domain";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The change could not be saved.";
}

export function ProfileSettings() {
  const {
    serverMode,
    ready,
    storageError,
    members,
    currentMember,
    setCurrentMember,
    saveMemberName,
    updateSettings,
    settings,
    resetPreview,
  } = usePassport();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [pendingSetting, setPendingSetting] = useState<"reviewReminders" | "locationEnabled" | "planReminders" | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  function beginEditing(member: Member) {
    setErrorMessage("");
    setStatusMessage("");
    setEditingMemberId(member.id);
    setDraftName(member.displayName);
  }

  function cancelEditing() {
    setEditingMemberId(null);
    setDraftName("");
  }

  async function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMemberId) return;

    const name = draftName.trim();
    if (!name) {
      setErrorMessage("Enter a name before saving.");
      return;
    }

    setSavingMemberId(editingMemberId);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await Promise.resolve(saveMemberName(editingMemberId, name));
      setEditingMemberId(null);
      setDraftName("");
      setStatusMessage(serverMode ? "Your name was saved." : "Member name saved in this browser preview.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSavingMemberId(null);
    }
  }

  async function handleMemberSelect(id: string) {
    setErrorMessage("");
    setStatusMessage("");
    try {
      await Promise.resolve(setCurrentMember(id));
      setStatusMessage("Browser preview member selected.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleSettingChange(
    setting: "reviewReminders" | "locationEnabled" | "planReminders",
    value: boolean,
  ) {
    setPendingSetting(setting);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await Promise.resolve(updateSettings({ [setting]: value }));
      setStatusMessage(serverMode ? "Preference saved." : "Preference saved in this browser preview.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setPendingSetting(null);
    }
  }

  async function handleReset() {
    setResetting(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await Promise.resolve(resetPreview());
      setConfirmingReset(false);
      cancelEditing();
      setStatusMessage("Browser preview data was reset.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setResetting(false);
    }
  }

  if (!ready) {
    return (
      <section className="profile-settings" aria-live="polite">
        <div className="empty-state">
          <p>Loading settings…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="profile-settings">
      {(storageError || errorMessage) && (
        <p className="field-error" role="alert">
          {errorMessage || storageError || "Changes may not persist."}
        </p>
      )}
      {statusMessage && (
        <p className="form-status" role="status" aria-live="polite">
          {statusMessage}
        </p>
      )}

      {!serverMode && <section className="settings-panel frontend-panel" aria-labelledby="preview-member-title">
        <header>
          <div>
            <ShieldCheck size={23} aria-hidden="true" />
            <div>
              <h2 id="preview-member-title">Browser preview member</h2>
              <p>Select which member the preview uses while you test the experience.</p>
            </div>
          </div>
        </header>
        <p className="field-hint">This selector only changes the local browser preview; it does not change account access.</p>
        <div className="member-list frontend-panel__member-list" role="group" aria-label="Browser preview member">
          {members.map((member) => {
            const isCurrent = member.id === currentMember.id;
            return (
              <article key={member.id} className={isCurrent ? "is-active" : undefined}>
                <span className="avatar avatar--large">{member.initials}</span>
                <div>
                  <strong>{member.displayName}</strong>
                  <small>{isCurrent ? "Selected for preview" : "Available member"}</small>
                </div>
                <button
                  type="button"
                  className={isCurrent ? "button button--primary button--compact" : "button button--secondary button--compact"}
                  onClick={() => void handleMemberSelect(member.id)}
                  disabled={isCurrent}
                  aria-pressed={isCurrent}
                >
                  {isCurrent ? <><Check size={15} aria-hidden="true" /> Selected</> : "Use in preview"}
                </button>
              </article>
            );
          })}
        </div>
      </section>}

      <section className="settings-panel frontend-panel" aria-labelledby="profile-details-title">
        <header>
          <div>
            <Pencil size={23} aria-hidden="true" />
            <div>
              <h2 id="profile-details-title">Profile details</h2>
              {!serverMode && <p>Names are saved separately for each preview member.</p>}
            </div>
          </div>
        </header>
        <div className="member-list frontend-panel__member-list" aria-label="Edit profile names">
          {members.filter((member) => !serverMode || member.id === currentMember.id).map((member) => (
            <article key={member.id}>
              <span className="avatar avatar--large">{member.initials}</span>
              {editingMemberId === member.id ? (
                <form className="frontend-panel__inline-form" onSubmit={handleNameSubmit}>
                  <label className="field" htmlFor={`member-name-${member.id}`}>
                    <span>Name for {member.displayName}</span>
                    <input
                      id={`member-name-${member.id}`}
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      maxLength={40}
                      autoFocus
                    />
                  </label>
                  <div>
                    <button type="submit" className="button button--primary button--compact" disabled={savingMemberId === member.id}>
                      Save name
                    </button>
                    <button type="button" className="button button--secondary button--compact" onClick={cancelEditing} disabled={savingMemberId === member.id}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <strong>{member.displayName}</strong>
                    <small>{member.role === "owner" ? "Owner" : "Partner"}</small>
                  </div>
                  <button type="button" className="button button--secondary button--compact" onClick={() => beginEditing(member)}>
                    <Pencil size={15} aria-hidden="true" /> Edit name
                  </button>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      <PartnerInvite />

      <section className="settings-panel frontend-panel" aria-labelledby="preferences-title">
        <header>
          <div>
            <ShieldCheck size={23} aria-hidden="true" />
            <div>
              <h2 id="preferences-title">Preferences</h2>
              {!serverMode && <p>Saved in this browser preview.</p>}
            </div>
          </div>
        </header>
        <div className="settings-list">
          <article>
            <MapPinOff aria-hidden="true" />
            <div>
              <h3>Location</h3>
              <p>Let the map use this device&apos;s location for Near me.</p>
            </div>
            <button
              type="button"
              className={settings.locationEnabled ? "switch is-on" : "switch"}
              role="switch"
              aria-checked={settings.locationEnabled}
              disabled={pendingSetting === "locationEnabled"}
              onClick={() => void handleSettingChange("locationEnabled", !settings.locationEnabled)}
            >
              <span aria-hidden="true" />
              {settings.locationEnabled ? "On" : "Off"}
            </button>
          </article>
          <article>
            <Mail aria-hidden="true" />
            <div>
              <h3>Plan reminders</h3>
              <p>Email me before a planned visit.</p>
            </div>
            <button
              type="button"
              className={settings.planReminders ? "switch is-on" : "switch"}
              role="switch"
              aria-checked={settings.planReminders}
              disabled={pendingSetting === "planReminders"}
              onClick={() => void handleSettingChange("planReminders", !settings.planReminders)}
            >
              <span aria-hidden="true" />
              {settings.planReminders ? "On" : "Off"}
            </button>
          </article>
          <article>
            <Bell aria-hidden="true" />
            <div>
              <h3>Review reminders</h3>
              <p>Email me when my partner logs a visit I haven&apos;t reviewed.</p>
            </div>
            <button
              type="button"
              className={settings.reviewReminders ? "switch is-on" : "switch"}
              role="switch"
              aria-checked={settings.reviewReminders}
              disabled={pendingSetting === "reviewReminders"}
              onClick={() => void handleSettingChange("reviewReminders", !settings.reviewReminders)}
            >
              <span aria-hidden="true" />
              {settings.reviewReminders ? "On" : "Off"}
            </button>
          </article>
        </div>
      </section>

      {!serverMode && <section className="settings-panel frontend-panel" aria-labelledby="reset-preview-title">
        <header>
          <div>
            <RotateCcw size={23} aria-hidden="true" />
            <div>
              <h2 id="reset-preview-title">Reset browser preview</h2>
              <p>Replace local preview members, names, and preferences with the starter data.</p>
            </div>
          </div>
        </header>
        {!confirmingReset ? (
          <button type="button" className="button button--tertiary" onClick={() => setConfirmingReset(true)}>
            <RotateCcw size={16} aria-hidden="true" /> Reset preview data
          </button>
        ) : (
          <div className="frontend-panel__confirmation" role="alertdialog" aria-labelledby="reset-confirm-title" aria-describedby="reset-confirm-description">
            <h3 id="reset-confirm-title">Replace browser preview data?</h3>
            <p id="reset-confirm-description">This destructive action replaces the browser preview data, including member names and preferences. It cannot be undone from this screen.</p>
            <div>
              <button type="button" className="button button--secondary" onClick={() => setConfirmingReset(false)} disabled={resetting}>
                <X size={16} aria-hidden="true" /> Cancel
              </button>
              <button type="button" className="button button--primary" onClick={() => void handleReset()} disabled={resetting}>
                <RotateCcw size={16} aria-hidden="true" /> {resetting ? "Resetting…" : "Replace data"}
              </button>
            </div>
          </div>
        )}
      </section>}
    </section>
  );
}
