/* eslint-disable @typescript-eslint/dot-notation */
import { castArray, pickBy, isNil, isString, isPlainObject } from "lodash";
import { IContext, IOptions } from "../interface";
import { readFile } from "./utils/fs";
import { getNpmFile } from "./version/npm";
import { validatePlugin, parseConfig } from "./plugins/utils";
import cosmiconfig from "cosmiconfig";
import resolveFrom from "resolve-from";
import envCi from "@spmeesseman/env-ci";
// const plugins = require("./plugins");
const PLUGINS_DEFINITIONS = require("./definitions/plugins");

export = getConfig;


async function getConfig(context: IContext, opts: IOptions)
{
    let configName = "publishrc",
        configFiles: string[];

    if (opts.configName)
    {
        configName = "publishrc." + opts.configName;
        configFiles = [
            "package.json",
            `.${configName}.json`,
            `.${configName}.yaml`,
            `.${configName}.yml`,
            `.${configName}.js`
        ];
    }
    else
    {
        configFiles = [
            "package.json",
            `.${configName}`,
            `.${configName}.json`,
            `.${configName}.yaml`,
            `.${configName}.yml`,
            `.${configName}.js`
        ];
    }

    const { cwd, env } = context;
    const { config, filepath } = (await cosmiconfig(configName, { searchPlaces: configFiles }).search(cwd)) || { config: {}, filepath: "" };

    // Merge config file options and CLI/API options
    let options = { ...config, ...opts };
    if (options.ci === false)
    {
        options.noCi = true;
    }

    options.configFilePath = filepath;

    const pluginsPath = { path: undefined };
    let extendPaths;
    // eslint-disable-next-line prefer-const
    ({ extends: extendPaths, ...options } = options);

    if (extendPaths)
    {   //
        // If `extends` is defined, load and merge each shareable config with `options`
        //
        options = {
            ...castArray(extendPaths).reduce((result, extendPath) =>
            {
                const extendsOpts = require(resolveFrom.silent(__dirname, extendPath) || resolveFrom(cwd, extendPath));
                //
                // For each plugin defined in a shareable config, save in `pluginsPath` the extendable
                // config path, so those plugin will be loaded relatively to the config file
                //
                Object.entries(extendsOpts)
                .filter(([, value]) => Boolean(value))
                .reduce((pluginsPath, [option, value]) =>
                {
                    castArray(value).forEach(plugin =>
                    {
                        if (option === "plugins" && validatePlugin(plugin))
                        {
                            pluginsPath[parseConfig(plugin)[0]] = extendPath;
                        }
                        // eslint-disable-next-line dot-notation
                        else if (PLUGINS_DEFINITIONS[option] && (isString(plugin) || (isPlainObject(plugin) && isString(plugin["path"]))))
                        {
                            // eslint-disable-next-line dot-notation
                            pluginsPath[isString(plugin) ? plugin : plugin["path"]] = extendPath;
                        }
                    });
                    return pluginsPath;
                }, pluginsPath);

                return { ...result, ...extendsOpts };
            }, {}),
            ...options,
        };
    }

    //
    // Set default options values if not defined yet
    //
    options = {
        branch: (await defBranch(context)),
        repo: (await pkgRepoUrl(context)), // || (await repoUrl(context)),
        repoType: (await pkgRepoType(context)),
        // eslint-disable-next-line no-template-curly-in-string
        tagFormat: "v${version}",
        plugins: [],
        // Remove `null` and `undefined` options so they can be replaced with default ones
        ...pickBy(options, option => !isNil(option)),
    };

    //
    // Replace environment variables
    //
    // Environment variables in .publishconfig should be in the form:
    //
    //     ${VARIABLE_NAME}
    //
    let optStr = JSON.stringify(options);
    for (const key in process.env)
    {
        const envVar = "[$][{]\\b" + key + "\\b[}]";
        optStr = optStr.replace(new RegExp(envVar, "gmi"), process.env[key].replace(/\\/g, "\\\\"));
    }
    options = JSON.parse(optStr);

    options.ciInfo = envCi({ env, cwd, repoType: options.repoType });

    //
    // TODO - plugins maybe?
    //
    return { options, plugins: [] };
    // return { options, plugins: await plugins({ ...context, options }, pluginsPath) };
}



async function pkgRepoUrl(context: IContext)
{
    const { logger, cwd } = context;
    let pkg: any = await getNpmFile({ options: { projectFileNpm: undefined, projectName: undefined }, logger, cwd });
    pkg = pkg ? JSON.parse(await readFile(pkg)) : undefined;
    return !pkg ? undefined : (pkg && pkg.repository ? pkg.repository.url : pkg.repository);
}


async function pkgRepoType(context: IContext)
{
    const { logger, cwd } = context;
    let pkg: any = await getNpmFile({ options: { projectFileNpm: undefined, projectName: undefined }, logger, cwd });
    pkg = pkg ? JSON.parse(await readFile(pkg)) : undefined;
    return !pkg ? "git" : (pkg && pkg.repository ? pkg.repository.type : "git");
}


async function defBranch(context: IContext)
{
    const { logger, cwd } = context;
    let pkg: any = await getNpmFile({ options: { projectFileNpm: undefined, projectName: undefined }, logger, cwd });
    pkg = pkg ? JSON.parse(await readFile(pkg)) : undefined;
    return !pkg ? "main" : (pkg && pkg.repository ? (pkg.repository.type === "git" ? "main" : "trunk") : "main");
}
