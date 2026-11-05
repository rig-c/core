export type StepSelector = string | { name: string };
export interface PublicationReader {
  job: string;
  step: StepSelector;
  verdictStep: string;
  declaration: string;
}
export type PublicationInvocation = { ordinal: number; kind: 'folder' } | {
  ordinal: number; kind: 'tarball';
  producer: { step: StepSelector; variable: string; command: string };
};
export const PUBLISH_LIFECYCLE_HOOKS: readonly string[];
export function validatePublications(workflow: unknown, jobs: Record<string, unknown>, scripts: Record<string, unknown>, read: (path: string) => string, compileCoverage: (declaration: unknown, read: (path: string) => string, declarationPath?: string) => unknown, context?: unknown): string[];

export function selectStep(all: Record<string, unknown>[], selector: StepSelector): Record<string, unknown> | undefined;
