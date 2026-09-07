/**
 * The Zoho People API client.
 *
 * Three methods, one per confirmed endpoint. Paths and parameter names come from endpoints.js,
 * which records what has actually returned 200; dates convert through transformers/dates.js; and
 * envelopes unwrap through transformers/envelope.js. Nothing here builds a URL by hand or formats
 * a date inline, because those are the two things that fail silently.
 *
 * Each method returns RAW rows. Field mapping is the transformers' job and is kept separate so
 * that a module with no observed field names — attendance — can still have a working request path.
 */
import { createZohoClient } from '../_shared/client.js';
import { endpoint, dataSelectFor } from './endpoints.js';
import { dateRangeParams } from './transformers/dates.js';
import { unwrapV3, unwrapForms } from './transformers/envelope.js';

export function createPeopleClient({ dc, tokenProvider, fetchImpl, logger, requestId = null }) {
  const http = createZohoClient({ product: 'people', dc, tokenProvider, fetchImpl, logger });

  return {
    /**
     * Employee form records.
     *
     * Throws until the forms wrapper path is confirmed — see envelope.js. The request itself is
     * correct; it is the response that cannot be read yet, and failing here is better than
     * returning an empty employee list that reads as "this org has no employees".
     */
    async employees({ signal } = {}) {
      const ep = endpoint('people.employee.records');
      const body = await http.get(ep.path, { signal, requestId });
      return unwrapForms(body).rows;
    },

    /**
     * Leave records in a date range.
     *
     * `data_select` comes from dataSelectFor(), which returns ALL under the service-account model
     * — see the warning there. Scoping to the caller happens in core/policy/scope.js, and with
     * ALL there is no second fence behind it.
     */
    async leaves({ from, to, user, signal }) {
      const ep = endpoint('people.leave.list');
      const body = await http.get(ep.path, {
        params: { ...dateRangeParams(from, to), data_select: dataSelectFor(user) },
        signal,
        requestId,
      });
      return unwrapV3(body).rows;
    },

    /**
     * Attendance entries for one employee.
     *
     * The request layer is complete and validated. Callers get raw rows; transforming them is not
     * possible yet (transformers/attendance.js) because no non-empty response has been seen.
     *
     * `employeeEmailId` is required by the endpoint, and it is the reason the identity chain needs
     * an email: leave addresses employees by erecno, attendance by email, and nothing joins the
     * two without the employee record.
     */
    async attendanceEntries({ employeeEmailId, from, to, signal }) {
      if (!employeeEmailId) {
        const e = new Error('attendance: employee_email_id is required by this endpoint');
        e.status = 400;
        throw e;
      }
      const ep = endpoint('people.attendance.entries');
      const body = await http.get(ep.path, {
        params: { employee_email_id: employeeEmailId, ...dateRangeParams(from, to) },
        signal,
        requestId,
      });
      return unwrapV3(body).rows;
    },
  };
}
