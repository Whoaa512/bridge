export type Kind = "git_repo" | "directory" | "monorepo_child";
export type Classification = "public" | "internal" | "personal";
export type Severity = "critical" | "warning" | "info";

export interface BridgeSpec {
  version: string;
  scannedAt: string;
  machine: Machine;
  projects: Project[];
  infrastructure: Infrastructure;
  alerts: Alert[];
  cycle: Cycle;
}

export interface Machine {
  hostname: string;
  os: string;
  uptime: number;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  kind: Kind;
  classification: Classification;
  classificationSource: string;
  languages: string[];
  git: GitStatus | null;
  ci: CIStatus | null;
  prs: PR[];
  tasks: Task[];
  size: Size | null;
  activity: Activity | null;
  subprojects: string[];
  priority: number | null;
  flags: string[];
  errors: ScanErr[];
}

export interface GitStatus {
  branch: string;
  branches: string[];
  uncommitted: number;
  ahead: number;
  behind: number;
  stashCount: number;
  lastCommit: string;
  remoteUrl: string | null;
}

export interface CIStatus {
  status: string;
  url: string | null;
  updatedAt: string;
}

export interface PR {
  number: number;
  title: string;
  state: string;
  reviewStatus: string;
  url: string;
}

export interface Task {
  gid: string;
  name: string;
  completed: boolean;
  url: string;
}

export interface Size {
  loc: number;
  files: number;
  deps: number;
}

export interface Activity {
  lastTouch: string;
  commitsThisWeek: number;
  staleDays: number;
}

export interface ScanErr {
  source: string;
  message: string;
  at: string;
}

export interface Infrastructure {
  ports: Port[];
  docker: DockerContainer[];
  resources: Resources;
}

export interface Port {
  port: number;
  pid: number;
  process: string;
  cwd: string;
  projectId: string | null;
  url?: string;
}

export interface DockerContainer {
  containerId: string;
  image: string;
  name: string;
  status: string;
  ports: PortMap[];
  projectId: string | null;
}

export interface PortMap {
  host: number;
  container: number;
}

export interface Resources {
  cpuByProject: Record<string, number>;
  memByProject: Record<string, number>;
}

export interface Alert {
  severity: Severity;
  projectId: string | null;
  type: string;
  message: string;
  url?: string | null;
}

export interface Cycle {
  period: string;
  start: string;
  end: string;
  summary: CycleSummary;
}

export interface CycleSummary {
  commitsTotal: number;
  projectsActive: number;
  prsOpened: number;
  prsMerged: number;
  alertsNew: number;
  alertsResolved: number;
}
