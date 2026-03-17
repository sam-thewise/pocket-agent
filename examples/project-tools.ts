/**
 * Project tools for the agent: list_directory, read_file, grep.
 * Scoped to a project root so the agent can explore the codebase safely.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ToolAdapter } from "../src/types/tools.js";

const MAX_FILE_SIZE = 50_000; // chars to avoid huge responses
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".md", ".yml", ".yaml", ".txt", ".html", ".css", ".scss",
]);

function isTextPath(p: string): boolean {
  return TEXT_EXT.has(p.slice(p.lastIndexOf(".")).toLowerCase()) || !/\./.test(p);
}

function escapeRoot(root: string, relativePath: string): string {
  const normalized = resolve(root, relativePath.replace(/^\/*\.?\/*/, ""));
  if (!normalized.startsWith(resolve(root))) {
    throw new Error("Path outside project root is not allowed");
  }
  return normalized;
}

export function createProjectTools(projectRoot: string): Record<string, ToolAdapter> {
  const root = resolve(projectRoot);

  return {
    list_directory: {
      definition: {
        name: "list_directory",
        description: "List files and folders in a directory. Path must be a directory (e.g. '.' or 'src').",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path relative to project root. Use '.' for root." },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
      async invoke(raw: unknown, _context) {
        try {
          const { path: rel } = raw as { path?: string };
          const absPath = escapeRoot(root, rel ?? ".");
          const st = await stat(absPath);
          if (!st.isDirectory()) {
            return { path: rel, error: "Path is a file, not a directory. Use read_file to read it.", isFile: true };
          }
          const entries = await readdir(absPath, { withFileTypes: true });
          const list = entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "dir" : "file",
          }));
          return { path: rel, entries: list };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: message };
        }
      },
    },

    read_file: {
      definition: {
        name: "read_file",
        description: "Read the contents of a file. Path relative to project root. Use only paths from list_directory or grep.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to project root." },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
      async invoke(raw: unknown, _context) {
        const { path: rel } = raw as { path?: string };
        try {
          const filePath = escapeRoot(root, rel ?? "");
          const st = await stat(filePath);
          if (st.isDirectory()) {
            return { path: rel, error: "Path is a directory. Use list_directory to list it.", isDirectory: true };
          }
          const content = await readFile(filePath, "utf8");
          const truncated =
            content.length > MAX_FILE_SIZE
              ? content.slice(0, MAX_FILE_SIZE) + "\n\n... (truncated)"
              : content;
          if (!isTextPath(rel ?? "")) {
            return { path: rel, note: "File may be binary; showing raw length.", length: content.length };
          }
          return { path: rel, content: truncated };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { path: rel, error: message };
        }
      },
    },

    grep: {
      definition: {
        name: "grep",
        description: "Search for text in files. Returns file paths and line numbers. Use to find which files contain a string.",
        inputSchema: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Text or pattern to search for." },
            path: { type: "string", description: "Directory to search from, relative to project root. Default '.'." },
            filePattern: { type: "string", description: "Optional file extension filter, e.g. '.ts'." },
            maxMatches: { type: "number", description: "Max file paths to return. Default 50." },
          },
          required: ["pattern"],
          additionalProperties: false,
        },
      },
      async invoke(raw: unknown, _context) {
        try {
          const { pattern, path: dirRel = ".", filePattern, maxMatches = 50 } = raw as {
            pattern?: string;
            path?: string;
            filePattern?: string;
            maxMatches?: number;
          };
          const searchPattern = typeof pattern === "string" ? pattern : "";
          if (!searchPattern) {
            return { error: "pattern is required" };
          }
          const dirPath = escapeRoot(root, dirRel);
          const st = await stat(dirPath);
          if (!st.isDirectory()) {
            return { error: "path must be a directory to search in" };
          }
          const ext = filePattern?.startsWith(".") ? filePattern : filePattern ? `.${filePattern}` : null;
          const results: { path: string; lineNumber: number; line: string }[] = [];
          let fileCount = 0;

          async function scan(dir: string, relPrefix: string): Promise<void> {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const e of entries) {
              if (e.name.startsWith(".") && e.name !== ".env") continue;
              if (SKIP_DIRS.has(e.name)) continue;
              const rel = relPrefix ? `${relPrefix}/${e.name}` : e.name;
              const abs = resolve(dir, e.name);
              if (e.isDirectory()) {
                await scan(abs, rel);
                if (fileCount >= maxMatches) return;
                continue;
              }
              if (ext && !e.name.toLowerCase().endsWith(ext.toLowerCase())) continue;
              if (!isTextPath(e.name)) continue;
              let content: string;
              try {
                content = await readFile(abs, "utf8");
              } catch {
                continue;
              }
              const lines = content.split(/\r?\n/);
              for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
                if (lines[i].includes(searchPattern)) {
                  results.push({ path: rel, lineNumber: i + 1, line: lines[i].trim().slice(0, 120) });
                  fileCount = new Set(results.map((r) => r.path)).size;
                }
              }
            }
          }
          await scan(dirPath, dirRel === "." ? "" : dirRel);
          const byPath = new Map<string, { lineNumber: number; line: string }[]>();
          for (const r of results) {
            if (!byPath.has(r.path)) byPath.set(r.path, []);
            byPath.get(r.path)!.push({ lineNumber: r.lineNumber, line: r.line });
          }
          const files = Array.from(byPath.entries()).slice(0, maxMatches).map(([path, matches]) => ({
            path,
            matches: matches.slice(0, 5),
          }));
          return { pattern: searchPattern, files, totalFiles: byPath.size };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: message };
        }
      },
    },
  };
}
