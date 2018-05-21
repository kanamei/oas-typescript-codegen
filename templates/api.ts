import axios, { AxiosPromise } from 'axios'

import { BaseAPI } from './base'
export * from './base'

/* {{ <%= imports.join('\n') %> }} */

/* {{ <%= exports.join('\n') %> }} */

/* {{ export const definitions = <%= definitions %> }} */

export class API extends BaseAPI {
/* {{ <%= endpoints.map((endpoint) => template('./endpoint.ts', endpoint)).join('\n').trimRight() %> }} */
}
