import { getConfig } from './config.js';
import { getAccessToken } from './oauth.js';

export type Role = 'self' | 'manager' | 'admin';

export interface Employee {
  id: number;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  is_active: 'Y' | 'N';
  is_admin: 'Y' | 'N';
  is_pto_admin: 'Y' | 'N';
  pto_hours: number;
  role: Role;
}

export interface Project {
  id: number;
  project_abbr: string | null;
  name: string;
  description: string | null;
  client_id: number | null;
  status: number | null;
  project_cycle_id: number;
  project_manager_id: number | null;
  project_owner_id: number | null;
  budget_hours: number | null;
}

export interface Task {
  id: number;
  name: string | null;
  project_id: number | null;
  parent_task_id: number | null;
  billable: string | null;
}

export interface TimesheetEntry {
  id: number;
  date: string;
  hours: number;
  notes: string | null;
  task_id: number;
  project_resource_id: number;
  period_id: number | null;
}

export interface CollectionEnvelope<T> {
  items: T[];
  hasMore: boolean;
  limit: number;
  offset: number;
  count: number;
}

export class ApiError extends Error {
  status: number;
  detail: string | undefined;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = getConfig();
  const token = await getAccessToken();
  const url = `${cfg.api_base.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { title?: string; detail?: string; message?: string };
      detail = j.detail ?? j.title ?? j.message ?? '';
    } catch {
      detail = await res.text();
    }
    throw new ApiError(res.status, `${method} ${path} → ${res.status}`, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Manager-mode: every read endpoint that scopes to an employee accepts an
// optional `for` (server-side bind: `for_upn`). The ORDS gate in
// scrumtm.api_caller_role enforces that only managers/admins can target an
// employee other than themselves; the client just threads the value through.
function appendForUpn(qs: URLSearchParams, opts: { for?: string }): void {
  if (opts.for) qs.set('for_upn', opts.for);
}

export const api = {
  me: (opts: { for?: string } = {}) => {
    const qs = new URLSearchParams();
    appendForUpn(qs, opts);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<Employee>('GET', `/me${suffix}`);
  },

  projects(
    params: { mine?: boolean; active?: boolean; q?: string; abbr?: string; for?: string } = {},
  ) {
    // ORDS reserves the `q` query parameter for its own JSON-filter syntax, so
    // we send our name-substring filter as `search=`. CLI flag stays `-q`.
    const qs = new URLSearchParams();
    if (params.mine) qs.set('mine', '1');
    if (params.active) qs.set('active', '1');
    if (params.q) qs.set('search', params.q);
    if (params.abbr) qs.set('abbr', params.abbr);
    appendForUpn(qs, params);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<CollectionEnvelope<Project>>('GET', `/projects${suffix}`);
  },

  async project(idOrAbbr: string | number): Promise<Project> {
    // Always resolve to a numeric id, then call the single-item endpoint.
    // The list endpoint returns a thinner row shape; the single-item
    // endpoint is the one that carries the resolved labels (client_name,
    // status_label, cycle_label, manager_name, owner_name). Without this
    // normalisation an abbr lookup silently bypasses the richer shape.
    let id: number;
    if (typeof idOrAbbr === 'number' || /^\d+$/.test(String(idOrAbbr))) {
      id = Number(idOrAbbr);
    } else {
      const env = await api.projects({ abbr: String(idOrAbbr) });
      const found = env.items[0];
      if (!found) throw new ApiError(404, 'project not found', `no project with abbr=${idOrAbbr}`);
      id = found.id;
    }
    return request<Project>('GET', `/projects/${id}`);
  },

  tasks: (projectId: number) =>
    request<CollectionEnvelope<Task>>('GET', `/projects/${projectId}/tasks`),

  timesheets(
    params: {
      from?: string;
      to?: string;
      project_id?: number;
      task_id?: number;
      for?: string;
    } = {},
  ) {
    // Server-side bind names use dt_from / dt_to (avoiding the SQL keyword `from`).
    const qs = new URLSearchParams();
    if (params.from) qs.set('dt_from', params.from);
    if (params.to) qs.set('dt_to', params.to);
    if (params.project_id) qs.set('project_id', String(params.project_id));
    if (params.task_id) qs.set('task_id', String(params.task_id));
    appendForUpn(qs, params);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<CollectionEnvelope<TimesheetEntry>>('GET', `/timesheets${suffix}`);
  },

  employees(params: { q?: string; include_inactive?: boolean } = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('search', params.q);
    if (params.include_inactive) qs.set('include_inactive', '1');
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<CollectionEnvelope<Employee>>('GET', `/employees${suffix}`);
  },

  logTime: (entry: { task_id: number; hours: number; input_date: string; notes?: string }) =>
    request<TimesheetEntry>('POST', '/timesheets', entry),

  editTime: (id: number, patch: Partial<{ hours: number; notes: string; input_date: string }>) =>
    request<TimesheetEntry>('PATCH', `/timesheets/${id}`, patch),

  deleteTime: (id: number) => request<void>('DELETE', `/timesheets/${id}`),

  requestPto: (body: {
    start_date: string;
    end_date?: string;
    hour_range_id?: 13 | 14;
    type_id?: number;
    count_weekends?: boolean;
    reason?: string;
  }) =>
    request<{
      request_id: number;
      employee_id: number;
      status_id: number;
      status_label: string;
      type_id: number;
      type_label: string;
      hour_range_id: number;
      hour_range_label: string;
      start_date: string;
      end_date: string;
      days_inserted: number;
      days: string[];
      reason: string | null;
    }>('POST', '/pto/request', body),

  ptoRequests(params: {
    status?: string;        // CSV of status ids; default = pending (41,42)
    all?: boolean;
    for?: string;           // requestor filter (manager-only if ≠ caller)
    approver?: string;      // approver filter (manager-only if ≠ caller)
    mine?: boolean;         // alias for approver=caller
  } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.all) qs.set('all', '1');
    if (params.for) qs.set('for_upn', params.for);
    if (params.approver) qs.set('approver_upn', params.approver);
    if (params.mine) qs.set('mine', '1');
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<CollectionEnvelope<PtoRequestSummary>>('GET', `/pto/requests${suffix}`);
  },

  ptoRequest: (id: number) => request<PtoRequestDetail>('GET', `/pto/requests/${id}`),

  approvePto: (id: number, body: { note?: string } = {}) =>
    request<PtoRequestActionResult>('POST', `/pto/requests/${id}/approve`, body),

  declinePto: (id: number, body: { note?: string } = {}) =>
    request<PtoRequestActionResult>('POST', `/pto/requests/${id}/decline`, body),

  reportProject: (projectId: number) =>
    request<ProjectReport>('GET', `/reports/project/${projectId}`),

  reportTeam(params: { week?: string; for?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.week) qs.set('week', params.week);
    if (params.for) qs.set('for_upn', params.for);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<TeamReport>('GET', `/reports/team${suffix}`);
  },
};

export interface PtoRequestSummary {
  id: number;
  employee_id: number;
  employee_username: string | null;
  employee_name: string | null;
  request_date: string;
  start_date: string;
  end_date: string;
  request_type_id: number;
  type_label: string | null;
  status_id: number;
  status_label: string | null;
  approval_employee_id: number | null;
  approver_username: string | null;
  approver_name: string | null;
  count_weekends: 'Y' | 'N' | null;
  days_count: number;
  approved_dt: string | null;
  created_at: string;
  updated_at: string;
}

export interface PtoRequestDetail extends PtoRequestSummary {
  days: Array<{
    id: number;
    date: string;
    hour_range_id: number;
    hour_range_label: string | null;
  }>;
  notes: Array<{
    id: number;
    note: string;
    author_id: number;
    author_username: string | null;
    created_at: string;
  }>;
}

export interface PtoRequestActionResult {
  id: number;
  status_id: number;
  status_label: string;
  approval_employee_id?: number;
  note_added?: 'true' | 'false';
  idempotent?: 'true';
}

export interface ProjectReport {
  project_id: number;
  project_abbr: string | null;
  name: string;
  description: string | null;
  client_name: string | null;
  status_label: string | null;
  cycle_label: string | null;
  manager_name: string | null;
  owner_name: string | null;
  budget_hours: number | null;
  budget_cost: number | null;
  total_hours: number;
  mtd_hours: number;
  wtd_hours: number;
  remaining_hours?: number;
  pct_of_budget?: number;
  resources: Array<{
    employee_id: number;
    username: string | null;
    name: string | null;
    is_active: 'Y' | 'N';
    total_hours: number;
    mtd_hours: number;
    wtd_hours: number;
  }>;
}

export interface TeamReport {
  week_start: string;
  week_end: string;
  total_hours: number;
  employees: Array<{
    employee_id: number;
    username: string | null;
    name: string | null;
    week_hours: number;
    by_project: Array<{
      project_id: number;
      project_abbr: string | null;
      name: string | null;
      hours: number;
    }>;
  }>;
}
