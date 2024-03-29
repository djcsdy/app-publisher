

import * as path from "path";
import glob = require("glob");
import semver from "semver";
import { IContext, IVersionInfo } from "../../interface";
import { addEdit, isIgnored } from "../repo";
import { replaceInFile, pathExists } from "../utils/fs";
import { editFile, getVersionSystem } from "../utils/utils";


async function getFiles(cwd: string, logger: any)
{
    return new Promise<string[]>((resolve, reject) =>
    {
        glob("**/.publishrc*", { nocase: true, ignore: "node_modules/**", cwd }, (err, files) =>
        {
            if (err) {
                logger.error("Error tring to find publishrc files");
                throw err;
            }
            else {
                resolve(files);
            }
        });
    });
}


export function getAppPublisherVersion({options, logger}: IContext): IVersionInfo
{
    const version = options.projectVersion;
    if (version)
    {
        logger.log("Retrieving version from .publishrc");
        if (version) { logger.log("   Found version      : " + version); }
        else { logger.warn("   Not found"); }
    }
    return { version, system: getVersionSystem(version), info: undefined };
}


export async function setAppPublisherVersion(context: IContext, recordEditOnly: boolean)
{
    let files: string[] = [];
    const {nextRelease, options, logger, cwd} = context;

    if (!options.projectVersion) {
        return;
    }

    files = await getFiles(cwd, logger);
    if (!files || files.length === 0) {
        return files;
    }
    for (const file of files)
    {
        if (await pathExists(file) && !(await isIgnored(context, file)))
        {   //
            // If this is '--task-revert', all we're doing here is collecting the paths of the
            // files that would be updated in a run, don't actually do the update
            //
            if (recordEditOnly) {
                await addEdit(context, file);
                continue;
            }
            logger.log(`Setting version ${nextRelease.version} in ` + file);
            await replaceInFile(file, "\"projectVersion\"( *):( *)[\"][0-9a-z.\-]+", (m: RegExpExecArray) => {
                return `"projectVersion"${m[1] || ""}:${m[2] || ""}"${nextRelease.version}`;
            });
            //
            // Allow manual modifications to mantisbt main plugin file and commit to modified list
            //
            await editFile(context, file);
        }
    }

    return files;
}
