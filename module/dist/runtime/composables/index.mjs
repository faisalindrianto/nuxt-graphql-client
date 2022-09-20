import { hash } from "ohash";
import { GqlOperations, GqlInstance } from "#build/gql";
import { getSdk as gqlSdk } from "#build/gql-sdk";
import { useState, useNuxtApp, useAsyncData, useRuntimeConfig } from "#imports";
import { deepmerge } from "../utils.mjs";
const useGqlState = () => {
  const nuxtApp = useNuxtApp();
  return nuxtApp?._gqlState;
};
const setGqlState = ({ client = "default", patch }) => {
  const state = useGqlState();
  const reset = !Object.keys(patch).length;
  const partial = !reset && Object.keys(patch).some((key) => typeof patch[key] !== "object" ? !patch[key] : !Object.keys(patch[key]).length || Object.keys(patch[key]).some((subKey) => !patch[key][subKey]));
  if (reset) {
    state.value[client].options = {};
  } else if (partial) {
    for (const key in patch) {
      if (typeof patch[key] !== "object") {
        if (patch[key]) {
          state.value[client].options[key] = patch[key];
        } else if (key in state.value[client].options) {
          delete state.value[client].options[key];
        }
        continue;
      }
      if (!Object.keys(patch[key]).length && key in state.value[client].options) {
        delete state.value[client].options[key];
        continue;
      }
      for (const subKey in patch[key]) {
        if (patch[key][subKey]) {
          state.value[client].options[key][subKey] = patch[key][subKey];
        } else if (typeof state.value[client].options?.[key] === "object" && subKey in state.value[client].options?.[key]) {
          delete state.value[client].options[key][subKey];
        }
      }
    }
  } else {
    state.value[client].options = deepmerge(state.value[client].options, patch);
  }
  state.value[client].instance.options = state.value[client].options;
};
export function useGqlHeaders(...args) {
  const client = args[1] || args?.[0]?.client;
  let headers = args[0] && typeof args[0] !== "undefined" && "headers" in args[0] ? args[0].headers : args[0];
  const respectDefaults = args?.[0]?.respectDefaults;
  headers = headers || {};
  setGqlState({ client, patch: { headers } });
  if (respectDefaults && !Object.keys(headers).length) {
    const defaultHeaders = useRuntimeConfig()?.public?.["graphql-client"]?.clients?.[client || "default"]?.headers;
    setGqlState({ client, patch: { headers: defaultHeaders } });
  }
}
const DEFAULT_AUTH = { type: "Bearer", name: "Authorization" };
export function useGqlToken(...args) {
  args = args || [];
  const token = typeof args[0] === "string" ? args[0] : args?.[0]?.token;
  const client = args[0]?.client || args?.[1]?.client;
  let config = args[0]?.config || args?.[1]?.config;
  const clientConfig = useRuntimeConfig()?.public?.["graphql-client"]?.clients?.[client || "default"];
  config = {
    ...DEFAULT_AUTH,
    ...clientConfig?.token?.name && { name: clientConfig.token.name },
    ...clientConfig?.token?.type !== void 0 && { type: clientConfig.token.type },
    ...config
  };
  setGqlState({
    client,
    patch: { headers: { [config.name]: !token ? void 0 : `${config.type} ${token}`.trim() } }
  });
}
export const useGqlCors = (cors) => {
  const { mode, credentials, client } = cors || {};
  setGqlState({ client, patch: { mode, credentials } });
};
export const useGql = () => {
  const state = useGqlState();
  const errState = useGqlErrorState();
  const handle = (client) => {
    client = client || "default";
    const { instance } = state.value?.[client];
    const $gql = gqlSdk(instance, async (action, operationName, operationType) => {
      try {
        return await action();
      } catch (err) {
        errState.value = {
          client,
          operationType,
          operationName,
          statusCode: err?.response?.status,
          gqlErrors: err?.response?.errors
        };
        if (state.value.onError) {
          state.value.onError(errState.value);
        }
        throw errState.value;
      }
    });
    return { ...$gql };
  };
  return { handle };
};
export const useGqlError = (onError) => {
  useGqlState().value.onError = process.client ? onError : process.env.NODE_ENV !== "production" && ((e) => console.error("[nuxt-graphql-client] [GraphQL error]", e));
  const errState = useGqlErrorState();
  if (!errState.value) {
    return;
  }
  onError(errState.value);
};
const useGqlErrorState = () => useState("_gqlErrors", () => null);
export function useAsyncGql(...args) {
  const operation = (typeof args?.[0] !== "string" && "operation" in args?.[0] ? args[0].operation : args[0]) ?? void 0;
  const variables = (typeof args?.[0] !== "string" && "variables" in args?.[0] ? args[0].variables : args[1]) ?? void 0;
  const options = (typeof args?.[0] !== "string" && "options" in args?.[0] ? args[0].options : args[2]) ?? void 0;
  const client = Object.keys(GqlOperations).find((k) => GqlOperations[k].includes(operation)) ?? "default";
  const key = hash({ operation, client, variables });
  return useAsyncData(key, () => GqlInstance().handle(client)[operation](variables), options);
}
