"use client";

import { useState } from "react";
import type { Character, Concept } from "@/lib/types";

/**
 * Concept display + inline editing. Each section has an "edit" toggle
 * that reveals form fields. On save, the parent receives the patched
 * concept and persists it.
 */
export default function ConceptView({
  concept,
  onEdit,
}: {
  concept: Concept;
  /** When provided, each field becomes editable inline. */
  onEdit?: (patch: Partial<Concept>) => void;
}) {
  return (
    <div className="space-y-6 animate-fadeUp">
      <TitleBlock concept={concept} onEdit={onEdit} />

      <div className="grid gap-6 md:grid-cols-2">
        <EditableTextBlock
          label="Synopsis"
          value={concept.synopsis}
          onSave={onEdit ? (v) => onEdit({ synopsis: v }) : undefined}
          rows={6}
        />
        <div className="space-y-4">
          <EditableTextBlock
            label="Univers"
            value={concept.universe}
            onSave={onEdit ? (v) => onEdit({ universe: v }) : undefined}
            rows={3}
          />
          <EditableTextBlock
            label="Ton"
            value={concept.tone}
            onSave={onEdit ? (v) => onEdit({ tone: v }) : undefined}
            rows={2}
          />
          <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-flex-muted">
              Thèmes
            </div>
            <div className="flex flex-wrap gap-2">
              {concept.themes.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-flex-accent2/20 px-3 py-1 text-xs font-semibold text-flex-accent2"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-flex-muted">
            Personnages
          </div>
          {onEdit && (
            <span className="text-[10px] text-flex-muted">
              Clique sur un personnage pour le modifier
            </span>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {concept.characters.map((c, i) => (
            <CharacterCard
              key={c.name + i}
              character={c}
              onSave={
                onEdit
                  ? (patch) => {
                      const next = [...concept.characters];
                      next[i] = { ...next[i], ...patch };
                      onEdit({ characters: next });
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      {concept.targetAudience && (
        <div className="rounded-2xl border border-flex-border bg-flex-panel p-4 text-xs text-flex-muted">
          <span className="font-bold uppercase tracking-widest text-flex-text">
            Audience cible :
          </span>{" "}
          {concept.targetAudience}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function TitleBlock({
  concept,
  onEdit,
}: {
  concept: Concept;
  onEdit?: (patch: Partial<Concept>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(concept.title);
  const [logline, setLogline] = useState(concept.logline);

  function save() {
    onEdit?.({ title: title.trim(), logline: logline.trim() });
    setEditing(false);
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-flex-accent">
          Titre du film
        </div>
        {onEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-flex-border bg-flex-panel px-2 py-0.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
          >
            ✎ Modifier
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <div>
            <label htmlFor="concept-title">Titre</label>
            <input
              id="concept-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="concept-logline">Logline</label>
            <input
              id="concept-logline"
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className="rounded-lg bg-flex-accent px-4 py-1.5 text-xs font-bold text-white"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(concept.title);
                setLogline(concept.logline);
                setEditing(false);
              }}
              className="rounded-lg border border-flex-border px-4 py-1.5 text-xs font-semibold text-flex-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-4xl font-black tracking-tight">
            {concept.title}
          </h2>
          <p className="mt-3 text-lg italic text-flex-muted">
            &laquo; {concept.logline} &raquo;
          </p>
        </>
      )}
    </div>
  );
}

function EditableTextBlock({
  label,
  value,
  onSave,
  rows = 4,
}: {
  label: string;
  value: string;
  onSave?: (v: string) => void;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-6">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-flex-muted">
          {label}
        </div>
        {onSave && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-flex-border bg-flex-panel px-2 py-0.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
          >
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            rows={rows}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onSave?.(text.trim());
                setEditing(false);
              }}
              className="rounded-lg bg-flex-accent px-4 py-1.5 text-xs font-bold text-white"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => {
                setText(value);
                setEditing(false);
              }}
              className="rounded-lg border border-flex-border px-4 py-1.5 text-xs font-semibold text-flex-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line text-sm leading-relaxed text-flex-text">
          {value}
        </p>
      )}
    </div>
  );
}

function CharacterCard({
  character,
  onSave,
}: {
  character: Character;
  onSave?: (patch: Partial<Character>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(character.name);
  const [role, setRole] = useState(character.role);
  const [desc, setDesc] = useState(character.description);
  const [arc, setArc] = useState(character.arc || "");

  if (editing && onSave) {
    return (
      <div className="rounded-xl border border-flex-accent/40 bg-flex-panel p-4 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rôle" />
        <textarea
          rows={2}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description"
        />
        <input value={arc} onChange={(e) => setArc(e.target.value)} placeholder="Arc narratif" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onSave({ name, role, description: desc, arc: arc || undefined });
              setEditing(false);
            }}
            className="rounded-lg bg-flex-accent px-3 py-1 text-[10px] font-bold text-white"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-flex-border px-3 py-1 text-[10px] text-flex-muted"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-flex-border bg-flex-panel p-4 ${
        onSave ? "cursor-pointer transition hover:border-flex-accent" : ""
      }`}
      onClick={onSave ? () => setEditing(true) : undefined}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-lg font-bold">{character.name}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-flex-accent">
          {character.role}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-flex-muted">
        {character.description}
      </p>
      {character.arc && (
        <p className="mt-2 border-t border-flex-border pt-2 text-xs italic text-flex-muted">
          Arc : {character.arc}
        </p>
      )}
    </div>
  );
}
