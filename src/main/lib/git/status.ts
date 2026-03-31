import type { ChangedFile, GitChangesStatus } from "../../../shared/changes-types";
import { eq } from "drizzle-orm";
import { homedir } from "os";
import { resolve } from "path";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { getDatabase, projects } from "../db";
import { assertRegisteredWorktree, secureFs } from "./security";
import { applyNumstatToFiles } from "./utils/apply-numstat";
import {
	parseGitStatus,
} from "./utils/parse-status";
import { gitCache } from "./cache";

// Always block root-level paths regardless of project config
const ALWAYS_BLOCKED = new Set(["/"])

export function shouldSkipGitStatus(worktreePath: string): boolean {
	const resolved = resolve(worktreePath)
	if (ALWAYS_BLOCKED.has(resolved)) return true
	try {
		const db = getDatabase()
		const project = db.select({ skipGitStatus: projects.skipGitStatus })
			.from(projects).where(eq(projects.path, resolved)).get()
		if (project?.skipGitStatus) return true
	} catch { /* DB not ready yet */ }
	return false
}

export const createStatusRouter = () => {
	return router({
		getStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				assertRegisteredWorktree(input.worktreePath);

				// Skip git for projects that opted out or dangerous root-level paths
				if (shouldSkipGitStatus(input.worktreePath)) {
					console.warn(`[getStatus] Skipped (skipGitStatus): ${input.worktreePath}`);
					return {
						branch: "", defaultBranch: input.defaultBranch || "main",
						againstBase: [], commits: [], staged: [], unstaged: [], untracked: [],
						ahead: 0, behind: 0, pushCount: 0, pullCount: 0, hasUpstream: false,
					};
				}

				// Check cache first
				const cached = gitCache.getStatus<GitChangesStatus>(input.worktreePath);
				if (cached) {
					console.log("[getStatus] Cache hit for:", input.worktreePath);
					return cached;
				}

				const t0 = Date.now();
				const git = simpleGit(input.worktreePath);
				const defaultBranch = input.defaultBranch || "main";

				// Timeout: simple-git runs `git status -u` which recursively walks
				// untracked dirs. On large worktrees this can hang indefinitely.
				const GIT_STATUS_TIMEOUT_MS = 15_000;
				const statusTimeout = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error(`git.status() timed out after ${GIT_STATUS_TIMEOUT_MS / 1000}s for ${input.worktreePath}`)), GIT_STATUS_TIMEOUT_MS),
				);
				let status: Awaited<ReturnType<typeof git.status>>;
				try {
					status = await Promise.race([git.status(), statusTimeout]);
				} catch (err) {
					console.error(`[getStatus] ${err}`);
					throw err;
				}
				const parsed = parseGitStatus(status);

				// Bail if the repo returns an unreasonable number of files
				const MAX_TOTAL_FILES = 5000;
				const totalFiles = parsed.staged.length + parsed.unstaged.length + parsed.untracked.length;
				if (totalFiles > MAX_TOTAL_FILES) {
					console.warn(`[getStatus] Too many files (${totalFiles}) for ${input.worktreePath}, returning lightweight result`);
					const skippedResult: GitChangesStatus = {
						branch: parsed.branch, defaultBranch,
						againstBase: [], commits: [],
						staged: parsed.staged, unstaged: parsed.unstaged, untracked: parsed.untracked,
						ahead: 0, behind: 0, pushCount: 0, pullCount: 0, hasUpstream: false,
					};
					gitCache.setStatus(input.worktreePath, skippedResult);
					return skippedResult;
				}

				const [branchCounts, trackingStatus] = await Promise.all([
					getBranchComparisonCounts(git, defaultBranch),
					getTrackingBranchStatus(git),
				]);

				await Promise.all([
					applyNumstatToFiles(git, parsed.staged, ["diff", "--cached", "--numstat"]),
					applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]),
					applyUntrackedLineCount(input.worktreePath, parsed.untracked),
				]);

				const result: GitChangesStatus = {
					branch: parsed.branch, defaultBranch,
					againstBase: [], commits: [],
					staged: parsed.staged, unstaged: parsed.unstaged, untracked: parsed.untracked,
					ahead: branchCounts.ahead, behind: branchCounts.behind,
					pushCount: trackingStatus.pushCount, pullCount: trackingStatus.pullCount,
					hasUpstream: trackingStatus.hasUpstream,
				};

				gitCache.setStatus(input.worktreePath, result);
				console.log(`[getStatus] ${input.worktreePath} done in ${Date.now() - t0}ms (${totalFiles} files)`);
				return result;
			}),

		getCommitFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ChangedFile[]> => {
				console.log("[getCommitFiles] START:", {
					worktreePath: input.worktreePath,
					commitHash: input.commitHash,
				});

				try {
					assertRegisteredWorktree(input.worktreePath);
					console.log("[getCommitFiles] Worktree validated");

					const git = simpleGit(input.worktreePath);

					const nameStatus = await git.raw([
						"diff-tree",
						"--no-commit-id",
						"--name-status",
						"-r",
						input.commitHash,
					]);

					console.log("[getCommitFiles] diff-tree output:", {
						length: nameStatus.length,
						output: nameStatus.substring(0, 500), // First 500 chars
					});

					const files = parseNameStatus(nameStatus);
					console.log("[getCommitFiles] Parsed files:", {
						count: files.length,
						files: files.map((f) => ({ path: f.path, status: f.status })),
					});

					await applyNumstatToFiles(git, files, [
						"diff-tree",
						"--no-commit-id",
						"--numstat",
						"-r",
						input.commitHash,
					]);

					console.log("[getCommitFiles] SUCCESS:", { filesCount: files.length });
					return files;
				} catch (error) {
					console.error("[getCommitFiles] ERROR:", {
						error: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
						worktreePath: input.worktreePath,
						commitHash: input.commitHash,
					});
					throw error;
				}
			}),

		/** Check if worktree is registered in database */
		isWorktreeRegistered: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<boolean> => {
				try {
					assertRegisteredWorktree(input.worktreePath);
					return true;
				} catch (error) {
					return false;
				}
			}),

		/** Get the unified diff for a specific file in a commit */
		getCommitFileDiff: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
					filePath: z.string(),
				}),
			)
			.query(async ({ input }): Promise<string> => {
				assertRegisteredWorktree(input.worktreePath);

				const git = simpleGit(input.worktreePath);

				// Get diff for specific file comparing commit to its parent
				const diff = await git.raw([
					"diff",
					`${input.commitHash}^`,
					input.commitHash,
					"--",
					input.filePath,
				]);

				return diff;
			}),
	});
};

interface BranchComparisonCounts {
	ahead: number;
	behind: number;
}

async function getBranchComparisonCounts(
	git: ReturnType<typeof simpleGit>,
	defaultBranch: string,
): Promise<BranchComparisonCounts> {
	let ahead = 0;
	let behind = 0;

	try {
		const tracking = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			`origin/${defaultBranch}...HEAD`,
		]);
		const [behindStr, aheadStr] = tracking.trim().split(/\s+/);
		behind = Number.parseInt(behindStr || "0", 10);
		ahead = Number.parseInt(aheadStr || "0", 10);
	} catch {}

	return { ahead, behind };
}

/** Max file size for line counting (1 MiB) - skip larger files to avoid OOM */
const MAX_LINE_COUNT_SIZE = 1 * 1024 * 1024;

const MAX_UNTRACKED_LINE_COUNT = 500;

async function applyUntrackedLineCount(
	worktreePath: string,
	untracked: ChangedFile[],
): Promise<void> {
	// Cap to avoid reading thousands of files in large worktrees
	const filesToCount = untracked.slice(0, MAX_UNTRACKED_LINE_COUNT);
	for (const file of filesToCount) {
		try {
			const stats = await secureFs.stat(worktreePath, file.path);
			if (stats.size > MAX_LINE_COUNT_SIZE) continue;

			const content = await secureFs.readFile(worktreePath, file.path);
			const lineCount = content.split("\n").length;
			file.additions = lineCount;
			file.deletions = 0;
		} catch {
			// Skip files that fail validation or reading
		}
	}
}

interface TrackingStatus {
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
}

async function getTrackingBranchStatus(
	git: ReturnType<typeof simpleGit>,
): Promise<TrackingStatus> {
	try {
		// Single git call - rev-list will fail if no upstream exists
		// This is faster than checking upstream first, then counting
		const tracking = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			"@{upstream}...HEAD",
		]);
		const [pullStr, pushStr] = tracking.trim().split(/\s+/);
		return {
			pushCount: Number.parseInt(pushStr || "0", 10),
			pullCount: Number.parseInt(pullStr || "0", 10),
			hasUpstream: true,
		};
	} catch {
		// No upstream branch configured
		return { pushCount: 0, pullCount: 0, hasUpstream: false };
	}
}
