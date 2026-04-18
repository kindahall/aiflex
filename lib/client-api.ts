"use client";

import type { Format, Genre, Project, Tone, Visibility } from "./types";

/** Small typed wrapper around the REST routes. */

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}

export async function listMyProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects", { cache: "no-store" });
  return (await json<{ projects: Project[] }>(res)).projects;
}

export async function createProject(input: {
  idea: string;
  genre: Genre;
  format: Format;
  tone: Tone;
  endingHint?: string;
}): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json<{ project: Project }>(res)).project;
}

export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
  return (await json<{ project: Project }>(res)).project;
}

export async function patchProject(
  id: string,
  patch: Partial<Project>
): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return (await json<{ project: Project }>(res)).project;
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  await json<{ ok: true }>(res);
}

export async function setVisibility(
  id: string,
  visibility: Visibility
): Promise<Project> {
  const res = await fetch(`/api/projects/${id}/publish`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visibility }),
  });
  return (await json<{ project: Project }>(res)).project;
}

export interface PublicFeedItem {
  id: string;
  title: string;
  logline: string;
  synopsis: string;
  genre: string;
  format: string;
  tone: string;
  coverUrl?: string;
  backdropUrl?: string;
  sceneCount: number;
  videoCount: number;
  publishedAt?: number;
  views: number;
  likes: number;
  author: string;
  previewUrl?: string | null;
}

export async function fetchPublicFeed(): Promise<PublicFeedItem[]> {
  const res = await fetch("/api/feed", { cache: "no-store" });
  return (await json<{ projects: PublicFeedItem[] }>(res)).projects;
}
