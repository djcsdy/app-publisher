/* eslint-disable @typescript-eslint/dot-notation */
import { castArray, pickBy, isNil, isString, isPlainObject } from "lodash";
import { IContext, IOptions } from "../interface";
import { readFile } from "./utils/fs";
import { getNpmFile } from "./version/npm";
import cosmiconfig from "cosmiconfig";
import resolveFrom from "resolve-from";
import envCi from "@spmeesseman/env-ci";

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

    let extendPath: string;
    // eslint-disable-next-line prefer-const
    ({ extends: extendPath, ...options } = options);

    if (extendPath)
    {   //
        // If `extends` is defined, load and merge shareable config with `options`
        //
        const extendsOpts = require(resolveFrom.silent(__dirname, extendPath) || resolveFrom(cwd, extendPath));
        options =  { ...extendsOpts, ...options };
    }

    //
    // Set default options values if not defined yet
    //
    options = {
        branch: options.configFilePath ? (await defBranch(context)) : undefined,
        repo: options.configFilePath ? (await pkgRepoUrl(context)) : undefined, // || (await repoUrl(context)),
        repoType: options.configFilePath ? (await pkgRepoType(context)) : undefined,
        // eslint-disable-next-line no-template-curly-in-string
        tagFormat: "v${version}",
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
        if ({}.hasOwnProperty.call(process.env, key))
        {
            const envVar = "[$][{]\\b" + key + "\\b[}]";
            optStr = optStr.replace(new RegExp(envVar, "gmi"), process.env[key].replace(/\\/g, "\\\\"));
        }
    }
    options = JSON.parse(optStr);

    options.ciInfo = envCi({ env, cwd, repoType: options.repoType });

    return options;
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
