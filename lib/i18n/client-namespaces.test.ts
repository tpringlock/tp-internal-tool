import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, expect, it } from "vitest";
import vi from "@/messages/vi.json";
import en from "@/messages/en.json";
import {
  MODULE_NAMESPACES,
  SHELL_NAMESPACES,
  moduleNamespaces,
  pickMessages,
  type ClientModule,
} from "./client-namespaces";

const ROOT = normalize(join(__dirname, "..", ".."));

/** Route directory -> module whose provider wraps it. Anything else: shell. */
const MODULE_DIRS: Record<string, ClientModule> = {
  "app/(app)/documents": "documents",
  "app/(app)/academy": "academy",
  "app/(app)/admin": "admin",
  "app/(app)/billing": "billing",
  "app/(auth)": "auth",
};

const ROUTE_FILES = new Set([
  "page.tsx",
  "layout.tsx",
  "loading.tsx",
  "error.tsx",
  "not-found.tsx",
  "template.tsx",
]);

const IMPORT_RE =
  /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const NS_RE = /useTranslations\(\s*["']([^"']+)["']\s*\)/g;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

interface FileInfo {
  isClient: boolean;
  deps: string[];
  namespaces: string[];
  usesRoot: boolean;
}

const infoCache = new Map<string, FileInfo>();
function fileInfo(file: string): FileInfo {
  const cached = infoCache.get(file);
  if (cached) return cached;
  const src = readFileSync(file, "utf8");
  const info: FileInfo = {
    isClient: /^\s*["']use client["']/.test(src),
    deps: [...src.matchAll(IMPORT_RE)]
      .map((m) => resolveImport(file, m[1] ?? m[2]))
      .filter((p): p is string => p !== null),
    namespaces: [...src.matchAll(NS_RE)].map((m) => m[1]),
    usesRoot: /useTranslations\(\s*\)/.test(src),
  };
  infoCache.set(file, info);
  return info;
}

/** Namespaces used anywhere in a Client Component's import closure. */
function clientNamespaces(file: string, seen: Set<string>, out: Set<string>) {
  if (seen.has(file)) return;
  seen.add(file);
  const info = fileInfo(file);
  if (info.usesRoot) out.add("<root>");
  info.namespaces.forEach((ns) => out.add(ns));
  info.deps.forEach((d) => clientNamespaces(d, seen, out));
}

/** Walk server files until a "use client" boundary, then collect below it. */
function serverWalk(
  file: string,
  seen: Set<string>,
  clientSeen: Set<string>,
  out: Set<string>,
) {
  if (seen.has(file)) return;
  seen.add(file);
  const info = fileInfo(file);
  if (info.isClient) return clientNamespaces(file, clientSeen, out);
  info.deps.forEach((d) => serverWalk(d, seen, clientSeen, out));
}

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(p));
    else if (ROUTE_FILES.has(entry.name)) out.push(p);
  }
  return out;
}

function areaOf(file: string): ClientModule | "shell" {
  const rel = relative(ROOT, file);
  for (const [dir, module] of Object.entries(MODULE_DIRS)) {
    if (rel === dir || rel.startsWith(`${dir}/`)) return module;
  }
  return "shell";
}

describe("client message namespaces", () => {
  it("covers every namespace a Client Component uses in its area", () => {
    const used = new Map<ClientModule | "shell", Set<string>>();
    for (const file of routeFiles(join(ROOT, "app"))) {
      const area = areaOf(file);
      const set = used.get(area) ?? new Set<string>();
      serverWalk(file, new Set(), new Set(), set);
      used.set(area, set);
    }

    const missing: string[] = [];
    for (const [area, namespaces] of used) {
      const provided = new Set<string>(
        area === "shell" ? SHELL_NAMESPACES : moduleNamespaces(area),
      );
      for (const ns of namespaces) {
        if (!provided.has(ns)) missing.push(`${area}: ${ns}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("only lists namespaces that exist in both locales", () => {
    const all = [
      ...SHELL_NAMESPACES,
      ...Object.values(MODULE_NAMESPACES).flat(),
    ];
    for (const ns of all) {
      expect(vi).toHaveProperty([ns]);
      expect(en).toHaveProperty([ns]);
    }
  });
});

describe("pickMessages", () => {
  it("keeps only the requested top-level namespaces", () => {
    const messages = { A: { x: "1" }, B: { y: "2" }, C: "3" };
    expect(pickMessages(messages, ["A", "C", "Missing"])).toEqual({
      A: { x: "1" },
      C: "3",
    });
  });
});

describe("moduleNamespaces", () => {
  it("includes the shell namespaces once", () => {
    const list = moduleNamespaces("documents");
    for (const ns of SHELL_NAMESPACES) expect(list).toContain(ns);
    expect(new Set(list).size).toBe(list.length);
  });
});
