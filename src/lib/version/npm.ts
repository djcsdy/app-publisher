
import glob from "glob";
import { EOL } from "os";
import * as path from "path";
import { IContext, IVersionInfo } from "../../interface";
import { addEdit } from "../repo";
import { pathExists, readFile, writeFile } from "../utils/fs";
import { editFile } from "../utils/utils";


export async function getNpmFile({logger, options, cwd}: IContext)
{
    return new Promise<string>(async (resolve, reject) =>
    {
        if (options.projectFileNpm && await pathExists(options.projectFileNpm)) {
            resolve(options.projectFileNpm);
            return;
        }

        if (await pathExists("package.json")) {
            resolve("package.json");
            return;
        }

        glob("**/package.json", { nocase: true, ignore: "node_modules/**", cwd }, async (err, files) =>
        {
            if (err) {
                logger.error("package.json");
                reject(err);
            }
            else {
                if (files.length > 1) {
                    logger.warn("Multiple package.json files were found");
                    logger.warn("You can set the specific file via the 'projectFileNpm' .publishrc property");
                }
                for (const f of files)
                {
                    const name = require(path.join(cwd, f)).name;
                    if (name !== options.projectName)
                    {
                        if (files.length > 1) {
                            logger.warn("Using : " + f);
                        }
                        resolve(f);
                        return;
                    }
                }
                resolve(undefined);
            }
        });
    });
}


export async function getNpmVersion(context: IContext): Promise<IVersionInfo>
{
    let version = "";
    const {logger, cwd} = context,
          file = await getNpmFile(context);

    if (file)
    {
        logger.log(`Retrieving version from ${file}`);
        version = JSON.parse(await readFile(path.join(cwd, file))).version;
        if (version) { logger.log("   Found version      : " + version); }
        else { logger.warn("   Not found"); }
    }

    return { version, system: "semver", info: undefined };
}


export async function setNpmVersion(context: IContext, recordEditOnly: boolean)
{
    let modified = false;
    const {options, nextRelease, logger, cwd} = context,
          file = await getNpmFile(context);

    if (file)
    {
        const packageJson = JSON.parse(await readFile(path.join(cwd, file))),
              packageJsonDir = path.dirname(path.join(cwd, file)),
              packageLockFile = path.join(packageJsonDir, "package-lock.json"),
              packageLockFileExists = await pathExists(packageLockFile),
              packageLockJson = packageLockFileExists ? JSON.parse(await readFile(packageLockFile)) : undefined;
        //
        // If this is '--task-revert', all we're doing here is collecting the paths of the
        // files that would be updated in a run
        //
        if (recordEditOnly) {
            await addEdit(context, file);
            if (packageLockFileExists) {
                await addEdit(context, file.replace("package.json", "package-lock.json"));
            }
            return;
        }

        if (nextRelease.version !== packageJson.version)
        {
            logger.log(`Setting version ${nextRelease.version} in ${file}`);
            packageJson.version = nextRelease.version;
            if (packageLockJson) {
                packageLockJson.version = nextRelease.version;
            }
            modified = true;
        }
        else {
            logger.warn(`Version ${nextRelease.version} already set in ${file}`);
        }

        //
        // Scope/name - package.json
        //
        if (!options.npmScope) {
            const defaultName = packageJson.name;
            if (defaultName.includes("@") && defaultName.includes("/")) {
                options.npmScope = defaultName.substring(0, defaultName.indexOf("/"));
            }
        }

        if (modified) {
            await writeFile(file, JSON.stringify(packageJson, undefined, 4) + EOL);
            logger.log(`   Set version        : ${nextRelease.version} (package.json)`);
            if (packageLockFileExists)
            {
                await writeFile(packageLockFile, JSON.stringify(packageLockJson, undefined, 4) + EOL);
                logger.log(`   Set version        : ${nextRelease.version} (package-lock.json)`);
            }
        }
        else {
            logger.warn("   Version was not set");
        }

        //
        // Allow manual modifications to package.json and package-lock.json
        //
        await editFile(context, file);
        if (packageLockFileExists) {
            await editFile(context, packageLockFile);
        }
    }
}
