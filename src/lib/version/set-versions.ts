
import * as path from "path";
import { pathExists, readFile, replaceInFile, writeFile } from "../utils/fs";
import { editFile, isString } from "../utils/utils";
import { setAppPublisherVersion } from "./app-publisher";
import { setDotNetVersion } from "./dotnet";
import { setExtJsVersion } from "./extjs";
import { setMakefileVersion } from "./makefile";
import { setMantisBtVersion } from "./mantisbt";
import { setPomVersion } from "./pom";
import { setNpmVersion } from "./npm";
import { IContext } from "../../interface";
import { EOL } from "os";
import { addEdit } from "../repo";
import json5 from "json5";

export = setVersions;


/**
 * Sets all versions in all fiels.
 *
 * @since 2.8.0
 *
 * @param context context
 */
async function setVersions(context: IContext, recordEditOnly = false): Promise<void>
{
    //
    // NPM managed project, update package.json if required
    //
    await setNpmVersion(context, recordEditOnly);
    //
    // AppPublisher publishrc version
    //
    await setAppPublisherVersion(context, recordEditOnly);
    //
    // ExtJs build
    //
    await setExtJsVersion(context, recordEditOnly);
    //
    // Maven managed project, update pom.xml if required
    //
    await setPomVersion(context, recordEditOnly);
    //
    // Mantisbt plugin project, update main plugin file if required
    //
    await setMantisBtVersion(context, recordEditOnly);
    //
    // C project, update main rc file if required
    //
    await setMakefileVersion(context, recordEditOnly);
    //
    // If this is a .NET build, update assemblyinfo file
    // Search root dir and one level deep.  If the assembly file is located deeper than 1 dir
    // from the root dir, it should be specified using the versionFiles arry of .publishrc
    //
    // $AssemblyInfoLoc = Get-ChildItem -Name -Recurse -Depth 1 -Filter "assemblyinfo.cs" -File -Path . -ErrorAction SilentlyContinue
    // if ($AssemblyInfoLoc -is [system.string] && ![string]::IsNullOrEmpty($AssemblyInfoLoc))
    // {
    await setDotNetVersion(context, recordEditOnly);
    // }
    // else if ($AssemblyInfoLoc -is [System.Array] && $AssemblyInfoLoc.Length -gt 0) {
    //    foreach ($AssemblyInfoLocFile in $AssemblyInfoLoc) {
    //        Set-DotNetBuild $AssemblyInfoLocFile
    //    }
    // }
    //
    // Version bump specified files in publishrc config 'versionFiles'
    //
    await setVersionFiles(context, recordEditOnly);
}


async function setVersionFiles(context: IContext, recordEditOnly: boolean): Promise<void>
{
    const { options, logger, nextRelease, lastRelease, cwd } = context;

    if (!options.versionFiles || options.versionFiles.length === 0) {
        return;
    }

    //
    // If this is '--task-revert', all we're doing here is collecting the paths of the files
    // that would be updated in a run, don't actually do the update.  So we don't need to
    // look at any version stuff.
    //
    if (!recordEditOnly)
    {
        logger.log("Update 'versionFiles' specified version files");
        logger.log("   # of definitions : " + options.versionFiles.length);
        if (options.verbose) {
            context.stdout.write("Definitions:" + EOL);
            context.stdout.write(JSON.stringify(options.versionFiles, undefined, 2) + EOL);
        }
    }

    //
    // Loop through all specified files and replace version number
    //
    //     "versionFiles": [{
    //         "path": "..\\..\\install\\GEMS2_64bit.nsi",
    //         "regex": "!define +BUILD_LEVEL +VERSION",
    //         "regexVersion": "[0-9a-zA-Z\\.\\-]{5,}",
    //         "regexWrite": "!define BUILD_LEVEL      \"VERSION\"",
    //     },
    //     {
    //         "path": "..\\svr\\assemblyinfo.cs",
    //         "regex": "AssemblyVersion *\\(VERSION",
    //         "regexVersion": "[0-9]+\\.[0-9]+\\.[0-9]+",
    //         "regexWrite": "AssemblyVersion\\(VERSION",
    //         "versionInfo": {
    //             "system": "semver"
    //         },
    //         "setFiles": [{
    //             "path": "app.json",
    //             "regex": "\"svrVersion\" *: *\"VERSION\"",
    //             "regexVersion": "[0-9a-zA-Z\\.\\-]{5,}",
    //             "regexWrite": "\"svrVersion\": \"VERSION\"",
    //             "versionInfo": {
    //                 "system": "semver"
    //             }
    //         }]
    //     }]
    //

    for (const versionFileDef of options.versionFiles)
    {
        let tvFile = versionFileDef.path;

        tvFile = tvFile.replace(/\$\(VERSION\)/g, nextRelease.version)
                        .replace(/\$\(NEXTVERSION\)/g, nextRelease.version)
                        .replace(/\$\(LASTVERSION\)/g, lastRelease.version);

        if (await pathExists(tvFile))
        {
            let matched = false;

            logger.log(`Processing versionFile definition for '${tvFile}'`);
            //
            // If this definition has defined 'setFiles', then this base file is references another
            // build's version.  The function here is to extract the version # from the specified base
            // file, then update the files specified by 'setFiles' with that extracted version.
            //
            if (versionFileDef.setFiles)
            {
                let match: RegExpExecArray,
                    version: string,
                    regexPattern: string,
                    content: string,
                    regex: RegExp;

                if (path.basename(tvFile) === "package.json" || path.basename(tvFile) === "app.json")
                {
                    version = json5.parse(await readFile(path.join(cwd, tvFile))).version;
                }
                else
                {
                    regexPattern = versionFileDef.regex.replace(new RegExp("\\$\\(VERSION\\)", "g"), `(${versionFileDef.regexVersion})`)
                                                       .replace(new RegExp(`\\(\\(${versionFileDef.regexVersion.replace(/\./g, "\\.")}\\)\\)`, "g"),
                                                                `(${versionFileDef.regexVersion})`);
                    content = await readFile(tvFile);
                    regex = new RegExp(regexPattern, "gm");
                    if ((match = regex.exec(content)) !== null)
                    {
                        version = match[1];
                    }
                }
                if (version)
                {
                    logger.log(`   Read custom version ${version} from ${tvFile}`);
                    logger.log("   Process 'setFiles'");

                    for (const sf of versionFileDef.setFiles) {
                        if (await pathExists(sf.path))
                        {   //
                            // If this is '--task-revert', all we're doing here is collecting the paths of
                            // the files that would be updated in a run, don't actually do the update
                            //
                            if (recordEditOnly) {
                                await addEdit(context, sf.path);
                                continue;
                            }
                            if (!sf.regex && !sf.regexWrite && path.basename(sf.path) === "package.json")
                            {
                                const jso = json5.parse(await readFile(path.join(cwd, tvFile)));
                                jso.version = version;
                                logger.log(`   Writing version to '${sf.path}'`);
                                await writeFile(sf.path, JSON.stringify(jso, undefined, 4));
                            }
                            else
                            {
                                const regexWrite = sf.regexWrite.replace(new RegExp("\\$\\(VERSION\\)", "g"), version);
                                regexPattern = sf.regex.replace(new RegExp("\\$\\(VERSION\\)", "g"), `(${sf.regexVersion})`)
                                                       .replace(new RegExp(`\\(\\(${sf.regexVersion.replace(/\./g, "\\.")}\\)\\)`, "g"),
                                                                `(${sf.regexVersion})`);
                                logger.log(`   Writing custom version string to '${sf.path}':`);
                                logger.log(`      ${regexWrite}`);
                                await replaceInFile(sf.path, regexPattern, regexWrite);
                            }
                            await editFile(context, sf.path);
                            matched = true;
                        }
                    }
                }
            }
            else {
                if (path.basename(tvFile) === "package.json")
                {
                    const jso = json5.parse(await readFile(path.join(cwd, tvFile)));
                    jso.version = nextRelease.version;
                    await writeFile(tvFile, JSON.stringify(jso, undefined, 4));
                    await editFile(context, tvFile);
                    matched = true;
                }
                else {
                    const regexWrite = versionFileDef.regexWrite.replace(new RegExp("\\$\\(VERSION\\)", "g"), nextRelease.version),
                          regexPattern = versionFileDef.regex.replace(new RegExp("\\$\\(VERSION\\)", "g"), `(${versionFileDef.regexVersion})`)
                                                              .replace(new RegExp(`\\(\\(${versionFileDef.regexVersion.replace(/\./g, "\\.")}\\)\\)`, "g"),
                                                                       `(${versionFileDef.regexVersion})`),
                          content = await readFile(tvFile),
                          regex = new RegExp(regexPattern, "gm");
                    if (regex.test(content))
                    {   //
                        // If this is '--task-revert', all we're doing here is collecting the paths of
                        // the files that would be updated in a run, don't actually do the update
                        //
                        if (recordEditOnly) {
                            await addEdit(context, tvFile);
                            continue;
                        }
                        logger.log(`   Writing new version ${nextRelease.version} to '${tvFile}'`);
                        await replaceInFile(tvFile, regexPattern, regexWrite);
                        await editFile(context, tvFile);
                        matched = true;
                    }
                }
            }

            if (!matched && !recordEditOnly) {
                logger.error("   Not found (no match)");
                throw new Error("Local version file validation failed");
            }
        }
    }
}
