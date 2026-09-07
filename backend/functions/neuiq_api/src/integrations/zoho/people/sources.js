/**
 * What may be asked of Zoho People through the query DSL.
 *
 * Lifted out of the `SOURCES` literal in dashboards/query.service.js. The definitions are
 * unchanged — same keys, same group and numeric field lists, same scope functions — so every
 * saved widget and every assertion keeps working. What changed is only that they now live with
 * the product they describe, and are handed to the engine at boot instead of being hardcoded in
 * it.
 *
 * Two properties carried over exactly:
 *
 *  - **`scope(employeeId)` returns the filter that pins a source to one person.** A source whose
 *    scope is `null` has no owner, and therefore no safe slice — so it is admin-only by
 *    construction rather than by remembering to add a flag.
 *  - **`rows()` is how the engine gets records.** It replaces the engine's direct import of the
 *    seed. In Phase 3 this becomes a client call and no engine code changes.
 *
 * Keys are deliberately NOT namespaced yet. Namespacing (`leave` -> `people.leave`) breaks every
 * saved widget and needs the specVersion migration, which is Phase 6.
 */
import { dataset } from './dataset.js';

export const PEOPLE_SOURCES = {
  leave: {
    label: 'Leave records',
    group: ['month', 'leaveType', 'status', 'departmentId'],
    numeric: ['days'],
    scope: (employeeId) => ({ field: 'employeeId', op: 'eq', value: employeeId }),
    rows: () => dataset.leave,
  },
  attendance: {
    label: 'Attendance',
    group: ['month', 'status', 'departmentId'],
    numeric: ['hours', 'lateMinutes'],
    scope: (employeeId) => ({ field: 'employeeId', op: 'eq', value: employeeId }),
    rows: () => dataset.attendance,
  },
  employees: {
    label: 'Employees',
    group: ['department', 'location', 'designation', 'employmentType'],
    numeric: ['tenureMonths'],
    scope: null,
    adminOnly: true,
    rows: () => dataset.employees,
  },
};
