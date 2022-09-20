import { promises, existsSync, statSync } from 'fs';
import { defu } from 'defu';
import { useLogger, defineNuxtModule, createResolver, addTemplate, addPlugin, extendViteConfig, resolveFiles } from '@nuxt/kit';
import { generate as generate$1 } from '@graphql-codegen/cli';
import * as PluginTS from '@graphql-codegen/typescript';
import * as PluginTSOperations from '@graphql-codegen/typescript-operations';
import * as PluginTSGraphqlRequest from '@graphql-codegen/typescript-graphql-request';
import { parse } from 'graphql';
import { upperFirst } from 'scule';

const name = "nuxt-graphql-client";
const version = "0.1.11";

function pluginLoader(name) {
  if (name === "@graphql-codegen/typescript") {
    return Promise.resolve(PluginTS);
  }
  if (name === "@graphql-codegen/typescript-operations") {
    return Promise.resolve(PluginTSOperations);
  }
  if (name === "@graphql-codegen/typescript-graphql-request") {
    return Promise.resolve(PluginTSGraphqlRequest);
  }
}
function prepareConfig(options) {
  const schema = Object.values(options.clients).map((v) => {
    if (v.schema) {
      return v.schema;
    }
    if (!v?.token?.value) {
      return v.host;
    }
    const token = `${v?.token?.type} ${v?.token?.value}`.trim();
    return { [v.host]: { headers: { ...v?.headers && { ...v.headers }, [v?.token?.name]: token } } };
  });
  return {
    schema,
    pluginLoader,
    silent: options.silent,
    documents: options.documents,
    generates: {
      [options.file]: {
        plugins: options.plugins,
        config: {
          skipTypename: true,
          useTypeImports: true,
          gqlImport: "graphql-request#gql",
          onlyOperationTypes: options.onlyOperationTypes,
          namingConvention: {
            enumValues: "change-case-all#upperCaseFirst"
          }
        }
      }
    }
  };
}
async function generate(options) {
  const config = prepareConfig(options);
  return await generate$1(config, false).then(([{ content }]) => content);
}

const deepmerge = (a, b) => {
  const result = { ...a };
  for (const key in b) {
    if (typeof b[key] === "object" && b[key] !== null) {
      result[key] = deepmerge(result[key] || {}, b[key]);
    } else {
      result[key] = b[key];
    }
  }
  return result;
};

function prepareContext(ctx, prefix) {
  ctx.fns = ctx.template?.match(/\w+\s*(?=\(variables)/g)?.sort() || [];
  const fnName = (fn) => prefix + upperFirst(fn);
  const fnExp = (fn, typed = false) => {
    const name = fnName(fn);
    if (!typed) {
      const client = ctx?.clients.find((c) => ctx?.clientOps?.[c]?.includes(fn));
      return `export const ${name} = (...params) => GqlInstance().handle(${client ? `'${client}'` : ""})['${fn}'](...params)`;
    }
    return `  export const ${name}: (...params: Parameters<GqlFunc['${fn}']>) => ReturnType<GqlFunc['${fn}']>`;
  };
  ctx.generateImports = () => [
    "import { useGql } from '#imports'",
    "const ctx = { instance: null }",
    "export const GqlInstance = () => {",
    " if (!ctx?.instance) {ctx.instance = useGql()}",
    " return ctx.instance",
    "}",
    `export const GqlOperations = ${JSON.stringify(ctx.clientOps)}`,
    ...ctx.fns.map((f) => fnExp(f))
  ].join("\n");
  ctx.generateDeclarations = () => [
    "declare module '#build/gql' {",
    `  type GqlClients = '${ctx.clients.join("' | '") || "default"}'`,
    "  type GqlFunc = ReturnType<ReturnType<typeof import('#imports')['useGql']>['handle']>",
    ...ctx.fns.map((f) => fnExp(f, true)),
    "}"
  ].join("\n");
  ctx.fnImports = ctx.fns.map((fn) => ({
    name: fnName(fn),
    from: "#build/gql"
  }));
}
async function prepareOperations(ctx, path) {
  const scanFile = async (file) => {
    let clientToUse;
    const reExt = new RegExp(`\\.(${ctx.clients.join("|")})\\.(gql|graphql)$`);
    if (reExt.test(file)) {
      clientToUse = reExt.exec(file)?.[1];
    }
    const fileName = file.split("/").pop().replace(/\./g, "\\.");
    const reDir = new RegExp(`\\/(${ctx.clients.join("|")})\\/(?=${fileName})`);
    if (!clientToUse && reDir.test(file)) {
      clientToUse = reDir.exec(file)?.[1];
    }
    const { definitions } = parse(await promises.readFile(file, "utf8"));
    const operations = definitions.map(({ name }) => {
      if (!name?.value) {
        throw new Error(`Operation name missing in: ${file}`);
      }
      return name.value;
    });
    for (const op of operations) {
      clientToUse = new RegExp(`^(${ctx.clients.join("|")})(?=\\_)`).exec(op)?.[0] || clientToUse;
      if (!clientToUse || !ctx.clientOps?.[clientToUse]) {
        clientToUse = clientToUse || ctx.clients.find((c) => c === "default") || ctx.clients[0];
      }
      const operationName = op.replace(`${clientToUse}_`, "").replace(op.split("_")[0] + "_", "");
      if (!ctx.clientOps?.[clientToUse]?.includes(operationName)) {
        ctx.clientOps[clientToUse].push(operationName);
      }
    }
  };
  for (const file of path) {
    await scanFile(file);
  }
}
function prepareTemplate(ctx) {
  const toPSCase = (s) => s.split("_").map(upperFirst).join("_");
  const oust = (from, to) => ctx.template.replace(new RegExp(from, "g"), to).replace(new RegExp(toPSCase(from), "g"), toPSCase(to));
  for (const [client, ops] of Object.entries(ctx.clientOps)) {
    if (!ops?.length) {
      continue;
    }
    for (const op of ops) {
      const originalName = `${client}_${op}`;
      const [basic, special] = [op, originalName].map((n) => new RegExp(`\\s${n}\\s*(?=\\(variables)`, "g").test(ctx.template));
      if (basic) {
        continue;
      }
      if (special) {
        ctx.template = oust(originalName, op);
        continue;
      }
      if (!basic && !special) {
        const reInvalid = new RegExp(`\\w+_(${op})\\s*(?=\\(variables)`);
        if (!reInvalid.test(ctx.template)) {
          continue;
        }
        const [invalidName, opName] = reInvalid.exec(ctx.template);
        ctx.template = oust(invalidName, opName);
        continue;
      }
    }
  }
}

const logger = useLogger("nuxt-graphql-client");
const module = defineNuxtModule({
  meta: {
    name,
    version,
    configKey: "graphql-client",
    compatibility: {
      nuxt: "3.0.0-rc.3"
    }
  },
  defaults: {
    clients: {},
    watch: true,
    silent: true,
    autoImport: true,
    functionPrefix: "Gql",
    onlyOperationTypes: true
  },
  async setup(opts, nuxt) {
    const resolver = createResolver(import.meta.url);
    const srcResolver = createResolver(nuxt.options.srcDir);
    nuxt.options.build.transpile.push(resolver.resolve("runtime"));
    const ctx = { clients: [], clientOps: {} };
    const config = defu(
      {},
      nuxt.options.runtimeConfig.public["graphql-client"],
      nuxt.options.runtimeConfig.public.gql,
      opts
    );
    ctx.clients = Object.keys(config.clients);
    if (!ctx?.clients?.length) {
      const host = process.env.GQL_HOST || nuxt.options.runtimeConfig.public.GQL_HOST;
      const clientHost = process.env.GQL_CLIENT_HOST || nuxt.options.runtimeConfig.public.GQL_CLIENT_HOST;
      if (!host) {
        throw new Error("GQL_HOST is not set in public runtimeConfig");
      }
      ctx.clients = ["default"];
      config.clients = !clientHost ? { default: host } : { default: { host, clientHost } };
    }
    nuxt.options.runtimeConfig["graphql-client"] = { clients: {} };
    nuxt.options.runtimeConfig.public["graphql-client"] = defu(nuxt.options.runtimeConfig.public["graphql-client"], { clients: {} });
    for (const [k, v] of Object.entries(config.clients)) {
      const runtimeHost = k === "default" ? process.env.GQL_HOST : process.env?.[`GQL_${k.toUpperCase()}_HOST`];
      const runtimeClientHost = k === "default" ? process.env.GQL_CLIENT_HOST : process.env?.[`GQL_${k.toUpperCase()}_CLIENT_HOST`];
      const host = runtimeHost || (typeof v === "string" ? v : v?.host);
      const clientHost = runtimeClientHost || typeof v !== "string" && v.clientHost;
      if (!host) {
        throw new Error(`GraphQL client (${k}) is missing it's host.`);
      }
      const runtimeToken = k === "default" ? process.env.GQL_TOKEN : process.env?.[`GQL_${k.toUpperCase()}_TOKEN`];
      const token = runtimeToken || typeof v !== "string" && (typeof v?.token === "object" && v.token?.value || typeof v?.token === "string" && v.token);
      const runtimeTokenName = k === "default" ? process.env.GQL_TOKEN_NAME : process.env?.[`GQL_${k.toUpperCase()}_TOKEN_NAME`];
      const tokenName = runtimeTokenName || typeof v !== "string" && typeof v?.token === "object" && v.token.name || "Authorization";
      const tokenType = typeof v !== "string" && typeof v?.token === "object" && v?.token?.type !== void 0 ? v?.token?.type : "Bearer";
      const schema = typeof v !== "string" && v?.schema && srcResolver.resolve(v.schema);
      if (schema && !existsSync(schema)) {
        logger.warn(`[nuxt-graphql-client] The Schema provided for the (${k}) GraphQL Client does not exist. \`host\` will be used as fallback.`);
      }
      const conf = {
        ...typeof v !== "string" && { ...v },
        host,
        ...clientHost && { clientHost },
        ...schema && existsSync(schema) && { schema },
        token: {
          ...token && { value: token },
          ...tokenName && { name: tokenName },
          type: typeof tokenType !== "string" ? "" : tokenType
        },
        proxyCookies: (typeof v !== "string" && v?.proxyCookies) ?? true
      };
      ctx.clientOps[k] = [];
      config.clients[k] = deepmerge({}, conf);
      nuxt.options.runtimeConfig.public["graphql-client"].clients[k] = deepmerge({}, conf);
      if (conf.token?.value) {
        nuxt.options.runtimeConfig["graphql-client"].clients[k] = { token: conf.token };
        if (!(typeof v !== "string" && v?.retainToken)) {
          nuxt.options.runtimeConfig.public["graphql-client"].clients[k].token.value = void 0;
        }
      }
    }
    const documentPaths = [srcResolver.resolve()];
    if (config.documentPaths) {
      for (const path of config.documentPaths) {
        const dir = srcResolver.resolve(path);
        if (existsSync(dir)) {
          documentPaths.push(dir);
        } else {
          logger.warn(`[nuxt-graphql-client] Invalid document path: ${dir}`);
        }
      }
    }
    const gqlMatch = "**/*.{gql,graphql}";
    async function generateGqlTypes() {
      const documents = [];
      for await (const path of documentPaths) {
        const files = (await resolveFiles(path, [gqlMatch, "!**/schemas"])).filter(allowDocument);
        documents.push(...files);
      }
      const plugins = ["typescript"];
      if (documents?.length) {
        plugins.push("typescript-operations", "typescript-graphql-request");
      }
      ctx.template = await generate({
        clients: config.clients,
        file: "gql-sdk.ts",
        silent: config.silent,
        plugins,
        documents,
        onlyOperationTypes: config.onlyOperationTypes,
        resolver: srcResolver
      });
      if (Object.keys(config.clients).length > 1 || !config.clients?.default) {
        prepareTemplate(ctx);
      }
      await prepareOperations(ctx, documents);
      prepareContext(ctx, config.functionPrefix);
    }
    addTemplate({
      write: true,
      filename: "gql-sdk.ts",
      getContents: () => ctx.template
    });
    addPlugin(resolver.resolve("runtime/plugin"));
    if (config.autoImport) {
      addTemplate({
        filename: "gql.mjs",
        getContents: () => ctx.generateImports()
      });
      addTemplate({
        filename: "gql.d.ts",
        getContents: () => ctx.generateDeclarations()
      });
      nuxt.hook("autoImports:extend", (autoimports) => {
        autoimports.push(...ctx.fnImports);
      });
      nuxt.hook("autoImports:dirs", (dirs) => {
        if (!ctx.template.includes("export function getSdk")) {
          return;
        }
        dirs.push(resolver.resolve("runtime/composables"));
      });
    }
    const allowDocument = (f) => !!statSync(srcResolver.resolve(f)).size;
    if (config.watch) {
      nuxt.hook("builder:watch", async (event, path) => {
        if (!path.match(/\.(gql|graphql)$/)) {
          return;
        }
        if (event !== "unlink" && !allowDocument(path)) {
          return;
        }
        const start = Date.now();
        await generateGqlTypes();
        await nuxt.callHook("builder:generateApp");
        const time = Date.now() - start;
        logger.success(`[GraphQL Client]: Generation completed in ${time}ms`);
      });
    }
    await generateGqlTypes();
    extendViteConfig((config2) => {
      config2.optimizeDeps?.include?.push("graphql-request");
    });
  }
});

export { module as default };
