import { readFile } from "node:fs/promises";

type CommentInput = {
  readonly marker: string;
  readonly body: string;
};

type GitHubEvent = {
  readonly issue?: { readonly number?: number; readonly pull_request?: unknown };
  readonly pull_request?: { readonly number?: number };
};

type GitHubComment = {
  readonly id: number;
  readonly body?: string;
};

export async function upsertGitHubPrComment(input: CommentInput): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!process.env.GITHUB_ACTIONS || !token || !repository || !eventPath) {
    return false;
  }

  const event = JSON.parse(await readFile(eventPath, "utf8")) as GitHubEvent;
  const issueNumber = event.pull_request?.number ?? (event.issue?.pull_request ? event.issue.number : undefined);

  if (issueNumber === undefined) {
    return false;
  }

  const apiBase = `https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const body = `${input.marker}\n${input.body}`;

  const commentsResponse = await fetch(`${apiBase}?per_page=100`, { headers });
  if (!commentsResponse.ok) {
    throw new Error(`failed to list PR comments: ${commentsResponse.status} ${commentsResponse.statusText}`);
  }

  const comments = (await commentsResponse.json()) as GitHubComment[];
  const existing = comments.find((comment) => comment.body?.includes(input.marker));
  const response = await fetch(existing === undefined ? apiBase : existingCommentUrl(repository, existing.id), {
    method: existing === undefined ? "POST" : "PATCH",
    headers,
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    throw new Error(`failed to write PR comment: ${response.status} ${response.statusText}`);
  }

  return true;
}

function existingCommentUrl(repository: string, commentId: number): string {
  return `https://api.github.com/repos/${repository}/issues/comments/${commentId}`;
}
