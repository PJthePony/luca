import { env } from "../config.js";

export interface CreateTaskParams {
  title: string;
  notes?: string;
  location?: string;
  tags?: string[];
  activate_at?: string;
}

export interface CreateTaskResult {
  id: string;
  title: string;
  notes: string;
  location: string;
  created_at: number;
}

export async function createNexbiteTask(
  params: CreateTaskParams,
): Promise<CreateTaskResult> {
  const response = await fetch(env.NEXBITE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.NEXBITE_API_KEY}`,
    },
    body: JSON.stringify({
      title: params.title,
      notes: params.notes || "",
      location: params.location || "later",
      tags: params.tags || ["luca"],
      activate_at: params.activate_at || undefined,
    }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      `Nexbite API error (${response.status}): ${JSON.stringify(error)}`,
    );
  }

  return response.json();
}
