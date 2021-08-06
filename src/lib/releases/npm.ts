
import * as path from "path";
import { pick } from "lodash";
import { IContext } from "../../interface";
import { addEdit, revert } from "../repo";
import { createDir, pathExists, readFile, writeFile } from "../utils/fs";
import { checkExitCode } from "../utils/utils";
import { getNpmFile, setNpmVersion } from "../version/npm";
import { EOL } from "os";
const execa = require("execa");


export let defaultBugs: string;
export let defaultBugsEmail: string;
export let defaultHomePage: string;
export let defaultName: string;
export let defaultRepo: string;
export let defaultRepoType: string;
export let defaultScope: string;
export let defaultNameWoScope: string;


export async function doNpmRelease(context: IContext)
{
    const {options, logger, nextRelease, cwd, env} = context,
          file = await getNpmFile(context);

    logger.log("Starting NPM release");

    if (file)
    {
        let proc: any;
        //
        // Pack tarball and mvoe to dist dir if specified
        //
        if (options.npmPackDist === "Y" && defaultName && defaultNameWoScope)
        {
            let tmpPkgFile: string, destPackedFile: string, doAddEdit = true;

            logger.log("Performing NPM pack, npmPackDist=Y");
            let proc = await execa("npm", ["pack"], {cwd, env});
            checkExitCode(proc.code, logger);

            if (!(await pathExists(options.distReleasePathSrc)))
            {
                logger.log("Creating local dist directory and adding to version control");
                await createDir(options.distReleasePathSrc);
                await addEdit(context, options.distReleasePathSrc);
                doAddEdit = false;
            }

            if (!options.configName) {
                destPackedFile = path.join(options.distReleasePathSrc, `${defaultNameWoScope}.tgz`);
            }
            else {
                destPackedFile = path.join(options.distReleasePathSrc, `${defaultNameWoScope}-${options.configName}.tgz`);
            }
            if (options.npmScope || defaultScope) {
                tmpPkgFile = `${options.npmScope || defaultScope}-${defaultNameWoScope}-${nextRelease.version}.tgz`.substring(1);
            }
            else {
                tmpPkgFile = `${defaultName}-${nextRelease.version}.tgz`;
            }
            //
            // Move file
            //
            logger.log("Moving package:");
            logger.log("   " + tmpPkgFile);
            logger.log("To:");
            logger.log("   " + destPackedFile);

            if (process.platform === "win32") {
                proc = await execa.shell(`move /Y "${tmpPkgFile}" "${destPackedFile}"`, {cwd, env});
            }
            else {
                proc = await execa.shell(`mv -f "${tmpPkgFile}" "${destPackedFile}"`, {cwd, env});
            }
            checkExitCode(proc.code, logger);
            //
            // Track modified file
            //
            if (doAddEdit) {
                await addEdit(context, destPackedFile);
            }
        }
        else if (!defaultName || !defaultNameWoScope) {
            logger.warn("The npmPackDist step failed, default names not set by NPM setJson step");
        }
        //
        // Publish to npm server
        //
        if (!options.dryRun)
        {
            if (options.npmRegistry) {
                logger.log("Publishing npm package to " + options.npmRegistry);
                proc = await execa("npm", [ "publish", "--registry", options.npmRegistry]);
            }
            else {
                logger.log("Publishing npm package to default registry");
                proc = await execa("npm", [ "publish" ]);
            }
        }
        else
        {
            if (options.npmRegistry) {
                logger.log("Dry Run - Publishing npm package to " + options.npmRegistry);
                proc = await execa("npm", [ "publish", "--registry", options.npmRegistry, "--dry-run"]);
            }
            else {
                logger.log("Dry Run - Publishing npm package to default registry");
                proc = await execa("npm", [ "publish", "--dry-run"]);
            }
        }
        checkExitCode(proc.code, logger, true);
    }
    else {
        logger.warn("Could not find package.json");
    }
}


export async function setPackageJson(context: IContext)
{
    let modified = false;
    const {options, logger, cwd} = context;

    if (options.taskMode && !options.taskNpmRelease && !options.taskNpmJsonUpdate && !options.taskVersionUpdate) {
        return modified;
    }

    const file = await getNpmFile(context);
    if (!file) {
        return modified;
    }

    const packageJson = JSON.parse(await readFile(path.join(cwd, file))),
          packageJsonDir = path.dirname(path.join(cwd, file)),
          packageLockFile = path.join(packageJsonDir, "package-lock.json"),
          packageLockFileExists = await pathExists(packageLockFile),
          packageLockJson = packageLockFileExists ? JSON.parse(await readFile(packageLockFile)) : undefined;

    //
    // Check for properties that have to exist in package.json in order to proceed
    //
    if (!packageJson.name) {
        return modified;
    }

    //
    // Repository
    //
    if (options.repo && packageJson.repository && packageJson.repository.url && options.repo !== packageJson.repository.url)
    {
        logger.log("Setting repository in package.json");
        defaultRepo = packageJson.repository.url;
        logger.log("Repository: " + defaultRepo);
        logger.log("Setting repository in package.json: " + options.repo);
        packageJson.repository.url = options.repo;
        modified = true;
    }

    //
    // Repository Type
    //
    if (options.repoType && packageJson.repository && packageJson.repository.type && options.repoType !== packageJson.repository.type)
    {
        logger.log("Setting repository type in package.json");
        defaultRepoType = packageJson.repository.type;
        logger.log("Repository Type: " + defaultRepoType);
        logger.log("Setting repository type in package.json: " + options.repoType);
        packageJson.repository.type = options.repoType;
        modified = true;
    }

    //
    // Home Page
    //
    if (options.homePage && packageJson.homepage && options.homePage !== packageJson.homepage)
    {
        logger.log("Setting homepage in package.json");
        defaultHomePage = packageJson.homepage;
        logger.log("Homepage: " + defaultHomePage);
        logger.log("Setting homepage in package.json: " + options.homePage);
        packageJson.homepage = options.homePage;
        modified = true;
    }

    //
    // Bugs Page
    //
    if (options.bugs && packageJson.bugs && packageJson.bugs.url && options.bugs !== packageJson.bugs.url)
    {
        logger.log("Setting bugs page in package.json");
        defaultBugs = packageJson.bugs.url;
        logger.log("Bugs page: " + defaultBugs);
        logger.log("Setting bugs page in package.json: " + options.bugs);
        packageJson.bugs.url = options.bugs;
        modified = true;
    }

    //
    // Bugs Email
    //
    if (options.testEmailRecip && packageJson.bugs && packageJson.bugs.email && options.testEmailRecip !== packageJson.bugs.email)
    {
        logger.log("Setting bugs email in package.json");
        defaultBugsEmail = packageJson.bugs.email;
        logger.log("Bugs email: " + defaultBugsEmail);
        logger.log("Setting bugs email in package.json: " + options.testEmailRecip);
        packageJson.bugs.email = options.testEmailRecip;
        modified = true;
    }

    //
    // Scope/name - package.json
    //
    defaultName = packageJson.name;
    if (defaultName.startsWith("@") && defaultName.includes("/")) {
        defaultScope = defaultName.substring(0, defaultName.indexOf("/"));
        defaultNameWoScope = defaultName.substring(defaultName.indexOf("/") + 1);
    }
    else {
        defaultNameWoScope = defaultName;
    }

    if (options.npmScope && defaultScope && defaultNameWoScope)
    {
        if (!defaultName.includes(options.npmScope))
        {
            const name = options.npmScope + "/" + defaultNameWoScope;
            logger.log(`Setting package name in package.json: ${name}`);
            packageJson.name = name;
            //
            // package-lock.json
            //
            if (packageLockFileExists)
            {
                logger.log(`Setting package name in package-lock.json: ${name}`);
                packageLockJson.name = name;
            }
            modified = true;
        }
    }

    if (modified) {
        await writeFile(file, JSON.stringify(packageJson, undefined, 4) + EOL);
        await addEdit(context, file);
        if (packageLockFileExists)
        {
            await writeFile(packageLockFile, JSON.stringify(packageLockJson, undefined, 4) + EOL);
            await addEdit(context, packageLockFile);
        }
    }

    return modified;
}


export async function restorePackageJson(context: IContext)
{
    const {options, logger, cwd} = context;

    if (options.taskMode && !options.taskNpmRelease && !options.taskNpmJsonRestore && !options.taskVersionUpdate) {
        return;
    }

    let modified = false;
    const file = await getNpmFile(context);
    if (!file) {
        return;
    }


    //
    // If 'restore' task, we probably need to use vcs revert and then re-update the version
    // number since the property values that were replaced won't exist in memory whe
    // update/restore isnt donein the same run.
    //
    if (options.taskNpmJsonRestore)
    {
        if (!defaultName)
        {
            logger.log("Reset default props in package.json with vcs reversion, reset version number");
            await revert(context, [{
                type: "M",
                path: "package.json"
            }]);
            await setNpmVersion(context, false);
            return;
        }
    }

    const packageJson = JSON.parse(await readFile(path.join(cwd, file))),
          packageJsonDir = path.dirname(path.join(cwd, file)),
          packageLockFile = path.join(packageJsonDir, "package-lock.json"),
          packageLockFileExists = await pathExists(packageLockFile),
          packageLockJson = packageLockFileExists ? JSON.parse(await readFile(packageLockFile)) : undefined;
    //
    // Set repo
    //
    if (defaultRepo)
    {
        logger.log(`Reset default repo in package.json: ${defaultRepo}`);
        packageJson.repository.url = defaultRepo;
        modified = true;
    }

    //
    // Set repo type
    //
    if (defaultRepoType)
    {
        logger.log(`Reset default repo in package.json: ${defaultRepoType}`);
        packageJson.repository.type = defaultRepoType;
        modified = true;
    }

    //
    // Set bugs page
    //
    if (defaultBugs)
    {
        logger.log(`Reset default bugs page in package.json: ${defaultBugs}`);
        packageJson.bugs.url = defaultBugs;
        modified = true;
    }

    //
    // Set bugs email
    //
    if (defaultBugsEmail)
    {
        logger.log(`Reset default bugs email in package.json: ${defaultBugsEmail}`);
        packageJson.bugs.email = defaultBugsEmail;
        modified = true;
    }

    //
    // Set homepage
    //
    if (defaultHomePage)
    {
        logger.log("Reset default home page in package.json: " + defaultHomePage);
        packageJson.homepage = defaultHomePage;
        modified = true;
    }

    //
    // Scope/name - package.json
    //
    if (defaultName && options.npmScope && !defaultName.includes(options.npmScope))
    {
        logger.log("Reset default package name in package.json: " + defaultName);
        packageJson.name = defaultName;
        modified = true;
        //
        // package-lock.json
        //
        if (packageLockFileExists)
        {
            logger.log("Reset default package name in package-lock.json: " + defaultName);
            packageLockJson.name = defaultName;
        }
        modified = true;
    }

    if (modified) {
        await writeFile(file, JSON.stringify(packageJson, undefined, 4) + EOL);
        // await addEdit(context, file);
        if (packageLockFileExists)
        {
            await writeFile(packageLockFile, JSON.stringify(packageLockJson, undefined, 4) + EOL);
            // await addEdit(context, packageLockFile);
        }
    }
}
