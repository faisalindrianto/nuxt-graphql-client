import type { GqlClients, GqlFunc } from '#build/gql';
import { getSdk as gqlSdk } from '#build/gql-sdk';
import { useAsyncData } from '#imports';
import type { AsyncData } from 'nuxt/dist/app/composables';
import type { GqlError, OnGqlError } from '../../types';
/**
 * `useGqlHeaders` allows you to set headers for all subsequent requests.
 *
 * @param {object} headers
 * @param {string} client
 *
 * @example
 * - Set headers for default client
 * ```ts
 * useGqlHeaders({ 'X-Custom-Header': 'Custom Value' })
 * ```
 *
 * - Set headers for a specific client (multi-client mode)
 * ```ts
 * useGqlHeaders({'X-Custom-Header': 'Custom Value'}, 'my-client')
 * ```
 *
 * - Reset headers for a specific client
 * ```ts
 * useGqlHeaders(null, 'my-client')
 * ```
 * */
export declare function useGqlHeaders(headers: Record<string, string>, client?: GqlClients): void;
export declare function useGqlHeaders(opts: {
    headers: Record<string, string>;
    client?: GqlClients;
    respectDefaults?: boolean;
}): void;
interface GqlTokenConfig {
    /**
     * The name of the Authentication token header.
     *
     * @default 'Authorization'
     * */
    name?: string;
    /**
     * The HTTP Authentication scheme.
     *
     * @default "Bearer"
     * */
    type?: string;
}
declare type GqlTokenOptions = {
    /**
     * Configure the auth token
     *
     * @default
     * `{ type: 'Bearer', name: 'Authorization' }`
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
     * */
    config?: GqlTokenConfig;
    /**
     * The name of your GraphQL clients.
     * @note defined in `nuxt.config`
     * */
    client?: GqlClients;
};
/**
 * `useGqlToken` adds an Authorization header to every request.
 *
 * @param {string} token The token to be used for authentication
 * @param {object} opts Options for the auth token
 * */
export declare function useGqlToken(token: string, opts?: GqlTokenOptions): void;
/**
 * `useGqlToken` adds an Authorization header to every request.
 *
 * @param {object} opts Options for the auth token
 * */
export declare function useGqlToken(opts: GqlTokenOptions & {
    token: string;
}): void;
interface GqlCors {
    mode?: RequestMode;
    credentials?: RequestCredentials;
    /**
     * The name of your GraphQL client.
     * @note defined in `nuxt.config`
     * */
    client?: GqlClients;
}
/**
 * `useGqlCors` adds CORS headers to every request.
 *
 * @param {object} cors Options for the CORS headers
 * */
export declare const useGqlCors: (cors: GqlCors) => void;
export declare const useGql: () => {
    handle: (client?: GqlClients) => ReturnType<typeof gqlSdk>;
};
/**
 * `useGqlError` captures GraphQL Errors.
 *
 * @param {OnGqlError} onError Gql error handler
 *
 * @example <caption>Log error to console.</caption>
 * ```ts
 * useGqlError((err) => {
 *    console.error(err)
 * })
 * ```
 * */
export declare const useGqlError: (onError: OnGqlError) => void;
/**
 * Asynchronously query data that is required to load a page or component.
 *
 * @param {Object} options
 * @param {string} options.operation Name of the query to be executed.
 * @param {string} options.variables Variables to be passed to the query.
 * @param {Object} options.options AsyncData options.
 */
export declare function useAsyncGql<T extends keyof GqlFunc, P extends Parameters<GqlFunc[T]>['0'], R extends AsyncData<Awaited<ReturnType<GqlFunc[T]>>, GqlError>, O extends Parameters<typeof useAsyncData>['2']>(options: {
    operation: T;
    variables?: P;
    options?: O;
}): Promise<R>;
/**
 * Asynchronously query data that is required to load a page or component.
 *
 * @param {string} operation Name of the query to be executed.
 * @param {string} variables Variables to be passed to the query.
 * @param {Object} options AsyncData options.
 */
export declare function useAsyncGql<T extends keyof GqlFunc, P extends Parameters<GqlFunc[T]>['0'], R extends AsyncData<Awaited<ReturnType<GqlFunc[T]>>, GqlError>, O extends Parameters<typeof useAsyncData>['2']>(operation: T, variables?: P, options?: O): Promise<R>;
export {};
