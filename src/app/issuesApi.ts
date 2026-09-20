import issuesRaw from "../../data/issues.jsonl?raw";
import { parseIssues, sortedIssues, type Issue } from "../domain/issues.ts";
import type { Contributor } from "../domain/contributor.ts";
import { PUBLISH_TARGET } from "./editorApi.ts";

/**
 * Reading and posting "Issues and improvements".
 *
 * Read from the file bundled at build time, exactly like the edit log:
 * both come out of the repository, so the list somebody sees is the list
 * as of the last deploy. The honest consequence is that your own posting
 * does not appear in the list until the deploy lands a couple of minutes
 * later - the form says so rather than leaving you to wonder whether it
 * worked.
 *
 * Serving it from the Worker instead would make it instant, and was not
 * worth a route: a suggestion list is read rarely and changes rarely,
 * unlike live wind, which had to move for exactly the opposite reason.
 */

export const ISSUES: Issue[] = sortedIssues(parseIssues(issuesRaw));

export type PostIssueResult = { ok: true } | { ok: false; message: string };

export async function postIssue(text: string, contributor: Contributor): Promise<PostIssueResult> {
  const target = PUBLISH_TARGET;
  if (!target) {
    return { ok: false, message: "Det går inte att skicka förslag härifrån. / Cannot post from this build." };
  }
  const baseUrl = target.kind === "worker" ? target.baseUrl : "";

  try {
    const response = await fetch(`${baseUrl}/api/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, contributor }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      return { ok: false, message: body.error ?? `Kunde inte skicka (HTTP ${response.status}).` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Kunde inte nå tjänsten. ${(err as Error).message}` };
  }
}
